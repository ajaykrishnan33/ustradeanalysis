import type { ChartRow, Dataset, ExportScope, Granularity } from "./types";

export type ChartValueMode = "value" | "monthlyGrowth";

const dollarFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const compactDollarFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

export const exportScopeOrder: ExportScope[] = [
  "global",
  "us",
  "non-us-imports",
];

export const exportScopeLabels: Record<ExportScope, string> = {
  global: "Global Indian exports",
  us: "Indian exports to the US",
  "non-us-imports": "Global Indian exports excluding the US",
};

export const eventMarkersByGranularity: Record<
  Granularity,
  Array<{
    key: string;
    label: string;
    periodLabel: string;
    color: string;
    labelSide: "left" | "right";
  }>
> = {
  monthly: [
    {
      key: "liberation-day",
      label: "April 2, 2025",
      periodLabel: "Mar 2025",
      color: "#b42318",
      labelSide: "left",
    },
    {
      key: "russia-linked-tariffs",
      label: "Aug 27, 2025",
      periodLabel: "Aug 2025",
      color: "#7c2d12",
      labelSide: "right",
    },
  ],
  yearly: [
    {
      key: "liberation-day",
      label: "April 2, 2025",
      periodLabel: "2025",
      color: "#b42318",
      labelSide: "left",
    },
    {
      key: "russia-linked-tariffs",
      label: "Aug 27, 2025",
      periodLabel: "2025",
      color: "#7c2d12",
      labelSide: "right",
    },
  ],
};

export function getLineColor(index: number) {
  return `hsl(${(index * 137.508) % 360} 68% 42%)`;
}

export function getCountrySeriesKey(country: string) {
  return (
    country
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "unknown"
  );
}

export function getExportScopeKey(scope: ExportScope) {
  return scope.replace(/[^a-z0-9]+/g, "_");
}

export function getExportScopeLabel(scope: ExportScope) {
  return exportScopeLabels[scope];
}

export function formatNumber(value: number) {
  return dollarFormatter.format(value);
}

export function formatCompactNumber(value: number) {
  return compactDollarFormatter.format(value);
}

export function formatPercent(value: number) {
  return `${percentFormatter.format(value)}%`;
}

export function findDatasetByGranularity(
  datasets: Dataset[],
  granularity: Granularity,
) {
  return (
    datasets.find((dataset) => dataset.actualGranularity === granularity) ??
    datasets[0]
  );
}

export function comparisonYearKey(row: ChartRow) {
  return String(row.periodSort).slice(0, 4);
}

export function getRowValue(row: ChartRow, commodityId?: string) {
  if (!commodityId) {
    return undefined;
  }

  const value = row[commodityId];
  return typeof value === "number" ? value : undefined;
}

export function sumCommodityValues(row: ChartRow, commodityIds: string[]) {
  return commodityIds.reduce((sum, commodityId) => {
    return sum + (getRowValue(row, commodityId) ?? 0);
  }, 0);
}

function previousMonthSort(periodSort: number) {
  const year = Math.floor(periodSort / 100);
  const month = periodSort % 100;

  if (month === 1) {
    return (year - 1) * 100 + 12;
  }

  return year * 100 + month - 1;
}

export function buildMonthlyGrowthRows(
  rows: ChartRow[],
  dataKeys: readonly string[],
) {
  return rows.map((row, index) => {
    const previousRow = rows[index - 1];
    const nextRow: ChartRow = {
      periodKey: row.periodKey,
      periodLabel: row.periodLabel,
      periodSort: row.periodSort,
    };

    if (!previousRow || previousRow.periodSort !== previousMonthSort(row.periodSort)) {
      return nextRow;
    }

    for (const dataKey of dataKeys) {
      const currentValue = row[dataKey];
      const previousValue = previousRow[dataKey];

      if (
        typeof currentValue === "number" &&
        typeof previousValue === "number" &&
        previousValue !== 0
      ) {
        nextRow[dataKey] = ((currentValue - previousValue) / previousValue) * 100;
      }
    }

    return nextRow;
  });
}
