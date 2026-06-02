import { useEffect, useMemo, useState } from "react";
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
  findDatasetByGranularity,
  formatCompactNumber,
  formatPercent,
  getRowValue,
} from "../chartUtils";
import type { ComparisonRow, Dataset, Granularity } from "../types";
import EventReferenceLines from "./EventReferenceLines";
import SharedTooltip from "./SharedTooltip";
import ValueModeToggle from "./ValueModeToggle";

type Hs2ComparisonOption = {
  hsCode: string;
  label: string;
};

type Hs4ComparisonOption = {
  hs4Code: string;
  label: string;
};

const visibleYears = new Set(["2025", "2026"]);
const comparisonSeriesKeys = ["exportValue", "importValue"];

function isVisibleYear(periodKey: string) {
  return visibleYears.has(periodKey.slice(0, 4));
}

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

function buildComparisonRows({
  hs4Code,
  exportDataset,
  importDataset,
}: {
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

  for (const row of exportDataset.rows) {
    if (!isVisibleYear(row.periodKey)) {
      continue;
    }

    rowsByPeriod.set(row.periodKey, {
      periodKey: row.periodKey,
      periodLabel: row.periodLabel,
      periodSort: row.periodSort,
      exportValue: getRowValue(row, exportCommodity?.id),
    });
  }

  for (const row of importDataset.rows) {
    if (!isVisibleYear(row.periodKey)) {
      continue;
    }

    const existing = rowsByPeriod.get(row.periodKey);

    rowsByPeriod.set(row.periodKey, {
      periodKey: row.periodKey,
      periodLabel: existing?.periodLabel ?? row.periodLabel,
      periodSort: existing?.periodSort ?? row.periodSort,
      exportValue: existing?.exportValue,
      importValue: getRowValue(row, importCommodity?.id),
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

type Hs4ComparisonChartProps = {
  exportHs4Datasets: Dataset[];
  indiaImportHs4Datasets: Dataset[];
};

function Hs4ComparisonChart({
  exportHs4Datasets,
  indiaImportHs4Datasets,
}: Hs4ComparisonChartProps) {
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [valueMode, setValueMode] = useState<ChartValueMode>("value");
  const exportDataset = findDatasetByGranularity(exportHs4Datasets, granularity);
  const importDataset = findDatasetByGranularity(indiaImportHs4Datasets, granularity);
  const hs2Options = useMemo(
    () => buildHs2Options(exportDataset, importDataset),
    [exportDataset, importDataset],
  );
  const [hsCode, setHsCode] = useState(hs2Options[0]?.hsCode ?? "");
  const hs4Options = useMemo(
    () =>
      buildHs4Options({
        hsCode,
        exportDataset,
        importDataset,
      }),
    [exportDataset, hsCode, importDataset],
  );
  const [hs4Code, setHs4Code] = useState(hs4Options[0]?.hs4Code ?? "");
  const { rows, exportCommodity, importCommodity } = useMemo(
    () =>
      buildComparisonRows({
        hs4Code,
        exportDataset,
        importDataset,
      }),
    [exportDataset, hs4Code, importDataset],
  );
  const effectiveValueMode =
    granularity === "monthly" ? valueMode : "value";
  const displayRows = useMemo(() => {
    if (effectiveValueMode === "monthlyGrowth") {
      return buildMonthlyGrowthRows(rows, comparisonSeriesKeys);
    }

    return rows;
  }, [effectiveValueMode, rows]);
  const valueFormatter =
    effectiveValueMode === "monthlyGrowth" ? formatPercent : formatCompactNumber;

  useEffect(() => {
    const nextHs2 = hs2Options[0]?.hsCode ?? "";
    setHsCode(nextHs2);
  }, [exportDataset, hs2Options, importDataset]);

  useEffect(() => {
    setHs4Code(hs4Options[0]?.hs4Code ?? "");
  }, [hs4Options]);

  function selectHs2(nextHsCode: string) {
    setHsCode(nextHsCode);
  }

  const selectedTitle = exportCommodity?.name ?? importCommodity?.name ?? "HS4 comparison";

  return (
    <section className="chart-section" aria-label="HS4 export import comparison">
      <div className="section-heading">
        <div>
          <p className="eyebrow">HS4 comparison</p>
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

      <section className="chart-card" aria-label="HS4 export import comparison chart">
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
