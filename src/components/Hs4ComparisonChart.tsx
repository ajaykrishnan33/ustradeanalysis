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

type Hs2ComparisonOption = {
  hsCode: string;
  label: string;
};

type Hs4ComparisonOption = {
  hs4Code: string;
  label: string;
};

const comparisonSeriesKeys = ["exportValue", "importValue"];

function hs2LabelByCode(dataset: Dataset) {
  return new Map(
    dataset.hs2Commodities?.map((commodity) => [
      commodity.hsCode,
      commodity.name,
    ]) ?? [],
  );
}

function hs4CodesByHs2(dataset: Dataset) {
  const codesByHs2 = new Map<string, Set<string>>();

  for (const commodity of dataset.commodities) {
    if (!commodity.hsCode || !commodity.hs4Code) {
      continue;
    }

    if (!codesByHs2.has(commodity.hsCode)) {
      codesByHs2.set(commodity.hsCode, new Set());
    }

    codesByHs2.get(commodity.hsCode)?.add(commodity.hs4Code);
  }

  return codesByHs2;
}

function buildHs2Options(exportDataset: Dataset, importDataset: Dataset) {
  const exportCodesByHs2 = hs4CodesByHs2(exportDataset);
  const importCodesByHs2 = hs4CodesByHs2(importDataset);
  const exportLabels = hs2LabelByCode(exportDataset);
  const importLabels = hs2LabelByCode(importDataset);
  const options: Hs2ComparisonOption[] = [];

  for (const [hsCode, exportHs4Codes] of exportCodesByHs2.entries()) {
    const importHs4Codes = importCodesByHs2.get(hsCode);

    if (!importHs4Codes) {
      continue;
    }

    const hasOverlap = [...exportHs4Codes].some((hs4Code) =>
      importHs4Codes.has(hs4Code),
    );

    if (hasOverlap) {
      options.push({
        hsCode,
        label: exportLabels.get(hsCode) ?? importLabels.get(hsCode) ?? hsCode,
      });
    }
  }

  return options.sort((left, right) =>
    left.hsCode.localeCompare(right.hsCode, "en-US", { numeric: true }),
  );
}

function buildHs4Options({
  hsCode,
  exportDataset,
  importDataset,
}: {
  hsCode: string;
  exportDataset: Dataset;
  importDataset: Dataset;
}) {
  const importCodes = new Set(
    importDataset.commodities
      .filter((commodity) => commodity.hsCode === hsCode && commodity.hs4Code)
      .map((commodity) => commodity.hs4Code),
  );

  return exportDataset.commodities
    .filter(
      (commodity) =>
        commodity.hsCode === hsCode &&
        commodity.hs4Code &&
        importCodes.has(commodity.hs4Code),
    )
    .map((commodity) => ({
      hs4Code: commodity.hs4Code ?? "",
      label: commodity.name,
    }))
    .sort((left, right) =>
      left.hs4Code.localeCompare(right.hs4Code, "en-US", { numeric: true }),
    );
}

function getHs2Codes(options: Hs2ComparisonOption[]) {
  return options.map((option) => option.hsCode);
}

function getHs4Codes(options: Hs4ComparisonOption[]) {
  return options.map((option) => option.hs4Code);
}

