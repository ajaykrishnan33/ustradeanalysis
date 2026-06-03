export type Granularity = "monthly" | "yearly";
export type PeriodView = "monthly" | "calendarYear" | "fiscalYear";
export type ExportScope = "global" | "us" | "non-us-imports";
export type SectorLevel = "hs2" | "hs4" | "hs6" | "hs8";
export type AutoPartsLevel = SectorLevel;

export type Commodity = {
  id: string;
  hsCode?: string | null;
  hs4Code?: string | null;
  hs6Code?: string | null;
  hs8Code?: string | null;
  hs10CodeCount?: number;
  name: string;
  total: number;
};

export type Hs2Commodity = {
  hsCode: string;
  name: string;
};

export type ChartRow = {
  periodKey: string;
  periodLabel: string;
  periodSort: number;
  [commodityId: string]: string | number | object | undefined;
};

export type Dataset = {
  id: string;
  label: string;
  country?: string;
  scope?: ExportScope;
  sourceFile: string;
  valueLabel: string;
  expectedGranularity: Granularity;
  actualGranularity: Granularity;
  coverage?: Record<string, number[]>;
  hs2Commodities?: Hs2Commodity[];
  periods: Array<{ key: string; label: string; sort: number }>;
  commodities: Commodity[];
  rows: ChartRow[];
};

export type ImportsData = {
  datasets: Dataset[];
};

export type ExportData = {
  dataset: Dataset;
};

export type SingleDatasetData = {
  dataset: Dataset;
};

export type ComparisonRow = {
  periodKey: string;
  periodLabel: string;
  periodSort: number;
  exportValue?: number;
  importValue?: number;
};
