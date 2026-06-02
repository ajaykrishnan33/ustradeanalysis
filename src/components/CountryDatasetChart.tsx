import { useEffect, useMemo, useRef, useState } from "react";
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
  buildSameMonthPreviousYearTooltipRows,
  type ChartValueMode,
  formatCompactNumber,
  formatPercent,
  getCountrySeriesKey,
  getLineColor,
  getRowValue,
} from "../chartUtils";
import { getChartTargetId, type ChartLinkProps } from "../chartLinks";
import {
  decodeGranularity,
  decodeSelection,
  decodeString,
  decodeStringArray,
  decodeValueMode,
  encodeGranularity,
  encodeSelection,
  encodeString,
  encodeStringArray,
  encodeValueMode,
  type ChartUrlState,
} from "../chartUrlState";
import type { ChartRow, Commodity, Dataset, Granularity } from "../types";
import ChartLinkButton from "./ChartLinkButton";
import CountryMultiSelect from "./CountryMultiSelect";
import EventReferenceLines from "./EventReferenceLines";
import SharedTooltip from "./SharedTooltip";
import ValueModeToggle from "./ValueModeToggle";

type CountryDatasetChartProps = {
  title: string;
  description: string;
  datasets: Dataset[];
  valueDescription: string;
  chartLink?: ChartLinkProps;
};

function seriesKey(country: string, hsCode: string) {
  return `${getCountrySeriesKey(country)}_${hsCode}`;
}

