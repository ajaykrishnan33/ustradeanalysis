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
  findDatasetByGranularity,
  formatCompactNumber,
  formatPercent,
  getPeriodViewLabel,
  getPeriodViewPeriod,
  getRowValue,
  hasPeriodBoundaryCoverage,
  sumCommodityValues,
} from "../chartUtils";
import { getChartTargetId, type ChartLinkProps } from "../chartLinks";
import {
  decodePeriodView,
  decodePinnedTooltipLabel,
  decodeString,
  decodeValueMode,
  encodePeriodView,
  encodePinnedTooltipLabel,
  encodeString,
  encodeValueMode,
  pinnedTooltipStateKey,
  type ChartUrlState,
} from "../chartUrlState";
import type { ComparisonRow, Dataset, PeriodView } from "../types";
import ChartLinkButton from "./ChartLinkButton";
import EventReferenceLines from "./EventReferenceLines";
import PinnedTooltipReferenceLine from "./PinnedTooltipReferenceLine";
import SharedTooltip from "./SharedTooltip";
import ValueModeToggle from "./ValueModeToggle";
import usePinnedTooltip from "./usePinnedTooltip";

const allCommoditiesOption = "__all_commodities__";
const comparisonSeriesKeys = ["exportValue", "importValue"];

function buildComparisonRows({
  periodView,
  hsCode,
  exportDataset,
  importDataset,
}: {
  periodView: PeriodView;
  hsCode: string;
  exportDataset: Dataset;
  importDataset: Dataset;
}) {
  const useAllCommodities = hsCode === allCommoditiesOption;
  const exportCommodity = useAllCommodities
    ? undefined
    : exportDataset.commodities.find((commodity) => commodity.hsCode === hsCode);
  const importCommodity = useAllCommodities
    ? undefined
    : importDataset.commodities.find((commodity) => commodity.hsCode === hsCode);
  const exportCommodityIds = exportDataset.commodities.map((commodity) => commodity.id);
  const importCommodityIds = importDataset.commodities.map((commodity) => commodity.id);
  const rowsByPeriod = new Map<string, ComparisonRow>();
  const coverageByPeriod = new Map<string, Map<string, Set<number>>>();

  const exportRowsByPeriod = new Map(
    exportDataset.rows.map((row) => [row.periodKey, row]),
  );
  const importRowsByPeriod = new Map(
    importDataset.rows.map((row) => [row.periodKey, row]),
  );

  for (const period of exportDataset.periods) {
    const displayPeriod = getPeriodViewPeriod(period, periodView);
    const row = exportRowsByPeriod.get(period.key);
    const existing = rowsByPeriod.get(displayPeriod.key);
    const existingValue = existing?.exportValue;
    const value = row
      ? useAllCommodities
        ? sumCommodityValues(row, exportCommodityIds)
        : getRowValue(row, exportCommodity?.id)
      : undefined;

    if (periodView !== "monthly") {
      addPeriodCoverage({
        coverageByPeriod,
        periodKey: displayPeriod.key,
        seriesKey: "exportValue",
        sourcePeriodSort: period.sort,
      });
    }

    rowsByPeriod.set(displayPeriod.key, {
      periodKey: displayPeriod.key,
      periodLabel: existing?.periodLabel ?? displayPeriod.label,
      periodSort: existing?.periodSort ?? displayPeriod.sort,
      exportValue:
        typeof value === "number"
          ? (typeof existingValue === "number" ? existingValue : 0) + value
          : existing?.exportValue,
      importValue: existing?.importValue,
    });
  }

  for (const period of importDataset.periods) {
    const displayPeriod = getPeriodViewPeriod(period, periodView);
    const row = importRowsByPeriod.get(period.key);
    const existing = rowsByPeriod.get(displayPeriod.key);
    const existingValue = existing?.importValue;
    const value = row
      ? useAllCommodities
        ? sumCommodityValues(row, importCommodityIds)
        : getRowValue(row, importCommodity?.id)
      : undefined;

    if (periodView !== "monthly") {
      addPeriodCoverage({
        coverageByPeriod,
        periodKey: displayPeriod.key,
        seriesKey: "importValue",
        sourcePeriodSort: period.sort,
      });
    }

    rowsByPeriod.set(displayPeriod.key, {
      periodKey: displayPeriod.key,
      periodLabel: existing?.periodLabel ?? displayPeriod.label,
      periodSort: existing?.periodSort ?? displayPeriod.sort,
      exportValue: existing?.exportValue,
      importValue:
        typeof value === "number"
          ? (typeof existingValue === "number" ? existingValue : 0) + value
          : existing?.importValue,
    });
  }

  return {
    rows: [...rowsByPeriod.values()]
      .filter((row) =>
        hasPeriodBoundaryCoverage({
          coverageByPeriod,
          periodView,
          row,
          seriesKeys: comparisonSeriesKeys,
        }),
      )
      .sort((left, right) => left.periodSort - right.periodSort),
    exportCommodity,
    importCommodity,
  };
}

type ComparisonChartProps = {
  exportDatasets: Dataset[];
  indiaImportDatasets: Dataset[];
  chartLink?: ChartLinkProps;
};

