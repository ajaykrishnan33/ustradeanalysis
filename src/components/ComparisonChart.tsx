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
  buildSameMonthPreviousYearTooltipRows,
  type ChartValueMode,
  comparisonYearKey,
  findDatasetByGranularity,
  formatCompactNumber,
  formatPercent,
  getRowValue,
  sumCommodityValues,
} from "../chartUtils";
import { getChartTargetId, type ChartLinkProps } from "../chartLinks";
import type { ComparisonRow, Dataset, Granularity } from "../types";
import ChartLinkButton from "./ChartLinkButton";
import EventReferenceLines from "./EventReferenceLines";
import SharedTooltip from "./SharedTooltip";
import ValueModeToggle from "./ValueModeToggle";

const allCommoditiesOption = "__all_commodities__";
const comparisonSeriesKeys = ["exportValue", "importValue"];

function buildComparisonRows({
  granularity,
  hsCode,
  exportDataset,
  importDataset,
}: {
  granularity: Granularity;
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

  for (const row of exportDataset.rows) {
    const periodKey = granularity === "yearly" ? comparisonYearKey(row) : row.periodKey;
    rowsByPeriod.set(periodKey, {
      periodKey,
      periodLabel: row.periodLabel,
      periodSort: row.periodSort,
      exportValue: useAllCommodities
        ? sumCommodityValues(row, exportCommodityIds)
        : getRowValue(row, exportCommodity?.id),
    });
  }

  for (const row of importDataset.rows) {
    const periodKey = granularity === "yearly" ? comparisonYearKey(row) : row.periodKey;
    const existing = rowsByPeriod.get(periodKey);

    rowsByPeriod.set(periodKey, {
      periodKey,
      periodLabel: row.periodLabel || existing?.periodLabel || periodKey,
      periodSort: existing?.periodSort ?? row.periodSort,
      exportValue: existing?.exportValue,
      importValue: useAllCommodities
        ? sumCommodityValues(row, importCommodityIds)
        : getRowValue(row, importCommodity?.id),
    });
  }

  return {
    rows: [...rowsByPeriod.values()].sort(
      (left, right) => left.periodSort - right.periodSort,
    ),
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
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [valueMode, setValueMode] = useState<ChartValueMode>("value");
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
  const [hsCode, setHsCode] = useState(allCommoditiesOption);

  const exportDataset = findDatasetByGranularity(exportDatasets, granularity);
  const importDataset = findDatasetByGranularity(indiaImportDatasets, granularity);
  const { rows, exportCommodity, importCommodity } = useMemo(
    () =>
      buildComparisonRows({
        granularity,
        hsCode,
        exportDataset,
        importDataset,
      }),
    [exportDataset, granularity, hsCode, importDataset],
  );
  const effectiveValueMode =
    granularity === "monthly" ? valueMode : "value";
  const displayRows = useMemo(() => {
    if (effectiveValueMode === "monthlyGrowth") {
      return buildMonthlyGrowthRows(rows, comparisonSeriesKeys);
    }

    if (granularity === "monthly") {
      return buildSameMonthPreviousYearTooltipRows(rows, comparisonSeriesKeys);
    }

    return rows;
  }, [effectiveValueMode, granularity, rows]);
  const valueFormatter =
    effectiveValueMode === "monthlyGrowth" ? formatPercent : formatCompactNumber;

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
            value={granularity}
            onChange={(event) => setGranularity(event.target.value as Granularity)}
          >
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>

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
            <span className="granularity">{granularity}</span>
            {chartLink ? <ChartLinkButton {...chartLink} /> : null}
          </div>
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
