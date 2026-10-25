from __future__ import annotations

import asyncio
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

API_ROOT = "https://data.elexon.co.uk/bmrs/api/v1"
LONDON = ZoneInfo("Europe/London")
CACHE: dict[str, tuple[datetime, dict]] = {}
CACHE_TTL = timedelta(minutes=5)

app = FastAPI(title="Gridbricks Wind Desk API", version="1.0.0")


def parse_records(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("data", "result", "records"):
            if isinstance(payload.get(key), list):
                return payload[key]
    return []


def as_utc(value):
    if not value:
        return None
    stamp = pd.to_datetime(value, utc=True, errors="coerce")
    return None if pd.isna(stamp) else stamp.to_pydatetime()


async def fetch_dataset(client, dataset, start, end):
    params = {
        "publishDateTimeFrom": start.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "publishDateTimeTo": end.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    response = await client.get(f"{API_ROOT}/datasets/{dataset}/stream", params=params)
    response.raise_for_status()
    return parse_records(response.json())


def field(record, *names):
    lower = {str(k).lower(): v for k, v in record.items()}
    for name in names:
        if name.lower() in lower:
            return lower[name.lower()]
    return None


def normalize_actuals(records, month_start, month_end):
    half_hours = []
    for item in records:
        fuel = str(field(item, "fuelType", "fueltype") or "").upper()
        # FUELHH contains multiple fuel types. Never infer a wind record merely
        # because a generation value exists: require WIND (or a wind-specific field).
        wind_value = field(item, "wind")
        if fuel != "WIND" and wind_value is None:
            continue
        start = as_utc(field(item, "startTime", "startTimeOfHalfHrPeriod"))
        value = field(item, "generation") if fuel == "WIND" else wind_value
        if start is None and field(item, "settlementDate") is not None:
            day = date.fromisoformat(str(field(item, "settlementDate"))[:10])
            period = int(field(item, "settlementPeriod") or 0)
            if period > 0:
                start = (datetime.combine(day, time.min, tzinfo=LONDON) + timedelta(minutes=30 * (period - 1))).astimezone(timezone.utc)
                value = field(item, "WIND", "wind")
        if start is None or value is None:
            continue
        try:
            half_hours.append({"start": start, "actual": float(value)})
        except (TypeError, ValueError):
            continue
    if not half_hours:
        return pd.DataFrame(columns=["start", "actual"])
    raw = pd.DataFrame(half_hours).drop_duplicates("start", keep="last")
    raw["hour"] = raw["start"].map(lambda stamp: stamp.replace(minute=0, second=0, microsecond=0))
    hourly = raw.groupby("hour", as_index=False).agg(actual=("actual", "mean"), half_hour_count=("actual", "count"))
    # Only compare complete hourly buckets; one half-hour must not stand in for an hour.
    hourly = hourly[hourly["half_hour_count"] == 2].rename(columns={"hour": "start"})
    hourly["local_day"] = hourly["start"].map(lambda stamp: stamp.astimezone(LONDON).date())
    hourly = hourly[(hourly["local_day"] >= month_start) & (hourly["local_day"] < month_end)]
    return hourly[["start", "actual"]]


def normalize_forecasts(records, month_start, month_end, cutoff):
    rows = []
    for item in records:
        start = as_utc(field(item, "startTime"))
        publish = as_utc(field(item, "publishTime"))
        value = field(item, "generation")
        if start is None or publish is None or value is None:
            continue
        delivery_day = start.astimezone(LONDON).date()
        if not (month_start <= delivery_day < month_end):
            continue
        decision_at = datetime.combine(delivery_day - timedelta(days=1), cutoff, tzinfo=LONDON).astimezone(timezone.utc)
        if publish > decision_at:
            continue
        try:
            rows.append({"start": start, "publish": publish, "forecast": float(value)})
        except (TypeError, ValueError):
            continue
    if not rows:
        return pd.DataFrame(columns=["start", "publish", "forecast"])
    frame = pd.DataFrame(rows).sort_values(["start", "publish"])
    return frame.drop_duplicates("start", keep="last")


def finite_number(value):
    return None if pd.isna(value) else round(float(value), 2)


async def build_analysis(month, cutoff_text):
    month_start = date.fromisoformat(f"{month}-01")
    month_end = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
    cutoff = time.fromisoformat(cutoff_text)
    key = f"{month}:{cutoff_text}"
    now = datetime.now(timezone.utc)
    cached = CACHE.get(key)
    if cached and now - cached[0] < CACHE_TTL:
        return cached[1]

    publish_start = datetime.combine(month_start - timedelta(days=1), time.min, tzinfo=LONDON).astimezone(timezone.utc)
    publish_end = datetime.combine(month_end + timedelta(days=1), time.min, tzinfo=LONDON).astimezone(timezone.utc)
    async with httpx.AsyncClient(timeout=90.0, headers={"User-Agent": "Gridbricks-Wind-Desk/1.0"}) as client:
        try:
            actual_records, forecast_records = await asyncio.gather(
                fetch_dataset(client, "FUELHH", publish_start, publish_end),
                fetch_dataset(client, "WINDFOR", publish_start, publish_end),
            )
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=502, detail=f"Elexon returned HTTP {exc.response.status_code} for {exc.request.url.path}.") from exc
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(status_code=502, detail=f"Could not retrieve Elexon data: {exc}") from exc

    actuals = normalize_actuals(actual_records, month_start, month_end)
    forecasts = normalize_forecasts(forecast_records, month_start, month_end, cutoff)
    merged = forecasts.merge(actuals, on="start", how="outer", indicator=True)
    merged["error"] = merged["forecast"] - merged["actual"]
    matched = merged.dropna(subset=["forecast", "actual"]).copy()
    matched["error"] = matched["forecast"] - matched["actual"]
    errors = matched["error"]
    expected = (month_end - month_start).days * 24
    daily = []
    if not merged.empty:
        merged["day"] = merged["start"].map(lambda x: x.astimezone(LONDON).date().isoformat())
        for day, group in merged.groupby("day", sort=True):
            g = group.dropna(subset=["forecast", "actual"])
            daily.append({
                "date": day,
                "forecast": finite_number(g["forecast"].mean()),
                "actual": finite_number(g["actual"].mean()),
                "mae": finite_number(g["forecast"].sub(g["actual"]).abs().mean()),
                "matched": int(len(g)),
            })
    rows = []
    for item in merged.sort_values("start").to_dict("records"):
        start = item.get("start")
        rows.append({
            "startTime": start.astimezone(LONDON).isoformat() if start else None,
            "forecast": finite_number(item.get("forecast")),
            "actual": finite_number(item.get("actual")),
            "error": finite_number(item.get("error")),
            "publishTime": item["publish"].astimezone(LONDON).isoformat() if item.get("publish") else None,
        })
    payload = {
        "month": month,
        "cutoff": cutoff_text,
        "timezone": "Europe/London",
        "resolution": "Hourly; complete pairs of half-hourly FUELHH actuals averaged to match WINDFOR forecast grain.",
        "forecastSelection": "Latest WINDFOR publication at or before the selected UK-local D-1 cutoff for each delivery hour.",
        "sources": {"actuals": "Elexon FUELHH", "forecasts": "Elexon WINDFOR"},
        "metrics": {
            "mae": finite_number(errors.abs().mean()),
            "rmse": finite_number(errors.pow(2).mean() ** 0.5) if len(errors) else None,
            "bias": finite_number(errors.mean()),
            "matchedIntervals": int(len(matched)),
            "expectedIntervals": expected,
            "actualIntervals": int(actuals["start"].nunique()),
            "forecastIntervals": int(forecasts["start"].nunique()),
            "coveragePct": round(100 * len(matched) / expected, 1) if expected else 0,
            "missingActual": int(merged["actual"].isna().sum()),
            "missingForecast": int(merged["forecast"].isna().sum()),
        },
        "daily": daily,
        "intervals": rows,
        "fetchedAt": now.isoformat(),
    }
    CACHE[key] = (now, payload)
    return payload


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "Gridbricks Wind Desk", "upstream": API_ROOT}


@app.get("/api/analysis")
async def analysis(month: str = Query("2026-01", pattern=r"^\d{4}-\d{2}$"), cutoff: str = Query("09:20", pattern=r"^\d{2}:\d{2}$")):
    try:
        time.fromisoformat(cutoff)
        return await build_analysis(month, cutoff)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Month or cutoff time is invalid.") from exc


static_path = Path(__file__).resolve().parents[1] / "static"
if static_path.exists():
    app.mount("/assets", StaticFiles(directory=static_path / "assets"), name="assets")

    @app.get("/{path:path}")
    async def frontend(path: str):
        target = static_path / path
        if target.is_file() and static_path in target.parents:
            return FileResponse(target)
        return FileResponse(static_path / "index.html")


