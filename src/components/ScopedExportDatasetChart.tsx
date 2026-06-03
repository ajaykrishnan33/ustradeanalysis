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
  exportScopeOrder,
  formatCompactNumber,
  formatPercent,
  getExportScopeKey,
  getExportScopeLabel,
  getLineColor,
  getPeriodViewLabel,
  getPeriodViewPeriod,
  getRowValue,
  hasPeriodBoundaryCoverage,
} from "../chartUtils";
import { getChartTargetId, type ChartLinkProps } from "../chartLinks";
import {
  decodePeriodView,
  decodePinnedTooltipLabel,
  decodeSelection,
  decodeString,
  decodeStringArray,
  decodeValueMode,
  encodePeriodView,
  encodePinnedTooltipLabel,
  encodeSelection,
  encodeString,
  encodeStringArray,
  encodeValueMode,
  pinnedTooltipStateKey,
  type ChartUrlState,
} from "../chartUrlState";
import type { ChartRow, Commodity, Dataset, ExportScope, PeriodView } from "../types";
import ChartLinkButton from "./ChartLinkButton";
import EventReferenceLines from "./EventReferenceLines";
import ExportScopeMultiSelect from "./ExportScopeMultiSelect";
import PinnedTooltipReferenceLine from "./PinnedTooltipReferenceLine";
import SharedTooltip from "./SharedTooltip";
import ValueModeToggle from "./ValueModeToggle";
import usePinnedTooltip from "./usePinnedTooltip";

type ScopedExportDatasetChartProps = {
  title: string;
  description: string;
  datasets: Dataset[];
  valueDescription: string;
  chartLink?: ChartLinkProps;
};

function seriesKey(scope: ExportScope, hsCode: string) {
  return `${getExportScopeKey(scope)}_hs_${hsCode}`;
}

function getAvailableScopes(datasets: Dataset[]) {
  const scopes = new Set(datasets.map((dataset) => dataset.scope));
  return exportScopeOrder.filter((scope) => scopes.has(scope));
}

function getDefaultScopes(scopes: ExportScope[]) {
  return scopes.includes("us") ? ["us"] : scopes.slice(0, 1);
}

function getCommodityHsCodes(commodities: Commodity[]) {
  return commodities
    .map((commodity) => commodity.hsCode)
    .filter((hsCode): hsCode is string => Boolean(hsCode));
}

function getDataset(
  datasets: Dataset[],
  scope: ExportScope,
) {
  return datasets.find(
    (dataset) =>
      dataset.actualGranularity === "monthly" && dataset.scope === scope,
  );
}

function buildRows({
  datasets,
  periodView,
  selectedHsCodes,
}: {
  datasets: Dataset[];
  periodView: PeriodView;
  selectedHsCodes: Set<string>;
}) {
  const rowsByPeriod = new Map<string, ChartRow>();
  const coverageByPeriod = new Map<string, Map<string, Set<number>>>();
  const coverageSeriesKeys = new Set<string>();

  for (const dataset of datasets) {
    if (!dataset.scope) {
      continue;
    }

    const rowsBySourcePeriod = new Map(
      dataset.rows.map((row) => [row.periodKey, row]),
    );
    const selectedCommodities = dataset.commodities.filter(
      (commodity) => commodity.hsCode && selectedHsCodes.has(commodity.hsCode),
    );

    for (const period of dataset.periods) {
      const displayPeriod = getPeriodViewPeriod(period, periodView);
      const sourceRow = rowsBySourcePeriod.get(period.key);
      const existing = rowsByPeriod.get(displayPeriod.key);
      const nextRow: ChartRow = {
        periodKey: displayPeriod.key,
        periodLabel: existing?.periodLabel ?? displayPeriod.label,
        periodSort: existing?.periodSort ?? displayPeriod.sort,
        ...existing,
      };

      for (const commodity of selectedCommodities) {
        if (!commodity.hsCode || !dataset.scope) {
          continue;
        }

        const key = seriesKey(dataset.scope, commodity.hsCode);
        const existingValue = nextRow[key];
        coverageSeriesKeys.add(key);

        if (periodView !== "monthly") {
          addPeriodCoverage({
            coverageByPeriod,
            periodKey: displayPeriod.key,
            seriesKey: key,
            sourcePeriodSort: period.sort,
          });
        }

        nextRow[key] =
          (typeof existingValue === "number" ? existingValue : 0) +
          (sourceRow ? getRowValue(sourceRow, commodity.id) ?? 0 : 0);
      }

      rowsByPeriod.set(displayPeriod.key, nextRow);
    }
  }

  return [...rowsByPeriod.values()]
    .filter((row) =>
      hasPeriodBoundaryCoverage({
        coverageByPeriod,
        periodView,
        row,
        seriesKeys: [...coverageSeriesKeys],
      }),
    )
    .sort((left, right) => left.periodSort - right.periodSort);
}

