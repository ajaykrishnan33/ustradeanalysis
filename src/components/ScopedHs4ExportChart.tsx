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

type Hs2Option = {
  hsCode: string;
  label: string;
  hs4Codes: string[];
};

type ScopedHs4ExportChartProps = {
  title: string;
  description: string;
  datasets: Dataset[];
  valueDescription: string;
  emptyMessage: string;
  chartLink?: ChartLinkProps;
};

function seriesKey(scope: ExportScope, hs4Code: string) {
  return `${getExportScopeKey(scope)}_hs4_${hs4Code}`;
}

function getAvailableScopes(datasets: Dataset[]) {
  const scopes = new Set(datasets.map((dataset) => dataset.scope));
  return exportScopeOrder.filter((scope) => scopes.has(scope));
}

function getDefaultScopes(scopes: ExportScope[]) {
  return scopes.includes("us") ? ["us"] : scopes.slice(0, 1);
}

function getHs2Codes(options: Hs2Option[]) {
  return options.map((option) => option.hsCode);
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

function buildHs2Options(dataset: Dataset) {
  const optionsByHs2 = new Map<string, Hs2Option>();
  const labelByHs2 = new Map(
    dataset.hs2Commodities?.map((commodity) => [
      commodity.hsCode,
      commodity.name,
    ]) ?? [],
  );

  for (const commodity of dataset.commodities) {
    if (!commodity.hsCode || !commodity.hs4Code) {
      continue;
    }

    const existing = optionsByHs2.get(commodity.hsCode);

    if (existing) {
      existing.hs4Codes.push(commodity.hs4Code);
      continue;
    }

    optionsByHs2.set(commodity.hsCode, {
      hsCode: commodity.hsCode,
      label: labelByHs2.get(commodity.hsCode) ?? commodity.hsCode,
      hs4Codes: [commodity.hs4Code],
    });
  }

  return [...optionsByHs2.values()].sort((left, right) =>
    left.hsCode.localeCompare(right.hsCode, "en-US", { numeric: true }),
  );
}

function buildRows({
  datasets,
  periodView,
  selectedHs4Codes,
}: {
  datasets: Dataset[];
  periodView: PeriodView;
  selectedHs4Codes: Set<string>;
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
      (commodity) => commodity.hs4Code && selectedHs4Codes.has(commodity.hs4Code),
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
        if (!commodity.hs4Code || !dataset.scope) {
          continue;
        }

        const key = seriesKey(dataset.scope, commodity.hs4Code);
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

function ScopedHs4ExportChart({
  title,
  description,
  datasets,
  valueDescription,
  emptyMessage,
  chartLink,
}: ScopedHs4ExportChartProps) {
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
  const hs2Options = useMemo(
    () => (primaryDataset ? buildHs2Options(primaryDataset) : []),
    [primaryDataset],
  );
  const hs2Codes = useMemo(() => getHs2Codes(hs2Options), [hs2Options]);
  const defaultHs2Code = hs2Options[0]?.hsCode ?? "";
  const [selectedHs2Code, setSelectedHs2Code] = useState(() =>
    decodeString(initialChartState, "h2", defaultHs2Code, hs2Codes),
  );
  const selectedHs2Option = hs2Options.find(
    (option) => option.hsCode === selectedHs2Code,
  );
  const defaultHs4Codes = selectedHs2Option?.hs4Codes ?? [];
  const [selectedHs4Codes, setSelectedHs4Codes] = useState<Set<string>>(
    () => new Set(decodeSelection(initialChartState, "hs", defaultHs4Codes, defaultHs4Codes)),
  );
  const selectedHs2Commodities = useMemo(() => {
    const selectedCodes = new Set(selectedHs2Option?.hs4Codes ?? []);
    return (primaryDataset?.commodities ?? []).filter(
      (commodity) => commodity.hs4Code && selectedCodes.has(commodity.hs4Code),
    );
  }, [primaryDataset, selectedHs2Option]);
  const filteredCommodities = useMemo(() => {
    const normalizedQuery = commodityQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return selectedHs2Commodities;
    }

    return selectedHs2Commodities.filter((commodity) => {
      return (
        commodity.name.toLowerCase().includes(normalizedQuery) ||
        commodity.hs4Code?.includes(normalizedQuery) ||
        commodity.hsCode?.includes(normalizedQuery)
      );
    });
  }, [commodityQuery, selectedHs2Commodities]);
  const visibleCommodities = useMemo(
    () =>
      selectedHs2Commodities.filter(
        (commodity) =>
          commodity.hs4Code && selectedHs4Codes.has(commodity.hs4Code),
      ),
    [selectedHs2Commodities, selectedHs4Codes],
  );
  const rows = useMemo(
    () =>
      buildRows({
        datasets: visibleDatasets,
        periodView,
        selectedHs4Codes,
      }),
    [periodView, selectedHs4Codes, visibleDatasets],
  );
  const seriesKeys = useMemo(
    () =>
      selectedScopes.flatMap((scope) =>
        visibleCommodities
          .map((commodity) =>
            commodity.hs4Code ? seriesKey(scope, commodity.hs4Code) : undefined,
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
      (primaryDataset?.commodities ?? []).reduce<Commodity | undefined>(
        (best, commodity) =>
          !best || commodity.total > best.total ? commodity : best,
        undefined,
      ),
    [primaryDataset],
  );

  useEffect(() => {
    if (initializedPeriodViewRef.current === periodView) {
      return;
    }

    initializedPeriodViewRef.current = periodView;
    const firstOption = hs2Options[0];
    setCommodityQuery("");
    setSelectedHs2Code(firstOption?.hsCode ?? "");
    setSelectedHs4Codes(new Set(firstOption?.hs4Codes ?? []));
  }, [periodView, hs2Options]);

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
    const nextHs2Options = nextPrimaryDataset ? buildHs2Options(nextPrimaryDataset) : [];
    const nextHs2Codes = getHs2Codes(nextHs2Options);
    const nextDefaultHs2Code = nextHs2Options[0]?.hsCode ?? "";
    const nextHs2Code = decodeString(
      chartLink.chartState,
      "h2",
      nextDefaultHs2Code,
      nextHs2Codes,
    );
    const nextDefaultHs4Codes =
      nextHs2Options.find((option) => option.hsCode === nextHs2Code)?.hs4Codes ?? [];

    appliedChartStateKeyRef.current = chartLink.chartStateKey;
    initializedPeriodViewRef.current = nextPeriodView;
    setPeriodView(nextPeriodView);
    setValueMode(decodeValueMode(chartLink.chartState, "v"));
    setSelectedScopes(nextScopes);
    setCommodityQuery(decodeString(chartLink.chartState, "q"));
    setSelectedHs2Code(nextHs2Code);
    setSelectedHs4Codes(
      new Set(
        decodeSelection(
          chartLink.chartState,
          "hs",
          nextDefaultHs4Codes,
          nextDefaultHs4Codes,
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
    const selectedHs4CodesInOrder = defaultHs4Codes.filter((hs4Code) =>
      selectedHs4Codes.has(hs4Code),
    );
    const encodedPeriodView = encodePeriodView(periodView);
    const encodedValueMode = encodeValueMode(valueMode);
    const encodedScopes = encodeStringArray(selectedScopes, defaultScopes);
    const encodedQuery = encodeString(commodityQuery);
    const encodedHs2Code = encodeString(selectedHs2Code, defaultHs2Code);
    const encodedHs4Codes = encodeSelection(selectedHs4CodesInOrder, defaultHs4Codes);
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

    if (encodedHs2Code) {
      state.h2 = encodedHs2Code;
    }

    if (encodedHs4Codes) {
      state.hs = encodedHs4Codes;
    }

    if (encodedPinnedTooltipLabel) {
      state[pinnedTooltipStateKey] = encodedPinnedTooltipLabel;
    }

    return state;
  }

  function selectHs2(hsCode: string) {
    setSelectedHs2Code(hsCode);
    setCommodityQuery("");

    const option = hs2Options.find((item) => item.hsCode === hsCode);
    setSelectedHs4Codes(new Set(option?.hs4Codes ?? []));
  }

  function toggleCommodity(hs4Code?: string | null) {
    if (!hs4Code) {
      return;
    }

    setSelectedHs4Codes((previous) => {
      const next = new Set(previous);

      if (next.has(hs4Code)) {
        next.delete(hs4Code);
      } else {
        next.add(hs4Code);
      }

      return next;
    });
  }

  function selectAll() {
    setSelectedHs4Codes(new Set(selectedHs2Option?.hs4Codes ?? []));
  }

  function clearAll() {
    setSelectedHs4Codes(new Set());
  }

  return (
    <section className="chart-section" aria-label={title}>
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      <section className="controls controls--hs4" aria-label={`${title} controls`}>
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

        <label className="field">
          <span>HS2 commodity</span>
          <select
            value={selectedHs2Code}
            onChange={(event) => selectHs2(event.target.value)}
          >
            {hs2Options.map((option) => (
              <option key={option.hsCode} value={option.hsCode}>
                {option.label} - {option.hs4Codes.length} HS4 codes
              </option>
            ))}
          </select>
        </label>

        <label className="field field--search">
          <span>Find HS4 commodities</span>
          <input
            type="search"
            value={commodityQuery}
            onChange={(event) => setCommodityQuery(event.target.value)}
            placeholder="Search within selected HS2 by HS4 code or commodity name"
          />
        </label>
      </section>

      <section className="layout">
        <aside className="commodity-panel" aria-label={`${title} commodity selector`}>
          <div className="panel-header">
            <div>
              <h2>HS4 commodities</h2>
              <span>
                {visibleCommodities.length} of {selectedHs2Commodities.length} selected
                {selectedHs2Option ? ` - ${selectedHs2Option.label}` : ""}
              </span>
            </div>
            <div className="panel-actions" aria-label="HS4 bulk actions">
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
                  checked={selectedHs4Codes.has(commodity.hs4Code ?? "")}
                  onChange={() => toggleCommodity(commodity.hs4Code)}
                />
                <span
                  className="commodity-option__swatch"
                  style={{
                    backgroundColor: commodity.hs4Code
                      ? getLineColor(Number(commodity.hs4Code))
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
                      if (!commodity.hs4Code) {
                        return null;
                      }

                      return (
                        <Line
                          key={`${scope}-${commodity.hs4Code}`}
                          type="monotone"
                          dataKey={seriesKey(scope, commodity.hs4Code)}
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
            <div className="empty-state">{emptyMessage}</div>
          )}
        </section>
      </section>
    </section>
  );
}

export default ScopedHs4ExportChart;
