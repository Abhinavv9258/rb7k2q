# Gridbricks Wind Desk

An analyst-facing pilot for reviewing Great Britain wind forecast availability and forecast error around day-ahead procurement decisions. It uses only Elexon FUELHH actuals and WINDFOR forecast records, as required by the challenge.

## What it answers

- What wind forecast was available by the configured day-ahead decision cutoff?
- How did that forecast compare with the realised half-hourly wind outturn?
- What were MAE, RMSE, signed bias, and coverage for the selected period?

WINDFOR records inspected from Elexon are hourly while FUELHH actuals are half-hourly. The service averages each complete pair of half-hourly WIND actuals into an hourly mean to match the forecast grain; an incomplete pair is left missing. The dashboard does **not** calculate a total procurement requirement. That requires demand and other generation inputs, which are outside this challenge scope. A positive wind forecast error means forecast generation exceeded actual generation, so it may imply a larger residual load than expected.

## Forecast selection and assumptions

For each hourly delivery bucket, the service selects the latest WINDFOR record published at or before the configured decision time on the previous UK calendar day. The default is 09:20 Europe/London, aligned with EPEX SPOT's published GB 60-minute day-ahead order-book closure. Users can change the cutoff to explore another workflow. Source timestamps are parsed as UTC instants and rendered in UK local time. Missing intervals remain missing; they are never filled with zero.

This is a proxy for a decision-time forecast, not proof of the forecast used by any particular utility. Elexon's published WINDFOR release schedule and a market participant's procurement process can differ. The selected cutoff is visible throughout the UI.

## Run locally

### Docker

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and start it first. From the project root:

```bash
docker compose up --build
```

Open [http://localhost:8080](http://localhost:8080). The container serves the React app and FastAPI API through one origin. This is a local address; it is not a public deployment URL.

### Without Docker

Backend (Python 3.12):

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

### Tests

Run backend normalization and forecast-vintage tests from the `backend` directory:

```bash
python -m pytest -q
```

The tests cover response-envelope parsing, filtering non-wind fuel records, averaging only complete half-hour pairs, selecting the latest forecast available by the D-1 cutoff, and excluding delivery hours outside the selected month.

Vite proxies `/api` requests to `http://localhost:8000`.

## Project structure

```text
backend/app/       FastAPI routes, Elexon client, normalization, analytics
frontend/src/      React dashboard, chart, filters, styles, API client
Dockerfile         Multi-stage frontend build and Python runtime
docker-compose.yml One-command local deployment
pyproject.toml     Vercel Python entrypoint and frontend build hook
vercel.json        Vercel function duration configuration
vercel_build.py    Builds React and stages its static files for FastAPI
```

## API

- `GET /api/health` - service health and upstream source
- `GET /api/analysis?month=2026-01&cutoff=09:20` - matched actuals and decision-time forecasts, metrics, coverage, and daily summary

The Elexon Insights API is public and requires no API key. Results are cached in process for five minutes to avoid repeated full-month upstream requests. If the upstream API is unavailable, the UI reports an error rather than presenting generated values as real observations.

## Data quality and metric definitions

- Match key: UTC `startTime` (hourly delivery bucket).
- Forecast vintage: latest `publishTime` not later than delivery-day D-1 cutoff.
- Error: forecast minus hourly mean actual (MW).
- MAE: mean absolute error over matched, finite pairs.
- RMSE: square root of mean squared error over matched, finite pairs.
- Bias: mean signed error; positive means over-forecasting wind.
- MAPE is omitted because it becomes unstable or undefined when actual wind generation is zero or near zero.
- Coverage and unmatched counts are displayed so metrics cannot hide incomplete data.

## AI use

AI tools assisted with implementation planning, code review, and drafting tests/documentation. All upstream data assumptions, forecast-vintage selection, metric definitions, and test results should be reviewed by the submitter before delivery. The selected D-1 cutoff is an explicit configurable assumption, not a claim that every utility uses this exact decision process.

## Sources

- Elexon Insights API: https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream
- Elexon Insights API: https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream
- EPEX SPOT trading overview: https://www.epexspot.com/en/basicspowermarket

## Deploy on Vercel

The project is deployed as a single Vercel project using Vercel's Python runtime. The root `pyproject.toml` declares Python 3.12 and the backend dependencies, configures `backend.app.main:app` as the entrypoint, and runs `vercel_build.py`. That build script creates the React production bundle and places it beside the FastAPI app, so the UI and API are served from the same deployment. `vercel.json` allows the FastAPI function to run for up to 60 seconds because the initial Elexon data request can take longer than a short request.

1. Push this project to a GitHub repository. For the assignment, use the requested anonymous public repository name.
2. Sign in to [Vercel](https://vercel.com/) and choose **Add New → Project**.
3. Import the repository as one project. Set the root directory to `./` and select the **Python** preset. Do not import the `frontend` and `backend` folders as separate services.
4. Deploy. Vercel reads the Python version, dependencies, entrypoint, and build script from the root `pyproject.toml`; `vercel.json` sets the function duration.
5. Open the deployment URL and verify the dashboard, `/api/health`, and `/api/analysis?month=2026-01&cutoff=09:20`.

The current production deployment is [gridbricks-wind-desk.vercel.app](https://gridbricks-wind-desk.vercel.app/).

Alternatively, with the Vercel CLI installed and authenticated, run from the project root:

```bash
npx vercel
npx vercel --prod
```

Vercel's [Hobby plan](https://vercel.com/pricing) is free for eligible personal projects, subject to its usage limits and terms. The Vercel deployment is separate from Docker: use Docker for a local, containerized run, and Vercel for the public URL. Verify the deployment in a private/incognito window after publishing changes.
