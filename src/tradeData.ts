import type {
  Dataset,
  ExportData,
  ExportScope,
  ImportsData,
  SectorLevel,
} from "./types";
import type {
  SectorConfig,
  SectorConfigMetadata,
  SectorDatasetsByLevel,
} from "./sectorConfigs";

type GeneratedJsonModule = {
  default: unknown;
};

type ExportFileSet = {
  usMonthly: string;
  usYearly: string;
  globalMonthly: string;
  globalYearly: string;
  nonUsImportsMonthly: string;
  nonUsImportsYearly: string;
};

export type BaseImportDataBundle = {
  importDatasets: Dataset[];
  indiaImportDatasets: Dataset[];
};

export type Hs4ImportDataBundle = {
  importHs4Datasets: Dataset[];
  indiaImportHs4Datasets: Dataset[];
};

export type BaseExportDataBundle = {
  exportDatasets: Dataset[];
  exportScopeDatasets: Dataset[];
};

export type Hs4ExportDataBundle = {
  exportHs4Datasets: Dataset[];
  exportHs4ScopeDatasets: Dataset[];
};

export type UsImportsTabData = BaseImportDataBundle & Hs4ImportDataBundle;
export type IndiaExportsTabData = BaseExportDataBundle & Hs4ExportDataBundle;
export type ComparisonTabData =
  BaseImportDataBundle &
  Hs4ImportDataBundle &
  BaseExportDataBundle &
  Hs4ExportDataBundle;
export type CommodityWiseTabData = ComparisonTabData;

const generatedDataModules = import.meta.glob<GeneratedJsonModule>(
  "../data/generated/*.json",
);
const generatedDataCache = new Map<string, Promise<unknown>>();
const bundleCache = new Map<string, Promise<unknown>>();

const hs2ExportFiles: ExportFileSet = {
  usMonthly: "exports-monthly.json",
  usYearly: "exports-yearly.json",
  globalMonthly: "exports-global-monthly.json",
  globalYearly: "exports-global-yearly.json",
  nonUsImportsMonthly: "exports-non-us-imports-monthly.json",
  nonUsImportsYearly: "exports-non-us-imports-yearly.json",
};

const hs4ExportFiles: ExportFileSet = {
  usMonthly: "exports-hs4-monthly.json",
  usYearly: "exports-hs4-yearly.json",
  globalMonthly: "exports-hs4-global-monthly.json",
  globalYearly: "exports-hs4-global-yearly.json",
  nonUsImportsMonthly: "exports-hs4-non-us-imports-monthly.json",
  nonUsImportsYearly: "exports-hs4-non-us-imports-yearly.json",
};

const sectorImportFiles: Record<
  string,
  Partial<Record<SectorLevel, string>>
> = {
  "auto-parts": {
    hs2: "auto-parts-imports-hs2.json",
    hs4: "auto-parts-imports-hs4.json",
    hs6: "auto-parts-imports-hs6.json",
  },
  seafood: {
    hs2: "seafood-imports-hs2.json",
    hs4: "seafood-imports-hs4.json",
    hs6: "seafood-imports-hs6.json",
    hs8: "seafood-imports-hs8.json",
  },
  electronics: {
    hs2: "electronics-imports-hs2.json",
    hs4: "electronics-imports-hs4.json",
    hs6: "electronics-imports-hs6.json",
    hs8: "electronics-imports-hs8.json",
  },
  textiles: {
    hs2: "textiles-imports-hs2.json",
    hs4: "textiles-imports-hs4.json",
    hs6: "textiles-imports-hs6.json",
    hs8: "textiles-imports-hs8.json",
  },
  "gems-and-jewellery": {
    hs2: "gems-and-jewellery-imports-hs2.json",
    hs4: "gems-and-jewellery-imports-hs4.json",
    hs6: "gems-and-jewellery-imports-hs6.json",
    hs8: "gems-and-jewellery-imports-hs8.json",
  },
};

const sectorHs6ExportFiles: Record<string, ExportFileSet> = {
  seafood: sectorExportFileSet("seafood", "hs6"),
  electronics: sectorExportFileSet("electronics", "hs6"),
  textiles: sectorExportFileSet("textiles", "hs6"),
  "gems-and-jewellery": sectorExportFileSet("gems-and-jewellery", "hs6"),
};