function ScopedExportDatasetChart({
  title,
  description,
  datasets,
  valueDescription,
  chartLink,
}: ScopedExportDatasetChartProps) {
  const availableScopes = useMemo(() => getAvailableScopes(datasets), [datasets]);
  const defaultScopes = useMemo(() => getDefaultScopes(availableScopes), [availableScopes]);
  const initialChartState = chartLink?.chartState;
  const [periodView, setPeriodView] = useState<PeriodView>(() =>
    decodePeriodView(initialChartState, "g"),
  );
  const [valueMode, setValueMode] = useState<ChartValueMode>(() =>
    decodeValueMode(initialChartState, "v"),
  );
  const [selectedScopes, setSelectedScopes] = useState<ExportScope[]>(
    () =>
      decodeStringArray(
        initialChartState,
        "sc",
        defaultScopes,
        availableScopes,
      ) as ExportScope[],
  );
  const [commodityQuery, setCommodityQuery] = useState(() =>
    decodeString(initialChartState, "q"),
  );
  const initializedPeriodViewRef = useRef<PeriodView | null>(periodView);
  const appliedChartStateKeyRef = useRef<string | undefined>(chartLink?.chartStateKey);
  const visibleDatasets = selectedScopes
    .map((scope) => getDataset(datasets, scope))
    .filter((dataset): dataset is Dataset => Boolean(dataset));
  const primaryScope = selectedScopes[0];
  const primaryDataset = primaryScope
    ? getDataset(datasets, primaryScope)
    : undefined;
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
        periodView,
        selectedHsCodes,
      }),
    [periodView, selectedHsCodes, visibleDatasets],
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
      selectedScopes.flatMap((scope) =>
        visibleCommodities
          .map((commodity) =>
            commodity.hsCode ? seriesKey(scope, commodity.hsCode) : undefined,
          )
          .filter((key): key is string => Boolean(key)),
      ),
    [selectedScopes, visibleCommodities],
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
    if (initializedPeriodViewRef.current === periodView) {
      return;
    }

    initializedPeriodViewRef.current = periodView;
    setCommodityQuery("");
    setSelectedHsCodes(
      new Set(
        primaryCommodities
          .map((commodity) => commodity.hsCode)
          .filter((hsCode): hsCode is string => Boolean(hsCode)),
      ),
    );
  }, [periodView, primaryCommodities]);

  useEffect(() => {
    if (
      !chartLink?.chartStateKey ||
      appliedChartStateKeyRef.current === chartLink.chartStateKey
    ) {
      return;
    }

    const nextPeriodView = decodePeriodView(chartLink.chartState, "g");
    const nextScopes = decodeStringArray(
      chartLink.chartState,
      "sc",
      defaultScopes,
      availableScopes,
    ) as ExportScope[];
    const nextPrimaryDataset = nextScopes[0]
      ? getDataset(datasets, nextScopes[0])
      : undefined;
    const nextDefaultHsCodes = getCommodityHsCodes(nextPrimaryDataset?.commodities ?? []);

    appliedChartStateKeyRef.current = chartLink.chartStateKey;
    initializedPeriodViewRef.current = nextPeriodView;
    setPeriodView(nextPeriodView);
    setValueMode(decodeValueMode(chartLink.chartState, "v"));
    setSelectedScopes(nextScopes);
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
    availableScopes,
    chartLink?.chartState,
    chartLink?.chartStateKey,
    datasets,
    defaultScopes,
  ]);

  function getChartParams(): ChartUrlState {
    const state: ChartUrlState = {};
    const selectedHsCodesInOrder = defaultHsCodes.filter((hsCode) =>
      selectedHsCodes.has(hsCode),
    );
    const encodedPeriodView = encodePeriodView(periodView);
    const encodedValueMode = encodeValueMode(valueMode);
    const encodedScopes = encodeStringArray(selectedScopes, defaultScopes);
    const encodedQuery = encodeString(commodityQuery);
    const encodedHsCodes = encodeSelection(selectedHsCodesInOrder, defaultHsCodes);
    const encodedPinnedTooltipLabel = encodePinnedTooltipLabel(
      pinnedTooltip.pinnedLabel,
    );

    if (encodedPeriodView) {
      state.g = encodedPeriodView;
    }

    if (encodedValueMode) {
      state.v = encodedValueMode;
    }

    if (encodedScopes) {
      state.sc = encodedScopes;
    }

    if (encodedQuery) {
      state.q = encodedQuery;
    }

    if (encodedHsCodes) {
      state.hs = encodedHsCodes;
    }

    if (encodedPinnedTooltipLabel) {
      state[pinnedTooltipStateKey] = encodedPinnedTooltipLabel;
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
            value={periodView}
            onChange={(event) => setPeriodView(event.target.value as PeriodView)}
          >
            <option value="monthly">Monthly exports</option>
            <option value="calendarYear">Calendar Year exports</option>
            <option value="fiscalYear">Fiscal Year exports</option>
          </select>
        </label>

        <ExportScopeMultiSelect
          availableScopes={availableScopes}
          selectedScopes={selectedScopes}
          onChange={setSelectedScopes}
        />
        {periodView === "monthly" ? (
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
                {topCommodity && primaryScope
                  ? ` Largest ${getExportScopeLabel(primaryScope)} series by total value: ${topCommodity.name} (${formatCompactNumber(
                      topCommodity.total,
                    )}).`
                  : ""}
              </p>
            </div>
            <div className="chart-header__actions">
            <span className="granularity">{getPeriodViewLabel(periodView)}</span>
              {chartLink ? (
                <ChartLinkButton {...chartLink} getChartParams={getChartParams} />
              ) : null}
            </div>
          </div>

          {visibleCommodities.length > 0 && selectedScopes.length > 0 ? (
            <div className={pinnedTooltip.getChartWrapperClassName("chart-wrap")}>
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
                  {selectedScopes.flatMap((scope, scopeIndex) =>
                    visibleCommodities.map((commodity, commodityIndex) => {
                      if (!commodity.hsCode) {
                        return null;
                      }

                      return (
                        <Line
                          key={`${scope}-${commodity.hsCode}`}
                          type="monotone"
                          dataKey={seriesKey(scope, commodity.hsCode)}
                          name={`${getExportScopeLabel(scope)} - ${commodity.name}`}
                          stroke={getLineColor(commodityIndex * 2 + scopeIndex)}
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
              Select one or more export scopes and commodities to display the chart.
            </div>
          )}
        </section>
      </section>
    </section>
  );
}

export default ScopedExportDatasetChart;