function ComparisonChart({
  exportDatasets,
  indiaImportDatasets,
  chartLink,
}: ComparisonChartProps) {
  const initialChartState = chartLink?.chartState;
  const [periodView, setPeriodView] = useState<PeriodView>(() =>
    decodePeriodView(initialChartState, "g"),
  );
  const [valueMode, setValueMode] = useState<ChartValueMode>(() =>
    decodeValueMode(initialChartState, "v"),
  );
  const comparisonOptions = useMemo(() => {
    const monthlyExports = findDatasetByGranularity(exportDatasets, "monthly");
    const monthlyImports = findDatasetByGranularity(indiaImportDatasets, "monthly");

    return monthlyExports.commodities
      .filter((exportCommodity) =>
        monthlyImports.commodities.some(
          (importCommodity) => importCommodity.hsCode === exportCommodity.hsCode,
        ),
      )
      .map((commodity) => ({
        hsCode: commodity.hsCode ?? "",
        label: commodity.name,
      }))
      .filter((option) => option.hsCode);
  }, []);
  const comparisonCodes = useMemo(
    () => [allCommoditiesOption, ...comparisonOptions.map((option) => option.hsCode)],
    [comparisonOptions],
  );
  const [hsCode, setHsCode] = useState(() =>
    decodeString(initialChartState, "h2", allCommoditiesOption, comparisonCodes),
  );
  const appliedChartStateKeyRef = useRef<string | undefined>(chartLink?.chartStateKey);

  const exportDataset = findDatasetByGranularity(exportDatasets, "monthly");
  const importDataset = findDatasetByGranularity(indiaImportDatasets, "monthly");
  const { rows, exportCommodity, importCommodity } = useMemo(
    () =>
      buildComparisonRows({
        periodView,
        hsCode,
        exportDataset,
        importDataset,
      }),
    [exportDataset, periodView, hsCode, importDataset],
  );
  const effectiveValueMode =
    periodView === "monthly" ? valueMode : "value";
  const displayRows = useMemo(() => {
    if (effectiveValueMode === "monthlyGrowth") {
      return buildMonthlyGrowthRows(rows, comparisonSeriesKeys);
    }

    if (periodView === "monthly") {
      return buildSameMonthPreviousYearTooltipRows(rows, comparisonSeriesKeys);
    }

    if (periodView === "calendarYear") {
      return buildPreviousCalendarYearTooltipRows(rows, comparisonSeriesKeys);
    }

    if (periodView === "fiscalYear") {
      return buildPreviousFiscalYearTooltipRows(rows, comparisonSeriesKeys);
    }

    return rows;
  }, [effectiveValueMode, periodView, rows]);
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
    setHsCode(
      decodeString(chartLink.chartState, "h2", allCommoditiesOption, comparisonCodes),
    );
  }, [chartLink?.chartState, chartLink?.chartStateKey, comparisonCodes]);

  function getChartParams(): ChartUrlState {
    const state: ChartUrlState = {};
    const encodedPeriodView = encodePeriodView(periodView);
    const encodedValueMode = encodeValueMode(valueMode);
    const encodedHsCode = encodeString(hsCode, allCommoditiesOption);
    const encodedPinnedTooltipLabel = encodePinnedTooltipLabel(
      pinnedTooltip.pinnedLabel,
    );

    if (encodedPeriodView) {
      state.g = encodedPeriodView;
    }

    if (encodedValueMode) {
      state.v = encodedValueMode;
    }

    if (encodedHsCode) {
      state.h2 = encodedHsCode;
    }

    if (encodedPinnedTooltipLabel) {
      state[pinnedTooltipStateKey] = encodedPinnedTooltipLabel;
    }

    return state;
  }

  return (
    <section className="chart-section" aria-label="Export import comparison">
      <div className="section-heading">
        <div>
          <h2>India exports vs US imports</h2>
          <p>
            Compare the two reported time series for one HS commodity. Export
            TradeStat values are converted from US $ million to raw US dollars.
          </p>
        </div>
      </div>

      <section className="controls controls--comparison" aria-label="Comparison controls">
        <label className="field">
          <span>Commodity</span>
          <select value={hsCode} onChange={(event) => setHsCode(event.target.value)}>
            <option value={allCommoditiesOption}>All Commodities</option>
            {comparisonOptions.map((option) => (
              <option key={option.hsCode} value={option.hsCode}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>View</span>
          <select
            value={periodView}
            onChange={(event) => setPeriodView(event.target.value as PeriodView)}
          >
            <option value="monthly">Monthly</option>
            <option value="calendarYear">Calendar Year</option>
            <option value="fiscalYear">Fiscal Year</option>
          </select>
        </label>

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
        aria-label="Export import comparison chart"
      >
        <div className="chart-header">
          <div>
            <h2>
              {hsCode === allCommoditiesOption
                ? "All Commodities"
                : exportCommodity?.name ?? `HS ${hsCode}`}
            </h2>
            <p>
              Export series:{" "}
              {hsCode === allCommoditiesOption
                ? "All Commodities"
                : exportCommodity?.name ?? "not found"}
              . Import series:{" "}
              {hsCode === allCommoditiesOption
                ? "All Commodities"
                : importCommodity?.name ?? "not found"}
              .
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
              <Line
                type="monotone"
                dataKey="exportValue"
                name="India exports"
                stroke="#2563eb"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="importValue"
                name="US imports"
                stroke="#16a34a"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </section>
  );
}

export default ComparisonChart;
