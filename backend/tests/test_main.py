from datetime import date, datetime, time, timezone


from app.main import normalize_actuals, normalize_forecasts, parse_records


def test_parse_records_accepts_list_and_data_envelope():
    rows = [{"generation": 123}]
    assert parse_records(rows) == rows
    assert parse_records({"data": rows}) == rows
    assert parse_records({"unexpected": rows}) == []


def test_normalize_actuals_averages_only_complete_wind_hours():
    records = [
        {"fuelType": "WIND", "startTime": "2026-01-01T00:00:00Z", "generation": 100},
        {"fuelType": "WIND", "startTime": "2026-01-01T00:30:00Z", "generation": 200},
        # Incomplete hour: it must not be treated as a full-hour average.
        {"fuelType": "WIND", "startTime": "2026-01-01T01:00:00Z", "generation": 300},
        # A different fuel type must never be included in wind actuals.
        {"fuelType": "CCGT", "startTime": "2026-01-01T01:30:00Z", "generation": 999},
    ]
    result = normalize_actuals(records, date(2026, 1, 1), date(2026, 2, 1))
    assert len(result) == 1
    assert result.iloc[0]["actual"] == 150


def test_normalize_forecasts_selects_latest_vintage_before_cutoff():
    records = [
        {"startTime": "2026-01-02T12:00:00Z", "publishTime": "2025-12-31T08:00:00Z", "generation": 1000},
        {"startTime": "2026-01-02T12:00:00Z", "publishTime": "2026-01-01T09:00:00Z", "generation": 1200},
        # Published after the D-1 cutoff (09:20 UK, which is UTC in January).
        {"startTime": "2026-01-02T12:00:00Z", "publishTime": "2026-01-01T09:30:00Z", "generation": 1400},
    ]
    result = normalize_forecasts(records, date(2026, 1, 1), date(2026, 2, 1), time(9, 20))
    assert len(result) == 1
    assert result.iloc[0]["forecast"] == 1200
    assert result.iloc[0]["publish"] == datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)


def test_normalize_forecasts_ignores_delivery_outside_selected_month():
    records = [
        {"startTime": "2026-02-01T00:00:00Z", "publishTime": "2026-01-31T09:00:00Z", "generation": 1200},
    ]
    result = normalize_forecasts(records, date(2026, 1, 1), date(2026, 2, 1), time(9, 20))
    assert result.empty
