import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildMonthlyGrowthRows,
  type ChartValueMode,
  formatCompactNumber,
  formatPercent,
  getCountrySeriesKey,
  getLineColor,
  sumCommodityValues,
} from "../chartUtils";
import type { ChartRow, Dataset, Granularity } from "../types";
import CountryMultiSelect from "./CountryMultiSelect";
import EventReferenceLines from "./EventReferenceLines";
import SharedTooltip from "./SharedTooltip";
import ValueModeToggle from "./ValueModeToggle";

type CountryAggregateChartProps = {
  title: string;
  eyebrow: string;
  description: string;
  datasets: Dataset[];
};

function buildCountryRows(datasets: Dataset[]) {
  const rowsByPeriod = new Map<string, ChartRow>();

  for (const dataset of datasets) {
    const country = dataset.country ?? "Unknown";
    const seriesKey = getCountrySeriesKey(country);
    const commodityIds = dataset.commodities.map((commodity) => commodity.id);

    for (const row of dataset.rows) {
      const existing = rowsByPeriod.get(row.periodKey);
      rowsByPeriod.set(row.periodKey, {
        periodKey: row.periodKey,
        periodLabel: existing?.periodLabel ?? row.periodLabel,
        periodSort: existing?.periodSort ?? row.periodSort,
        ...existing,
        [seriesKey]: sumCommodityValues(row, commodityIds),
      });
    }
  }

  return [...rowsByPeriod.values()].sort(
    (left, right) => left.periodSort - right.periodSort,
  );
}

function getAvailableCountries(datasets: Dataset[]) {
  return [
    ...new Set(
      datasets
        .map((dataset) => dataset.country)
        .filter((country): country is string => Boolean(country)),
    ),
  ].sort();
}

function CountryAggregateChart({
  title,
  eyebrow,
  description,
  datasets,
}: CountryAggregateChartProps) {
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [valueMode, setValueMode] = useState<ChartValueMode>("value");
  const availableCountries = useMemo(
    () => getAvailableCountries(datasets),
    [datasets],
  );
  const [selectedCountries, setSelectedCountries] = useState<string[]>(
    () => availableCountries,
  );
  const visibleDatasets = useMemo(
    () =>
      datasets.filter(
        (dataset) =>
          dataset.actualGranularity === granularity &&
          selectedCountries.includes(dataset.country ?? ""),
      ),
    [datasets, granularity, selectedCountries],
  );
  const rows = useMemo(() => buildCountryRows(visibleDatasets), [visibleDatasets]);
  const countries = useMemo(
    () =>
      [...new Set(visibleDatasets.map((dataset) => dataset.country ?? "Unknown"))].sort(),
    [visibleDatasets],
  );
  const seriesKeys = useMemo(
    () => countries.map((country) => getCountrySeriesKey(country)),
    [countries],
  );
  const effectiveValueMode =
    granularity === "monthly" ? valueMode : "value";
  const displayRows = useMemo(() => {
    if (effectiveValueMode === "monthlyGrowth") {
      return buildMonthlyGrowthRows(rows, seriesKeys);
    }

    return rows;
  }, [effectiveValueMode, rows, seriesKeys]);
  const valueFormatter =
    effectiveValueMode === "monthlyGrowth" ? formatPercent : formatCompactNumber;

  return (
    <section className="chart-section" aria-label={title}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      <section className="controls controls--aggregate" aria-label={`${title} controls`}>
        <label className="field">
          <span>View</span>
          <select
            value={granularity}
            onChange={(event) => setGranularity(event.target.value as Granularity)}
          >
            <option value="monthly">Monthly imports</option>
            <option value="yearly">Yearly imports</option>
          </select>
        </label>
        <CountryMultiSelect
          countries={availableCountries}
          selectedCountries={selectedCountries}
          onChange={setSelectedCountries}
        />
        {granularity === "monthly" ? (
          <ValueModeToggle valueMode={valueMode} onChange={setValueMode} />
        ) : null}
      </section>

      <section className="chart-card" aria-label={`${title} line chart`}>
        <div className="chart-header">
          <div>
            <h2>All Commodities imports</h2>
            <p>
              Total customs value across all import commodities by country.
              {effectiveValueMode === "monthlyGrowth"
                ? " Values shown as % growth vs previous month."
                : " Values shown in US dollars."}
            </p>
          </div>
          <span className="granularity">{granularity}</span>
        </div>

        <div className="chart-wrap chart-wrap--comparison">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={displayRows}
              margin={{ top: 12, right: 32, bottom: 28, left: 24 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="periodLabel"
                interval={0}
                angle={rows.length > 8 ? -35 : 0}
                textAnchor={rows.length > 8 ? "end" : "middle"}
                height={rows.length > 8 ? 70 : 36}
                tickMargin={12}
              />
              <YAxis
                tickFormatter={(value) => valueFormatter(Number(value))}
                width={82}
              />
              <Tooltip
                content={
                  <SharedTooltip
                    valueFormatter={
                      effectiveValueMode === "monthlyGrowth" ? formatPercent : undefined
                    }
                  />
                }
              />
              <EventReferenceLines granularity={granularity} />
              {countries.map((country, index) => (
                <Line
                  key={country}
                  type="monotone"
                  dataKey={getCountrySeriesKey(country)}
                  name={`${country} imports`}
                  stroke={getLineColor(index)}
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </section>
  );
}

export default CountryAggregateChart;