function getDataset(datasets: Dataset[], granularity: Granularity, country: string) {
  return datasets.find(
    (dataset) =>
      dataset.actualGranularity === granularity && dataset.country === country,
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

function getDefaultCountries(countries: string[]) {
  return countries.includes("India") ? ["India"] : countries.slice(0, 1);
}

function getCommodityHsCodes(commodities: Commodity[]) {
  return commodities
    .map((commodity) => commodity.hsCode)
    .filter((hsCode): hsCode is string => Boolean(hsCode));
}

function buildRows({
  datasets,
  selectedHsCodes,
}: {
  datasets: Dataset[];
  selectedHsCodes: Set<string>;
}) {
  const rowsByPeriod = new Map<string, ChartRow>();

  for (const dataset of datasets) {
    const country = dataset.country ?? "Unknown";

    for (const row of dataset.rows) {
      const period = dataset.periods.find((item) => item.key === row.periodKey);
      const existing = rowsByPeriod.get(row.periodKey);
      const nextRow: ChartRow = {
        periodKey: row.periodKey,
        periodLabel: existing?.periodLabel ?? period?.label ?? row.periodLabel,
        periodSort: existing?.periodSort ?? period?.sort ?? row.periodSort,
        ...existing,
      };

      for (const commodity of dataset.commodities) {
        if (!commodity.hsCode || !selectedHsCodes.has(commodity.hsCode)) {
          continue;
        }

        nextRow[seriesKey(country, commodity.hsCode)] =
          getRowValue(row, commodity.id) ?? 0;
      }

      rowsByPeriod.set(row.periodKey, nextRow);
    }
  }

  return [...rowsByPeriod.values()].sort(
    (left, right) => left.periodSort - right.periodSort,
  );
}

function CountryDatasetChart({
  title,
  description,
  datasets,
  valueDescription,
  chartLink,
}: CountryDatasetChartProps) {
  const availableCountries = useMemo(
    () => getAvailableCountries(datasets),
    [datasets],
  );
  const defaultCountries = useMemo(
    () => getDefaultCountries(availableCountries),
    [availableCountries],
  );
  const initialChartState = chartLink?.chartState;
  const [granularity, setGranularity] = useState<Granularity>(() =>
    decodeGranularity(initialChartState, "g"),
  );
  const [valueMode, setValueMode] = useState<ChartValueMode>(() =>
    decodeValueMode(initialChartState, "v"),
  );
  const [selectedCountries, setSelectedCountries] = useState<string[]>(() =>
    decodeStringArray(initialChartState, "c", defaultCountries, availableCountries),
  );
  const [commodityQuery, setCommodityQuery] = useState(() =>
    decodeString(initialChartState, "q"),
  );
  const initializedGranularityRef = useRef<Granularity | null>(granularity);
  const appliedChartStateKeyRef = useRef<string | undefined>(chartLink?.chartStateKey);
  const visibleDatasets = selectedCountries
    .map((country) => getDataset(datasets, granularity, country))
    .filter((dataset): dataset is Dataset => Boolean(dataset));
  const primaryCountry = selectedCountries[0];
  const primaryDataset =
    primaryCountry ? getDataset(datasets, granularity, primaryCountry) : undefined;
  const primaryCommodities = primaryDataset?.commodities ?? [];
  const defaultHsCodes = useMemo(
    () => getCommodityHsCodes(primaryCommodities),
    [primaryCommodities],
  );
  const [selectedHsCodes, setSelectedHsCodes] = useState<Set<string>>(
    () => new Set(decodeSelection(initialChartState, "hs", defaultHsCodes, defaultHsCodes)),
  );
  const filteredCommodities = useMemo(() => {
    const normalizedQuery = commodityQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return primaryCommodities;
    }

    return primaryCommodities.filter((commodity) => {
      return (
        commodity.name.toLowerCase().includes(normalizedQuery) ||
        commodity.hsCode?.includes(normalizedQuery)
      );
    });
  }, [commodityQuery, primaryCommodities]);
  const rows = useMemo(
    () =>
      buildRows({
        datasets: visibleDatasets,
        selectedHsCodes,
      }),
    [selectedHsCodes, visibleDatasets],
  );
  const visibleCommodities = useMemo(
    () =>
      primaryCommodities.filter(
        (commodity) => commodity.hsCode && selectedHsCodes.has(commodity.hsCode),
      ),
    [primaryCommodities, selectedHsCodes],
  );
  const seriesKeys = useMemo(
    () =>
      selectedCountries.flatMap((country) =>
        visibleCommodities
          .map((commodity) =>
            commodity.hsCode ? seriesKey(country, commodity.hsCode) : undefined,
          )
          .filter((key): key is string => Boolean(key)),
      ),
    [selectedCountries, visibleCommodities],
  );
  const effectiveValueMode =
    granularity === "monthly" ? valueMode : "value";
  const displayRows = useMemo(() => {
    if (effectiveValueMode === "monthlyGrowth") {
      return buildMonthlyGrowthRows(rows, seriesKeys);
    }

    if (granularity === "monthly") {
      return buildSameMonthPreviousYearTooltipRows(rows, seriesKeys);
    }

    return rows;
  }, [effectiveValueMode, granularity, rows, seriesKeys]);
  const valueFormatter =
    effectiveValueMode === "monthlyGrowth" ? formatPercent : formatCompactNumber;
  const topCommodity = useMemo(
    () =>
      primaryCommodities.reduce<Commodity | undefined>(
        (best, commodity) =>
          !best || commodity.total > best.total ? commodity : best,
        undefined,
      ),
    [primaryCommodities],
  );

  useEffect(() => {
    if (initializedGranularityRef.current === granularity) {
      return;
    }

    initializedGranularityRef.current = granularity;
    setCommodityQuery("");
    setSelectedHsCodes(
      new Set(
        primaryCommodities
          .map((commodity) => commodity.hsCode)
          .filter((hsCode): hsCode is string => Boolean(hsCode)),
      ),
    );
  }, [granularity, primaryCommodities]);

  useEffect(() => {
    if (
      !chartLink?.chartStateKey ||
      appliedChartStateKeyRef.current === chartLink.chartStateKey
    ) {
      return;
    }

    const nextGranularity = decodeGranularity(chartLink.chartState, "g");
    const nextCountries = decodeStringArray(
      chartLink.chartState,
      "c",
      defaultCountries,
      availableCountries,
    );
    const nextPrimaryDataset = nextCountries[0]
      ? getDataset(datasets, nextGranularity, nextCountries[0])
      : undefined;
    const nextDefaultHsCodes = getCommodityHsCodes(nextPrimaryDataset?.commodities ?? []);

    appliedChartStateKeyRef.current = chartLink.chartStateKey;
    initializedGranularityRef.current = nextGranularity;
    setGranularity(nextGranularity);
    setValueMode(decodeValueMode(chartLink.chartState, "v"));
    setSelectedCountries(nextCountries);
    setCommodityQuery(decodeString(chartLink.chartState, "q"));
    setSelectedHsCodes(
      new Set(
        decodeSelection(
          chartLink.chartState,
          "hs",
          nextDefaultHsCodes,
          nextDefaultHsCodes,
        ),
      ),
    );
  }, [
    availableCountries,
    chartLink?.chartState,
    chartLink?.chartStateKey,
    datasets,
    defaultCountries,
  ]);

  function getChartParams(): ChartUrlState {
    const state: ChartUrlState = {};
    const selectedHsCodesInOrder = defaultHsCodes.filter((hsCode) =>
      selectedHsCodes.has(hsCode),
    );
    const encodedGranularity = encodeGranularity(granularity);
    const encodedValueMode = encodeValueMode(valueMode);
    const encodedCountries = encodeStringArray(selectedCountries, defaultCountries);
    const encodedQuery = encodeString(commodityQuery);
    const encodedHsCodes = encodeSelection(selectedHsCodesInOrder, defaultHsCodes);

    if (encodedGranularity) {
      state.g = encodedGranularity;
    }

    if (encodedValueMode) {
      state.v = encodedValueMode;
    }

    if (encodedCountries) {
      state.c = encodedCountries;
    }

    if (encodedQuery) {
      state.q = encodedQuery;
    }

    if (encodedHsCodes) {
      state.hs = encodedHsCodes;
    }

    return state;
  }

  function toggleCommodity(hsCode?: string | null) {
    if (!hsCode) {
      return;
    }

    setSelectedHsCodes((previous) => {
      const next = new Set(previous);

      if (next.has(hsCode)) {
        next.delete(hsCode);
      } else {
        next.add(hsCode);
      }

      return next;
    });
  }

  function selectAll() {
    setSelectedHsCodes(
      new Set(
        primaryCommodities
          .map((commodity) => commodity.hsCode)
          .filter((hsCode): hsCode is string => Boolean(hsCode)),
      ),
    );
  }

  function clearAll() {
    setSelectedHsCodes(new Set());
  }

  return (
    <section className="chart-section" aria-label={title}>
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      <section className="controls controls--country" aria-label={`${title} controls`}>
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

        <div className="control-actions">
          <button type="button" onClick={selectAll}>
            Select all
          </button>
          <button type="button" onClick={clearAll}>
            Clear
          </button>
        </div>

        <label className="field field--search">
          <span>Find commodities</span>
          <input
            type="search"
            value={commodityQuery}
            onChange={(event) => setCommodityQuery(event.target.value)}
            placeholder="Search by commodity name or HS code"
          />
        </label>
      </section>

      <section className="layout">
        <aside className="commodity-panel" aria-label={`${title} commodity selector`}>
          <div className="panel-header">
            <div>
              <h2>Commodities</h2>
              <span>
                {visibleCommodities.length} of {primaryCommodities.length} shown
              </span>
            </div>
            <div className="panel-actions" aria-label="Commodity bulk actions">
              <button type="button" onClick={selectAll}>
                Select all
              </button>
              <button type="button" onClick={clearAll}>
                Clear all
              </button>
            </div>
          </div>
          <div className="commodity-list">
            {filteredCommodities.map((commodity) => (
              <label className="commodity-option" key={commodity.id}>
                <input
                  type="checkbox"
                  checked={selectedHsCodes.has(commodity.hsCode ?? "")}
                  onChange={() => toggleCommodity(commodity.hsCode)}
                />
                <span
                  className="commodity-option__swatch"
                  style={{
                    backgroundColor: commodity.hsCode
                      ? getLineColor(Number(commodity.hsCode))
                      : undefined,
                  }}
                />
                <span className="commodity-option__name">{commodity.name}</span>
              </label>
            ))}
          </div>
        </aside>

        <section
          className={chartLink ? "chart-card chart-target" : "chart-card"}
          id={
            chartLink
              ? getChartTargetId(chartLink.activeTab, chartLink.chartId)
              : undefined
          }
          aria-label={`${title} line chart`}
        >
          <div className="chart-header">
            <div>
              <h2>{valueDescription}</h2>
              <p>
                {effectiveValueMode === "monthlyGrowth"
                  ? "Values shown as % growth vs previous month."
                  : "Values shown in US dollars."}
                {topCommodity && primaryCountry
                  ? ` Largest ${primaryCountry} series by total value: ${topCommodity.name} (${formatCompactNumber(
                      topCommodity.total,
                    )}).`
                  : ""}
              </p>
            </div>
            <div className="chart-header__actions">
              <span className="granularity">{granularity}</span>
              {chartLink ? (
                <ChartLinkButton {...chartLink} getChartParams={getChartParams} />
              ) : null}
            </div>
          </div>

          {visibleCommodities.length > 0 ? (
            <div className="chart-wrap">
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
                  {selectedCountries.flatMap((country, countryIndex) =>
                    visibleCommodities.map((commodity, commodityIndex) => {
                      if (!commodity.hsCode) {
                        return null;
                      }

                      return (
                        <Line
                          key={`${country}-${commodity.hsCode}`}
                          type="monotone"
                          dataKey={seriesKey(country, commodity.hsCode)}
                          name={`${country} - ${commodity.name}`}
                          stroke={getLineColor(commodityIndex * 2 + countryIndex)}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                      );
                    }),
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-state">
              Select one or more commodities to display the chart.
            </div>
          )}
        </section>
      </section>
    </section>
  );
}

export default CountryDatasetChart;
