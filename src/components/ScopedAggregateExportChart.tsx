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
  exportScopeOrder,
  formatCompactNumber,
  formatPercent,
  getExportScopeKey,
  getExportScopeLabel,
  getLineColor,
  sumCommodityValues,
} from "../chartUtils";
import { getChartTargetId, type ChartLinkProps } from "../chartLinks";
import {
  decodeGranularity,
  decodePinnedTooltipLabel,
  decodeStringArray,
  decodeValueMode,
  encodeGranularity,
  encodePinnedTooltipLabel,
  encodeStringArray,
  encodeValueMode,
  pinnedTooltipStateKey,
  type ChartUrlState,
} from "../chartUrlState";
import type { ChartRow, Dataset, ExportScope, Granularity } from "../types";
import ChartLinkButton from "./ChartLinkButton";
import EventReferenceLines from "./EventReferenceLines";
import ExportScopeMultiSelect from "./ExportScopeMultiSelect";
import PinnedTooltipReferenceLine from "./PinnedTooltipReferenceLine";
import SharedTooltip from "./SharedTooltip";
import ValueModeToggle from "./ValueModeToggle";
import usePinnedTooltip from "./usePinnedTooltip";

type ScopedAggregateExportChartProps = {
  title: string;
  description: string;
  datasets: Dataset[];
  chartLink?: ChartLinkProps;
};

function aggregateKey(scope: ExportScope) {
  return `${getExportScopeKey(scope)}_all`;
}

function getAvailableScopes(datasets: Dataset[]) {
  const scopes = new Set(datasets.map((dataset) => dataset.scope));
  return exportScopeOrder.filter((scope) => scopes.has(scope));
}

function getDataset(
  datasets: Dataset[],
  granularity: Granularity,
  scope: ExportScope,
) {
  return datasets.find(
    (dataset) =>
      dataset.actualGranularity === granularity && dataset.scope === scope,
  );
}

function buildRows(datasets: Dataset[]) {
  const rowsByPeriod = new Map<string, ChartRow>();

  for (const dataset of datasets) {
    if (!dataset.scope) {
      continue;
    }

    const key = aggregateKey(dataset.scope);
    const commodityIds = dataset.commodities.map((commodity) => commodity.id);

    for (const row of dataset.rows) {
      const existing = rowsByPeriod.get(row.periodKey);
      rowsByPeriod.set(row.periodKey, {
        periodKey: row.periodKey,
        periodLabel: existing?.periodLabel ?? row.periodLabel,
        periodSort: existing?.periodSort ?? row.periodSort,
        ...existing,
        [key]: sumCommodityValues(row, commodityIds),
      });
    }
  }

  return [...rowsByPeriod.values()].sort(
    (left, right) => left.periodSort - right.periodSort,
  );
}

function ScopedAggregateExportChart({
  title,
  description,
  datasets,
  chartLink,
}: ScopedAggregateExportChartProps) {
  const availableScopes = useMemo(() => getAvailableScopes(datasets), [datasets]);
  const initialChartState = chartLink?.chartState;
  const [granularity, setGranularity] = useState<Granularity>(() =>
    decodeGranularity(initialChartState, "g"),
  );
  const [valueMode, setValueMode] = useState<ChartValueMode>(() =>
    decodeValueMode(initialChartState, "v"),
  );
  const [selectedScopes, setSelectedScopes] = useState<ExportScope[]>(
    () =>
      decodeStringArray(
        initialChartState,
        "sc",
        availableScopes,
        availableScopes,
      ) as ExportScope[],
  );
  const appliedChartStateKeyRef = useRef<string | undefined>(chartLink?.chartStateKey);
  const visibleDatasets = useMemo(
    () =>
      selectedScopes
        .map((scope) => getDataset(datasets, granularity, scope))
        .filter((dataset): dataset is Dataset => Boolean(dataset)),
    [datasets, granularity, selectedScopes],
  );
  const rows = useMemo(() => buildRows(visibleDatasets), [visibleDatasets]);
  const seriesKeys = useMemo(
    () => selectedScopes.map((scope) => aggregateKey(scope)),
    [selectedScopes],
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
    setGranularity(decodeGranularity(chartLink.chartState, "g"));
    setValueMode(decodeValueMode(chartLink.chartState, "v"));
    setSelectedScopes(
      decodeStringArray(
        chartLink.chartState,
        "sc",
        availableScopes,
        availableScopes,
      ) as ExportScope[],
    );
  }, [availableScopes, chartLink?.chartState, chartLink?.chartStateKey]);

  function getChartParams(): ChartUrlState {
    const state: ChartUrlState = {};
    const encodedGranularity = encodeGranularity(granularity);
    const encodedValueMode = encodeValueMode(valueMode);
    const encodedScopes = encodeStringArray(selectedScopes, availableScopes);
    const encodedPinnedTooltipLabel = encodePinnedTooltipLabel(
      pinnedTooltip.pinnedLabel,
    );

    if (encodedGranularity) {
      state.g = encodedGranularity;
    }

    if (encodedValueMode) {
      state.v = encodedValueMode;
    }

    if (encodedScopes) {
      state.sc = encodedScopes;
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
            value={granularity}
            onChange={(event) => setGranularity(event.target.value as Granularity)}
          >
            <option value="monthly">Monthly exports</option>
            <option value="yearly">Yearly exports</option>
          </select>
        </label>

        <ExportScopeMultiSelect
          availableScopes={availableScopes}
          selectedScopes={selectedScopes}
          onChange={setSelectedScopes}
        />
        {granularity === "monthly" ? (
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
            <h2>All Commodities exports</h2>
            <p>
              Total export value across all HS commodities.
              {effectiveValueMode === "monthlyGrowth"
                ? " Values shown as % growth vs previous month."
                : " Values shown in US dollars."}
            </p>
          </div>
          <div className="chart-header__actions">
            <span className="granularity">{granularity}</span>
            {chartLink ? (
              <ChartLinkButton {...chartLink} getChartParams={getChartParams} />
            ) : null}
          </div>
        </div>

        {selectedScopes.length > 0 ? (
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
                <EventReferenceLines granularity={granularity} />
                <PinnedTooltipReferenceLine label={pinnedTooltip.pinnedLabel} />
                {selectedScopes.map((scope, index) => (
                  <Line
                    key={scope}
                    type="monotone"
                    dataKey={aggregateKey(scope)}
                    name={getExportScopeLabel(scope)}
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
        ) : (
          <div className="empty-state">
            Select one or more export scopes to display the chart.
          </div>
        )}
      </section>
    </section>
  );
}

export default ScopedAggregateExportChart;