const sectorHs8ExportFiles: Record<string, ExportFileSet> = {
  seafood: sectorExportFileSet("seafood", "hs8"),
  electronics: sectorExportFileSet("electronics", "hs8"),
  textiles: sectorExportFileSet("textiles", "hs8"),
  "gems-and-jewellery": sectorExportFileSet("gems-and-jewellery", "hs8"),
};

function sectorExportFileSet(sectorId: string, level: "hs6" | "hs8"): ExportFileSet {
  const prefix = `${sectorId}-exports-${level}`;

  return {
    usMonthly: `${prefix}-monthly.json`,
    usYearly: `${prefix}-yearly.json`,
    globalMonthly: `${prefix}-global-monthly.json`,
    globalYearly: `${prefix}-global-yearly.json`,
    nonUsImportsMonthly: `${prefix}-non-us-imports-monthly.json`,
    nonUsImportsYearly: `${prefix}-non-us-imports-yearly.json`,
  };
}

function cachePromise<T>(
  cache: Map<string, Promise<unknown>>,
  key: string,
  loader: () => Promise<T>,
) {
  const cached = cache.get(key);

  if (cached) {
    return cached as Promise<T>;
  }

  const promise = loader().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, promise);

  return promise;
}

function loadGeneratedJson<T>(filename: string) {
  return cachePromise(generatedDataCache, filename, async () => {
    const path = `../data/generated/${filename}`;
    const loader = generatedDataModules[path];

    if (!loader) {
      throw new Error(`Generated data file is not available: ${filename}`);
    }

    const module = await loader();
    return module.default as T;
  });
}

async function loadImportsDatasets(filename: string) {
  const data = await loadGeneratedJson<ImportsData>(filename);
  return data.datasets;
}

async function loadExportDataset(filename: string) {
  const data = await loadGeneratedJson<ExportData>(filename);
  return data.dataset;
}

function withExportScope(
  dataset: Dataset,
  scope: ExportScope,
  scopeLabel: string,
) {
  const granularityLabel =
    dataset.actualGranularity === "monthly" ? "Monthly" : "Yearly";

  return {
    ...dataset,
    scope,
    label: `${granularityLabel} ${scopeLabel}`,
  };
}

async function loadExportFileSet(files: ExportFileSet) {
  const [
    usMonthly,
    usYearly,
    globalMonthly,
    globalYearly,
    nonUsImportsMonthly,
    nonUsImportsYearly,
  ] = await Promise.all([
    loadExportDataset(files.usMonthly),
    loadExportDataset(files.usYearly),
    loadExportDataset(files.globalMonthly),
    loadExportDataset(files.globalYearly),
    loadExportDataset(files.nonUsImportsMonthly),
    loadExportDataset(files.nonUsImportsYearly),
  ]);
  const usDatasets = [
    withExportScope(usMonthly, "us", "Indian exports to the US"),
    withExportScope(usYearly, "us", "Indian exports to the US"),
  ];
  const globalDatasets = [globalMonthly, globalYearly];
  const nonUsImportAdjustedDatasets = [
    nonUsImportsMonthly,
    nonUsImportsYearly,
  ];

  return {
    usDatasets,
    scopeDatasets: [
      ...globalDatasets,
      ...usDatasets,
      ...nonUsImportAdjustedDatasets,
    ],
  };
}

