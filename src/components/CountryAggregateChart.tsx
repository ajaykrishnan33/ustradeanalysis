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
  addPeriodCoverage,
  buildMonthlyGrowthRows,
  buildPreviousCalendarYearTooltipRows,
  buildPreviousFiscalYearTooltipRows,
  buildSameMonthPreviousYearTooltipRows,
  type ChartValueMode,
  formatCompactNumber,
  formatPercent,
  getCountrySeriesKey,
  getLineColor,
  getPeriodViewGranularity,
  getPeriodViewLabel,
  getPeriodViewPeriod,
  hasPeriodBoundaryCoverage,
  sumCommodityValues,
} from "../chartUtils";
import { getChartTargetId, type ChartLinkProps } from "../chartLinks";
import {
  decodePeriodView,
  decodePinnedTooltipLabel,
  decodeStringArray,
  decodeValueMode,
  encodePeriodView,
  encodePinnedTooltipLabel,
  encodeStringArray,
  encodeValueMode,
  pinnedTooltipStateKey,
  type ChartUrlState,
} from "../chartUrlState";
import type { ChartRow, Dataset, PeriodView } from "../types";
import ChartLinkButton from "./ChartLinkButton";
import CountryMultiSelect from "./CountryMultiSelect";
import EventReferenceLines from "./EventReferenceLines";
import PinnedTooltipReferenceLine from "./PinnedTooltipReferenceLine";
import SharedTooltip from "./SharedTooltip";
import ValueModeToggle from "./ValueModeToggle";
import usePinnedTooltip from "./usePinnedTooltip";

type CountryAggregateChartProps = {
  title: string;
  description: string;
  datasets: Dataset[];
  chartLink?: ChartLinkProps;
};

