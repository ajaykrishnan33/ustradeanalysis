# US Trade Data Analysis Dashboard

An interactive dashboard for comparing US-reported imports, India-reported exports, and matched HS-code commodity time series around tariff and policy events.

## What It Shows

- US Census import data by country and HS commodity level.
- India TradeStat export data by export scope.
- US-India comparison charts for matched HS2 and HS4 commodities.
- Sector tabs with custom product baskets and drill-down charts.
- Monthly, calendar-year, and fiscal-year period views where supported.

## Data Flow

Raw source files live under `data/raw/`. The preprocessing scripts in `scripts/` generate normalized JSON files under `data/generated/`, which the Vite app loads at runtime. The extracted data covers 2024-2026(up to March).

## Data Sources

- [USA Trade Online](https://usatrade.census.gov/) for US Census import data.
- [TradeStat](https://tradestat.commerce.gov.in/) for India-reported export data.

## Commands

```sh
npm install
npm run dev
npm run build
npm run preview
```

`npm run dev` and `npm run build` both run preprocessing before starting or building the app.
