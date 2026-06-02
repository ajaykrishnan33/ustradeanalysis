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
  exportScopeOrder,
  formatCompactNumber,
  formatPercent,
  getExportScopeKey,
  getExportScopeLabel,
  getLineColor,
  sumCommodityValues,
} from "../chartUtils";
import type { ChartRow, Dataset, ExportScope, Granularity } from "../types";
import EventReferenceLines from "./EventReferenceLines";
import ExportScopeMultiSelect from "./ExportScopeMultiSelect";
import SharedTooltip from "./SharedTooltip";
import ValueModeToggle from "./ValueModeToggle";

type ScopedAggregateExportChartProps = {
  title: string;
  eyebrow: string;
  description: string;
  datasets: Dataset[];
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
  eyebrow,
  description,
  datasets,
}: ScopedAggregateExportChartProps) {
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [valueMode, setValueMode] = useState<ChartValueMode>("value");
  const availableScopes = useMemo(() => getAvailableScopes(datasets), [datasets]);
  const [selectedScopes, setSelectedScopes] = useState<ExportScope[]>(
    () => availableScopes,
  );
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

      <section className="chart-card" aria-label={`${title} line chart`}>
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
          <span className="granularity">{granularity}</span>
        </div>

        {selectedScopes.length > 0 ? (
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