function buildComparisonRows({
  periodView,
  hs4Code,
  exportDataset,
  importDataset,
}: {
  periodView: PeriodView;
  hs4Code: string;
  exportDataset: Dataset;
  importDataset: Dataset;
}) {
  const exportCommodity = exportDataset.commodities.find(
    (commodity) => commodity.hs4Code === hs4Code,
  );
  const importCommodity = importDataset.commodities.find(
    (commodity) => commodity.hs4Code === hs4Code,
  );
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
    const value = row ? getRowValue(row, exportCommodity?.id) : undefined;
    const existing = rowsByPeriod.get(displayPeriod.key);
    const existingValue = existing?.exportValue;

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
    const value = row ? getRowValue(row, importCommodity?.id) : undefined;
    const existing = rowsByPeriod.get(displayPeriod.key);
    const existingValue = existing?.importValue;

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

type Hs4ComparisonChartProps = {
  exportHs4Datasets: Dataset[];
  indiaImportHs4Datasets: Dataset[];
  chartLink?: ChartLinkProps;
};

function Hs4ComparisonChart({
  exportHs4Datasets,
  indiaImportHs4Datasets,
  chartLink,
}: Hs4ComparisonChartProps) {
  const initialChartState = chartLink?.chartState;
  const [periodView, setPeriodView] = useState<PeriodView>(() =>
    decodePeriodView(initialChartState, "g"),
  );
  const [valueMode, setValueMode] = useState<ChartValueMode>(() =>
    decodeValueMode(initialChartState, "v"),
  );
  const exportDataset = findDatasetByGranularity(exportHs4Datasets, "monthly");
  const importDataset = findDatasetByGranularity(indiaImportHs4Datasets, "monthly");
  const hs2Options = useMemo(
    () => buildHs2Options(exportDataset, importDataset),
    [exportDataset, importDataset],
  );
  const hs2Codes = useMemo(() => getHs2Codes(hs2Options), [hs2Options]);
  const defaultHs2Code = hs2Options[0]?.hsCode ?? "";
  const [hsCode, setHsCode] = useState(() =>
    decodeString(initialChartState, "h2", defaultHs2Code, hs2Codes),
  );
  const hs4Options = useMemo(
    () =>
      buildHs4Options({
        hsCode,
        exportDataset,
        importDataset,
      }),
    [exportDataset, hsCode, importDataset],
  );
  const hs4Codes = useMemo(() => getHs4Codes(hs4Options), [hs4Options]);
  const defaultHs4Code = hs4Options[0]?.hs4Code ?? "";
  const [hs4Code, setHs4Code] = useState(() =>
    decodeString(initialChartState, "h4", defaultHs4Code, hs4Codes),
  );
  const appliedChartStateKeyRef = useRef<string | undefined>(chartLink?.chartStateKey);
  const { rows, exportCommodity, importCommodity } = useMemo(
    () =>
      buildComparisonRows({
        periodView,
        hs4Code,
        exportDataset,
        importDataset,
      }),
    [exportDataset, periodView, hs4Code, importDataset],
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
    if (hsCode && hs2Options.some((option) => option.hsCode === hsCode)) {
      return;
    }

    setHsCode(hs2Options[0]?.hsCode ?? "");
  }, [hs2Options, hsCode]);

  useEffect(() => {
    if (hs4Code && hs4Options.some((option) => option.hs4Code === hs4Code)) {
      return;
    }

    setHs4Code(hs4Options[0]?.hs4Code ?? "");
  }, [hs4Code, hs4Options]);

  useEffect(() => {
    if (
      !chartLink?.chartStateKey ||
      appliedChartStateKeyRef.current === chartLink.chartStateKey
    ) {
      return;
    }

    const nextPeriodView = decodePeriodView(chartLink.chartState, "g");
    const nextExportDataset = findDatasetByGranularity(exportHs4Datasets, "monthly");
    const nextImportDataset = findDatasetByGranularity(
      indiaImportHs4Datasets,
      "monthly",
    );
    const nextHs2Options = buildHs2Options(nextExportDataset, nextImportDataset);
    const nextHs2Codes = getHs2Codes(nextHs2Options);
    const nextDefaultHs2Code = nextHs2Options[0]?.hsCode ?? "";
    const nextHs2Code = decodeString(
      chartLink.chartState,
      "h2",
      nextDefaultHs2Code,
      nextHs2Codes,
    );
    const nextHs4Options = buildHs4Options({
      hsCode: nextHs2Code,
      exportDataset: nextExportDataset,
      importDataset: nextImportDataset,
    });
    const nextHs4Codes = getHs4Codes(nextHs4Options);
    const nextDefaultHs4Code = nextHs4Options[0]?.hs4Code ?? "";

    appliedChartStateKeyRef.current = chartLink.chartStateKey;
    setPeriodView(nextPeriodView);
    setValueMode(decodeValueMode(chartLink.chartState, "v"));
    setHsCode(nextHs2Code);
    setHs4Code(
      decodeString(chartLink.chartState, "h4", nextDefaultHs4Code, nextHs4Codes),
    );
  }, [
    chartLink?.chartState,
    chartLink?.chartStateKey,
    exportHs4Datasets,
    indiaImportHs4Datasets,
  ]);

  function getChartParams(): ChartUrlState {
    const state: ChartUrlState = {};
    const encodedPeriodView = encodePeriodView(periodView);
    const encodedValueMode = encodeValueMode(valueMode);
    const encodedHs2Code = encodeString(hsCode, defaultHs2Code);
    const encodedHs4Code = encodeString(hs4Code, defaultHs4Code);
    const encodedPinnedTooltipLabel = encodePinnedTooltipLabel(
      pinnedTooltip.pinnedLabel,
    );

    if (encodedPeriodView) {
      state.g = encodedPeriodView;
    }

    if (encodedValueMode) {
      state.v = encodedValueMode;
    }

    if (encodedHs2Code) {
      state.h2 = encodedHs2Code;
    }

    if (encodedHs4Code) {
      state.h4 = encodedHs4Code;
    }

    if (encodedPinnedTooltipLabel) {
      state[pinnedTooltipStateKey] = encodedPinnedTooltipLabel;
    }

    return state;
  }

  function selectHs2(nextHsCode: string) {
    setHsCode(nextHsCode);
  }

  const selectedTitle = exportCommodity?.name ?? importCommodity?.name ?? "HS4 comparison";

  return (
    <section className="chart-section" aria-label="HS4 export import comparison">
      <div className="section-heading">
        <div>
          <h2>India exports vs US imports by HS4</h2>
          <p>
            Select an HS2 parent, then compare matched four-digit HS import and
            export series within it.
          </p>
        </div>
      </div>

      <section
        className="controls controls--hs4-comparison"
        aria-label="HS4 comparison controls"
      >
        <label className="field">
          <span>HS2 commodity</span>
          <select value={hsCode} onChange={(event) => selectHs2(event.target.value)}>
            {hs2Options.map((option) => (
              <option key={option.hsCode} value={option.hsCode}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>HS4 commodity</span>
          <select
            value={hs4Code}
            onChange={(event) => setHs4Code(event.target.value)}
          >
            {hs4Options.map((option) => (
              <option key={option.hs4Code} value={option.hs4Code}>
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
        aria-label="HS4 export import comparison chart"
      >
        <div className="chart-header">
          <div>
            <h2>{selectedTitle}</h2>
            <p>
              Export series: {exportCommodity?.name ?? "not found"}. Import
              series: {importCommodity?.name ?? "not found"}.
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

export default Hs4ComparisonChart;