function buildCountryRows(datasets: Dataset[], periodView: PeriodView) {
  const rowsByPeriod = new Map<string, ChartRow>();
  const coverageByPeriod = new Map<string, Map<string, Set<number>>>();
  const seriesKeys = datasets.map((dataset) =>
    getCountrySeriesKey(dataset.country ?? "Unknown"),
  );

  for (const dataset of datasets) {
    const country = dataset.country ?? "Unknown";
    const seriesKey = getCountrySeriesKey(country);
    const commodityIds = dataset.commodities.map((commodity) => commodity.id);
    const rowsBySourcePeriod = new Map(
      dataset.rows.map((row) => [row.periodKey, row]),
    );

    for (const period of dataset.periods) {
      const displayPeriod = getPeriodViewPeriod(period, periodView);
      const sourceRow = rowsBySourcePeriod.get(period.key);
      const value = sourceRow ? sumCommodityValues(sourceRow, commodityIds) : 0;
      const existing = rowsByPeriod.get(displayPeriod.key);
      const existingValue = existing?.[seriesKey];

      if (periodView !== "monthly") {
        addPeriodCoverage({
          coverageByPeriod,
          periodKey: displayPeriod.key,
          seriesKey,
          sourcePeriodSort: period.sort,
        });
      }

      rowsByPeriod.set(displayPeriod.key, {
        periodKey: displayPeriod.key,
        periodLabel: existing?.periodLabel ?? displayPeriod.label,
        periodSort: existing?.periodSort ?? displayPeriod.sort,
        ...existing,
        [seriesKey]: (typeof existingValue === "number" ? existingValue : 0) + value,
      });
    }
  }

  return [...rowsByPeriod.values()]
    .filter((row) =>
      hasPeriodBoundaryCoverage({
        coverageByPeriod,
        periodView,
        row,
        seriesKeys,
      }),
    )
    .sort((left, right) => left.periodSort - right.periodSort);
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
  description,
  datasets,
  chartLink,
}: CountryAggregateChartProps) {
  const availableCountries = useMemo(
    () => getAvailableCountries(datasets),
    [datasets],
  );
  const initialChartState = chartLink?.chartState;
  const [periodView, setPeriodView] = useState<PeriodView>(() =>
    decodePeriodView(initialChartState, "g"),
  );
  const granularity = getPeriodViewGranularity(periodView);
  const [valueMode, setValueMode] = useState<ChartValueMode>(() =>
    decodeValueMode(initialChartState, "v"),
  );
  const [selectedCountries, setSelectedCountries] = useState<string[]>(
    () => decodeStringArray(initialChartState, "c", availableCountries, availableCountries),
  );
  const appliedChartStateKeyRef = useRef<string | undefined>(chartLink?.chartStateKey);
  const visibleDatasets = useMemo(
    () =>
      datasets.filter(
        (dataset) =>
          dataset.actualGranularity === "monthly" &&
          selectedCountries.includes(dataset.country ?? ""),
      ),
    [datasets, selectedCountries],
  );
  const rows = useMemo(
    () => buildCountryRows(visibleDatasets, periodView),
    [periodView, visibleDatasets],
  );
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
    periodView === "monthly" ? valueMode : "value";
  const displayRows = useMemo(() => {
    if (effectiveValueMode === "monthlyGrowth") {
      return buildMonthlyGrowthRows(rows, seriesKeys);
    }

    if (periodView === "monthly") {
      return buildSameMonthPreviousYearTooltipRows(rows, seriesKeys);
    }

    if (periodView === "calendarYear") {
      return buildPreviousCalendarYearTooltipRows(rows, seriesKeys);
    }

    if (periodView === "fiscalYear") {
      return buildPreviousFiscalYearTooltipRows(rows, seriesKeys);
    }

    return rows;
  }, [effectiveValueMode, periodView, rows, seriesKeys]);
  const pinnedTooltip = usePinnedTooltip({
    rows: displayRows,
    initialPinnedLabel: decodePinnedTooltipLabel(
      chartLink?.chartState,
      displayRows.map((row) => row.periodLabel),
    ),
    stateKey: chartLink?.chartStateKey,
  });
  const valueFormatter =
    effectiveValueMode === "monthlyGrowth" ? formatPercent : formatCompactNumber;

  useEffect(() => {
    if (
      !chartLink?.chartStateKey ||
      appliedChartStateKeyRef.current === chartLink.chartStateKey
    ) {
      return;
    }

    appliedChartStateKeyRef.current = chartLink.chartStateKey;
    setPeriodView(decodePeriodView(chartLink.chartState, "g"));
    setValueMode(decodeValueMode(chartLink.chartState, "v"));
    setSelectedCountries(
      decodeStringArray(chartLink.chartState, "c", availableCountries, availableCountries),
    );
  }, [availableCountries, chartLink?.chartState, chartLink?.chartStateKey]);

  function getChartParams(): ChartUrlState {
    const state: ChartUrlState = {};
    const encodedPeriodView = encodePeriodView(periodView);
    const encodedValueMode = encodeValueMode(valueMode);
    const encodedCountries = encodeStringArray(selectedCountries, availableCountries);
    const encodedPinnedTooltipLabel = encodePinnedTooltipLabel(
      pinnedTooltip.pinnedLabel,
    );

    if (encodedPeriodView) {
      state.g = encodedPeriodView;
    }

    if (encodedValueMode) {
      state.v = encodedValueMode;
    }

    if (encodedCountries) {
      state.c = encodedCountries;
    }

    if (encodedPinnedTooltipLabel) {
      state[pinnedTooltipStateKey] = encodedPinnedTooltipLabel;
    }

    return state;
  }

  return (
    <section className="chart-section" aria-label={title}>
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      <section className="controls controls--aggregate" aria-label={`${title} controls`}>
        <label className="field">
          <span>View</span>
          <select
            value={periodView}
            onChange={(event) => setPeriodView(event.target.value as PeriodView)}
          >
            <option value="monthly">Monthly imports</option>
            <option value="calendarYear">Calendar Year imports</option>
            <option value="fiscalYear">Fiscal Year imports</option>
          </select>
        </label>
        <CountryMultiSelect
          countries={availableCountries}
          selectedCountries={selectedCountries}
          onChange={setSelectedCountries}
        />
        {periodView === "monthly" ? (
          <ValueModeToggle valueMode={valueMode} onChange={setValueMode} />
        ) : null}
      </section>

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
            <h2>All Commodities imports</h2>
            <p>
              Total customs value across all import commodities by country.
              {effectiveValueMode === "monthlyGrowth"
                ? " Values shown as % growth vs previous month."
                : " Values shown in US dollars."}
            </p>
          </div>
          <div className="chart-header__actions">
            <span className="granularity">{getPeriodViewLabel(periodView)}</span>
            {chartLink ? (
              <ChartLinkButton {...chartLink} getChartParams={getChartParams} />
            ) : null}
          </div>
        </div>

        <div className={pinnedTooltip.getChartWrapperClassName("chart-wrap chart-wrap--comparison")}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={displayRows}
              margin={{ top: 12, right: 32, bottom: 28, left: 24 }}
              onClick={pinnedTooltip.handleChartClick}
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
                {...pinnedTooltip.tooltipProps}
                content={
                  <SharedTooltip
                    isPinned={pinnedTooltip.isPinned}
                    onClearPinned={pinnedTooltip.clearPinnedTooltip}
                    valueFormatter={
                      effectiveValueMode === "monthlyGrowth" ? formatPercent : undefined
                    }
                  />
                }
              />
              <EventReferenceLines periodView={periodView} />
              <PinnedTooltipReferenceLine label={pinnedTooltip.pinnedLabel} />
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