function collectCodes(
  datasets: Dataset[] | undefined,
  field: "hsCode" | "hs4Code" | "hs6Code" | "hs8Code",
) {
  return [
    ...new Set(
      (datasets ?? []).flatMap((dataset) =>
        dataset.commodities
          .map((commodity) => commodity[field])
          .filter((code): code is string => Boolean(code)),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right, "en-US", { numeric: true }));
}

async function loadSectorImportDatasets(sectorId: string) {
  const filesByLevel = sectorImportFiles[sectorId];

  if (!filesByLevel) {
    throw new Error(`No import data is configured for sector: ${sectorId}`);
  }

  const entries = await Promise.all(
    Object.entries(filesByLevel).map(async ([level, filename]) => [
      level,
      await loadImportsDatasets(filename),
    ]),
  );

  return Object.fromEntries(entries) as SectorDatasetsByLevel;
}

async function loadSectorExportDatasets(sectorId: string) {
  const exportDatasetsByLevel: SectorDatasetsByLevel = {};
  const hs6Files = sectorHs6ExportFiles[sectorId];
  const hs8Files = sectorHs8ExportFiles[sectorId];

  if (!hs6Files && !hs8Files) {
    return undefined;
  }

  const [{ exportScopeDatasets }, { exportHs4ScopeDatasets }] =
    await Promise.all([loadBaseExportData(), loadHs4ExportData()]);

  exportDatasetsByLevel.hs2 = exportScopeDatasets;
  exportDatasetsByLevel.hs4 = exportHs4ScopeDatasets;

  if (hs6Files) {
    exportDatasetsByLevel.hs6 = (
      await loadExportFileSet(hs6Files)
    ).scopeDatasets;
  }

  if (hs8Files) {
    exportDatasetsByLevel.hs8 = (
      await loadExportFileSet(hs8Files)
    ).scopeDatasets;
  }

  return exportDatasetsByLevel;
}

export function loadBaseImportData() {
  return cachePromise<BaseImportDataBundle>(
    bundleCache,
    "base-import-data",
    async () => {
      const importDatasets = await loadImportsDatasets("imports.json");

      return {
        importDatasets,
        indiaImportDatasets: importDatasets.filter(
          (dataset) => dataset.country === "India",
        ),
      };
    },
  );
}

export function loadHs4ImportData() {
  return cachePromise<Hs4ImportDataBundle>(
    bundleCache,
    "hs4-import-data",
    async () => {
      const [monthlyDatasets, yearlyDatasets] = await Promise.all([
        loadImportsDatasets("imports-hs4.json"),
        loadImportsDatasets("imports-hs4-yearly.json"),
      ]);
      const importHs4Datasets = [...monthlyDatasets, ...yearlyDatasets];

      return {
        importHs4Datasets,
        indiaImportHs4Datasets: importHs4Datasets.filter(
          (dataset) => dataset.country === "India",
        ),
      };
    },
  );
}

export function loadBaseExportData() {
  return cachePromise<BaseExportDataBundle>(
    bundleCache,
    "base-export-data",
    async () => {
      const { usDatasets, scopeDatasets } = await loadExportFileSet(hs2ExportFiles);

      return {
        exportDatasets: usDatasets,
        exportScopeDatasets: scopeDatasets,
      };
    },
  );
}

export function loadHs4ExportData() {
  return cachePromise<Hs4ExportDataBundle>(
    bundleCache,
    "hs4-export-data",
    async () => {
      const { usDatasets, scopeDatasets } = await loadExportFileSet(hs4ExportFiles);

      return {
        exportHs4Datasets: usDatasets,
        exportHs4ScopeDatasets: scopeDatasets,
      };
    },
  );
}

export function loadUsImportsTabData() {
  return cachePromise<UsImportsTabData>(
    bundleCache,
    "tab-us-imports",
    async () => ({
      ...(await loadBaseImportData()),
      ...(await loadHs4ImportData()),
    }),
  );
}

export function loadIndiaExportsTabData() {
  return cachePromise<IndiaExportsTabData>(
    bundleCache,
    "tab-india-exports",
    async () => ({
      ...(await loadBaseExportData()),
      ...(await loadHs4ExportData()),
    }),
  );
}

export function loadComparisonTabData() {
  return cachePromise<ComparisonTabData>(
    bundleCache,
    "tab-comparison",
    async () => ({
      ...(await loadBaseImportData()),
      ...(await loadHs4ImportData()),
      ...(await loadBaseExportData()),
      ...(await loadHs4ExportData()),
    }),
  );
}

export function loadCommodityWiseTabData() {
  return cachePromise<CommodityWiseTabData>(
    bundleCache,
    "tab-commodity-wise",
    loadComparisonTabData,
  );
}

export function loadSectorConfig(metadata: SectorConfigMetadata) {
  return cachePromise<SectorConfig>(
    bundleCache,
    `sector-${metadata.id}`,
    async () => {
      const [datasetsByLevel, exportDatasetsByLevel] = await Promise.all([
        loadSectorImportDatasets(metadata.id),
        loadSectorExportDatasets(metadata.id),
      ]);

      return {
        ...metadata,
        datasetsByLevel,
        exportDatasetsByLevel,
        hs2Codes: metadata.hs2Codes ?? collectCodes(datasetsByLevel.hs2, "hsCode"),
        hs4Codes: metadata.hs4Codes ?? collectCodes(datasetsByLevel.hs4, "hs4Code"),
        hs6Codes: metadata.hs6Codes ?? collectCodes(datasetsByLevel.hs6, "hs6Code"),
        hs8Codes: metadata.hs8Codes ?? collectCodes(datasetsByLevel.hs8, "hs8Code"),
      };
    },
  );
}
