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
  getExportScopeLabel,
  getLineColor,
  getPeriodBoundarySorts,
  getPeriodViewGranularity,
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
  decodeStringArray,
  decodeValueMode,
  encodePeriodView,
  encodePinnedTooltipLabel,
  encodeString,
  encodeStringArray,
  encodeValueMode,
  pinnedTooltipStateKey,
  type ChartUrlState,
} from "../chartUrlState";
import type { SectorConfig } from "../sectorConfigs";
import type {
  ChartRow,
  Dataset,
  ExportScope,
  Granularity,
  PeriodView,
  SectorLevel,
} from "../types";
import ChartLinkButton from "./ChartLinkButton";
import EventReferenceLines from "./EventReferenceLines";
import PinnedTooltipReferenceLine from "./PinnedTooltipReferenceLine";
import SharedTooltip from "./SharedTooltip";
import ValueModeToggle from "./ValueModeToggle";
import usePinnedTooltip from "./usePinnedTooltip";

type SectorScopeOption = {
  key: string;
  label: string;
  type: "import" | "export";
  country?: string;
  scope?: ExportScope;
};

type Hs2Option = {
  hsCode: string;
  label: string;
};

type Hs4Option = {
  hs4Code: string;
  label: string;
};

type Hs6Option = {
  hs6Code: string;
  label: string;
};

type Hs8Option = {
  hs8Code: string;
  label: string;
};

type BasketLevel = "hs2" | "hs4" | "hs6";

type BasketItem = {
  level: BasketLevel;
  code: string;
  label: string;
};

type ParsedBasketInput = {
  selectedItems: BasketItem[];
  selectedCodes: string[];
  invalidEntries: string[];
  unknownCodes: string[];
};

type Hs6SumTimeView = PeriodView;

const defaultImportScopeKey = "import:India";
const worldTotalCountry = "World Total";
const hs6SumTimeViews: Hs6SumTimeView[] = ["monthly", "calendarYear", "fiscalYear"];
const defaultHs6SumScopeKeys = [
  getScopeKey({ type: "export", scope: "global" }),
  getScopeKey({ type: "export", scope: "non-us-imports" }),
  defaultImportScopeKey,
];
const allHs6SumCodesKey = "all";

type TooltipGrowthMode =
  | "sameMonthPreviousYear"
  | "previousCalendarYear"
  | "previousFiscalYear";
const levelKeyFields: Record<SectorLevel, "hsCode" | "hs4Code" | "hs6Code" | "hs8Code"> = {
  hs2: "hsCode",
  hs4: "hs4Code",
  hs6: "hs6Code",
  hs8: "hs8Code",
};

function getScopeKey(option: Pick<SectorScopeOption, "type" | "country" | "scope">) {
  return option.type === "export"
    ? `export:${option.scope ?? "unknown"}`
    : `import:${option.country ?? "unknown"}`;
}

function getSeriesKey(scopeKey: string) {
  return scopeKey.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
}

function getImportScopeLabel(country: string) {
  return country === worldTotalCountry
    ? "Global imports by US"
    : `US-reported imports from ${country}`;
}

function importCountrySort(left: string, right: string) {
  if (left === worldTotalCountry && right !== worldTotalCountry) {
    return -1;
  }

  if (right === worldTotalCountry && left !== worldTotalCountry) {
    return 1;
  }

  return left.localeCompare(right, "en-US", {
    numeric: true,
    sensitivity: "base",
  });
}

function isAllowedCode(allowedCodes: string[] | undefined, code?: string | null) {
  return !allowedCodes || (!!code && allowedCodes.includes(code));
}

function isAllowedHs4Commodity(
  config: SectorConfig,
  commodity: Dataset["commodities"][number],
) {
  return (
    isAllowedCode(config.hs2Codes, commodity.hsCode) &&
    isAllowedCode(config.hs4Codes, commodity.hs4Code)
  );
}

function isAllowedHs6Commodity(
  config: SectorConfig,
  commodity: Dataset["commodities"][number],
) {
  return (
    isAllowedHs4Commodity(config, commodity) &&
    isAllowedCode(config.hs6Codes, commodity.hs6Code)
  );
}

function isAllowedHs8Commodity(
  config: SectorConfig,
  commodity: Dataset["commodities"][number],
) {
  return (
    isAllowedHs6Commodity(config, commodity) &&
    isAllowedCode(config.hs8Codes, commodity.hs8Code)
  );
}

function getImportDatasets(config: SectorConfig, level: SectorLevel) {
  return config.datasetsByLevel[level] ?? [];
}

function getExportDatasets(config: SectorConfig, level: SectorLevel) {
  return config.exportDatasetsByLevel?.[level] ?? [];
}

function getBasketFallbackImportDatasets(config: SectorConfig, level: BasketLevel) {
  if (level === "hs6") {
    return [];
  }

  return config.basketFallbackImportDatasetsByLevel?.[level] ?? [];
}

function getBasketFallbackExportDatasets(config: SectorConfig, level: BasketLevel) {
  if (level === "hs6") {
    return [];
  }

  return config.basketFallbackExportDatasetsByLevel?.[level] ?? [];
}

function getLevelDatasets(config: SectorConfig, level: SectorLevel) {
  return [...getImportDatasets(config, level), ...getExportDatasets(config, level)];
}

function buildScopeOptionsFromDatasets({
  importDatasets,
  exportDatasetsByLevel,
}: {
  importDatasets: Dataset[];
  exportDatasetsByLevel?: Partial<Record<SectorLevel, Dataset[]>>;
}) {
  const exportScopes = new Set(
    Object.values(exportDatasetsByLevel ?? {})
      .flat()
      .map((dataset) => dataset.scope)
      .filter((scope): scope is ExportScope => Boolean(scope)),
  );
  const exportOptions = exportScopeOrder
    .filter((scope) => exportScopes.has(scope))
    .map<SectorScopeOption>((scope) => ({
      key: getScopeKey({ type: "export", scope }),
      label: getExportScopeLabel(scope),
      type: "export",
      scope,
    }));
  const importOptions = [
    ...new Set(
      importDatasets
        .map((dataset) => dataset.country)
        .filter((country): country is string => Boolean(country)),
    ),
  ]
    .sort(importCountrySort)
    .map<SectorScopeOption>((country) => ({
      key: getScopeKey({ type: "import", country }),
      label: getImportScopeLabel(country),
      type: "import",
      country,
    }));

  return [...exportOptions, ...importOptions];
}

function buildScopeOptions(config: SectorConfig) {
  return buildScopeOptionsFromDatasets({
    importDatasets: getImportDatasets(config, "hs2"),
    exportDatasetsByLevel: config.exportDatasetsByLevel,
  });
}

function buildBasketScopeOptions(config: SectorConfig) {
  return buildScopeOptionsFromDatasets({
    importDatasets: [
      ...getImportDatasets(config, "hs2"),
      ...getBasketFallbackImportDatasets(config, "hs2"),
    ],
    exportDatasetsByLevel: {
      ...config.basketFallbackExportDatasetsByLevel,
      ...config.exportDatasetsByLevel,
    },
  });
}

function getDefaultHs6SumScopeKeys(scopeOptions: SectorScopeOption[]) {
  const availableScopeKeys = new Set(scopeOptions.map((option) => option.key));
  const availableDefaultScopeKeys = defaultHs6SumScopeKeys.filter((scopeKey) =>
    availableScopeKeys.has(scopeKey),
  );

  if (availableDefaultScopeKeys.length > 0) {
    return availableDefaultScopeKeys;
  }

  return scopeOptions.slice(0, 1).map((option) => option.key);
}

function getDefaultScopeKeys(scopeOptions: SectorScopeOption[]) {
  return scopeOptions.some((option) => option.key === defaultImportScopeKey)
    ? [defaultImportScopeKey]
    : scopeOptions.slice(0, 1).map((option) => option.key);
}

function getHs2Codes(options: Hs2Option[]) {
  return options.map((option) => option.hsCode);
}

function getHs4Codes(options: Hs4Option[]) {
  return options.map((option) => option.hs4Code);
}

function getHs6Codes(options: Hs6Option[]) {
  return options.map((option) => option.hs6Code);
}

function getHs8Codes(options: Hs8Option[]) {
  return options.map((option) => option.hs8Code);
}

function isSectorLevel(value: string | undefined): value is SectorLevel {
  return value === "hs2" || value === "hs4" || value === "hs6" || value === "hs8";
}

function decodeHs6SumTimeView(state: ChartUrlState | undefined) {
  return decodeString(state, "bt", "monthly", hs6SumTimeViews) as Hs6SumTimeView;
}

function findDataset(
  config: SectorConfig,
  level: SectorLevel,
  granularity: Granularity,
  scope: SectorScopeOption,
) {
  if (scope.type === "export" && scope.scope) {
    return getExportDatasets(config, level).find(
      (dataset) =>
        dataset.actualGranularity === granularity && dataset.scope === scope.scope,
    );
  }

  if (scope.type === "import" && scope.country) {
    return getImportDatasets(config, level).find(
      (dataset) =>
        dataset.actualGranularity === granularity && dataset.country === scope.country,
    );
  }

  return undefined;
}

function setHs2Label(
  labelsByHs2: Map<string, string>,
  hsCode?: string | null,
  label?: string | null,
) {
  if (!hsCode || !label) {
    return;
  }

  if (!labelsByHs2.has(hsCode) || labelsByHs2.get(hsCode) === hsCode) {
    labelsByHs2.set(hsCode, label);
  }
}

function buildHs2Options(config: SectorConfig) {
  const labelsByHs2 = new Map<string, string>();

  for (const dataset of getLevelDatasets(config, "hs2")) {
    for (const commodity of dataset.commodities) {
      if (!isAllowedCode(config.hs2Codes, commodity.hsCode)) {
        continue;
      }

      setHs2Label(labelsByHs2, commodity.hsCode, commodity.name);
    }
  }

  return [...labelsByHs2.entries()]
    .map<Hs2Option>(([hsCode, label]) => ({ hsCode, label }))
    .sort((left, right) =>
      left.hsCode.localeCompare(right.hsCode, "en-US", { numeric: true }),
    );
}

function buildHs4Options(config: SectorConfig, selectedHs2Code: string) {
  const labelsByHs4 = new Map<string, string>();

  for (const dataset of getLevelDatasets(config, "hs4")) {
    for (const commodity of dataset.commodities) {
      if (
        !commodity.hs4Code ||
        commodity.hsCode !== selectedHs2Code ||
        !isAllowedHs4Commodity(config, commodity)
      ) {
        continue;
      }

      if (!labelsByHs4.has(commodity.hs4Code)) {
        labelsByHs4.set(commodity.hs4Code, commodity.name);
      }
    }
  }

  return [...labelsByHs4.entries()]
    .map<Hs4Option>(([hs4Code, label]) => ({ hs4Code, label }))
    .sort((left, right) =>
      left.hs4Code.localeCompare(right.hs4Code, "en-US", { numeric: true }),
    );
}

function buildHs6Options(config: SectorConfig, selectedHs4Code: string) {
  const labelsByHs6 = new Map<string, string>();

  for (const dataset of getLevelDatasets(config, "hs6")) {
    for (const commodity of dataset.commodities) {
      if (
        !commodity.hs6Code ||
        commodity.hs4Code !== selectedHs4Code ||
        !isAllowedHs6Commodity(config, commodity)
      ) {
        continue;
      }

      if (!labelsByHs6.has(commodity.hs6Code)) {
        labelsByHs6.set(commodity.hs6Code, commodity.name);
      }
    }
  }

  return [...labelsByHs6.entries()]
    .map<Hs6Option>(([hs6Code, label]) => ({ hs6Code, label }))
    .sort((left, right) =>
      left.hs6Code.localeCompare(right.hs6Code, "en-US", { numeric: true }),
    );
}

function buildHs8Options(config: SectorConfig, selectedHs6Code: string) {
  const labelsByHs8 = new Map<string, string>();

  for (const dataset of getLevelDatasets(config, "hs8")) {
    for (const commodity of dataset.commodities) {
      if (
        !commodity.hs8Code ||
        commodity.hs6Code !== selectedHs6Code ||
        !isAllowedHs8Commodity(config, commodity)
      ) {
        continue;
      }

      if (!labelsByHs8.has(commodity.hs8Code)) {
        labelsByHs8.set(commodity.hs8Code, commodity.name);
      }
    }
  }

  return [...labelsByHs8.entries()]
    .map<Hs8Option>(([hs8Code, label]) => ({ hs8Code, label }))
    .sort((left, right) =>
      left.hs8Code.localeCompare(right.hs8Code, "en-US", { numeric: true }),
    );
}

function buildHs10CodeCounts(config: SectorConfig) {
  const countsByHs6 = new Map<string, number>();

  for (const dataset of getImportDatasets(config, "hs6")) {
    for (const commodity of dataset.commodities) {
      if (
        !commodity.hs6Code ||
        commodity.hs10CodeCount == null ||
        !isAllowedHs6Commodity(config, commodity)
      ) {
        continue;
      }

      countsByHs6.set(
        commodity.hs6Code,
        Math.max(countsByHs6.get(commodity.hs6Code) ?? 0, commodity.hs10CodeCount),
      );
    }
  }

  return countsByHs6;
}

function getBasketLevelForCode(code: string): BasketLevel | undefined {
  if (/^\d{2}$/.test(code)) {
    return "hs2";
  }

  if (/^\d{4}$/.test(code)) {
    return "hs4";
  }

  if (/^\d{6}$/.test(code)) {
    return "hs6";
  }

  return undefined;
}

function getBasketLevelLabel(level: BasketLevel) {
  return level.toUpperCase();
}

function setBasketCatalogItem(
  catalog: Map<string, BasketItem>,
  level: BasketLevel,
  code?: string | null,
  label?: string | null,
) {
  if (!code || !label || catalog.has(code)) {
    return;
  }

  catalog.set(code, {
    level,
    code,
    label,
  });
}

function addBasketCatalogItemsFromDatasets(
  catalog: Map<string, BasketItem>,
  level: BasketLevel,
  datasets: Dataset[],
) {
  const keyField = levelKeyFields[level];

  for (const dataset of datasets) {
    for (const commodity of dataset.commodities) {
      setBasketCatalogItem(catalog, level, commodity[keyField], commodity.name);
    }
  }
}

function buildBasketCatalog(config: SectorConfig) {
  const catalog = new Map<string, BasketItem>();

  for (const dataset of getLevelDatasets(config, "hs2")) {
    for (const commodity of dataset.commodities) {
      if (!isAllowedCode(config.hs2Codes, commodity.hsCode)) {
        continue;
      }

      setBasketCatalogItem(catalog, "hs2", commodity.hsCode, commodity.name);
    }
  }

  for (const dataset of getLevelDatasets(config, "hs4")) {
    for (const commodity of dataset.commodities) {
      if (!isAllowedHs4Commodity(config, commodity)) {
        continue;
      }

      setBasketCatalogItem(catalog, "hs4", commodity.hs4Code, commodity.name);
    }
  }

  for (const dataset of getLevelDatasets(config, "hs6")) {
    for (const commodity of dataset.commodities) {
      if (!isAllowedHs6Commodity(config, commodity)) {
        continue;
      }

      setBasketCatalogItem(catalog, "hs6", commodity.hs6Code, commodity.name);
    }
  }

  addBasketCatalogItemsFromDatasets(
    catalog,
    "hs2",
    [
      ...getBasketFallbackImportDatasets(config, "hs2"),
      ...getBasketFallbackExportDatasets(config, "hs2"),
    ],
  );
  addBasketCatalogItemsFromDatasets(
    catalog,
    "hs4",
    [
      ...getBasketFallbackImportDatasets(config, "hs4"),
      ...getBasketFallbackExportDatasets(config, "hs4"),
    ],
  );

  return catalog;
}

function isContainedBySelectedHigherLevel(
  item: BasketItem,
  selectedCodes: Set<string>,
) {
  if (item.level === "hs2") {
    return false;
  }

  if (selectedCodes.has(item.code.slice(0, 2))) {
    return true;
  }

  return item.level === "hs6" && selectedCodes.has(item.code.slice(0, 4));
}

function normalizeBasketItems(items: BasketItem[]) {
  const selectedCodes = new Set(items.map((item) => item.code));

  return items.filter(
    (item) => !isContainedBySelectedHigherLevel(item, selectedCodes),
  );
}

function parseBasketInput(
  value: string,
  basketCatalog: Map<string, BasketItem>,
): ParsedBasketInput {
  const tokens = value
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const selectedItems: BasketItem[] = [];
  const invalidEntries: string[] = [];
  const unknownCodes: string[] = [];
  const seenCodes = new Set<string>();
  const seenInvalidEntries = new Set<string>();
  const seenUnknownCodes = new Set<string>();

  for (const token of tokens) {
    if (!getBasketLevelForCode(token)) {
      if (!seenInvalidEntries.has(token)) {
        invalidEntries.push(token);
        seenInvalidEntries.add(token);
      }

      continue;
    }

    if (seenCodes.has(token)) {
      continue;
    }

    seenCodes.add(token);

    const item = basketCatalog.get(token);

    if (!item) {
      if (!seenUnknownCodes.has(token)) {
        unknownCodes.push(token);
        seenUnknownCodes.add(token);
      }

      continue;
    }

    selectedItems.push(item);
  }

  const normalizedItems = normalizeBasketItems(selectedItems);

  return {
    selectedItems: normalizedItems,
    selectedCodes: normalizedItems.map((item) => item.code),
    invalidEntries,
    unknownCodes,
  };
}

function findCommodity(dataset: Dataset | undefined, level: SectorLevel, code: string) {
  const keyField = levelKeyFields[level];

  return dataset?.commodities.find((commodity) => commodity[keyField] === code);
}

function getHs6SumPeriod(period: Dataset["periods"][number], timeView: Hs6SumTimeView) {
  return getPeriodViewPeriod(period, timeView);
}

function getHs6SumGranularity(timeView: Hs6SumTimeView): Granularity {
  return getPeriodViewGranularity(timeView);
}

function getHs6SumGranularityLabel(timeView: Hs6SumTimeView) {
  return getPeriodViewLabel(timeView);
}

function getHs6SumBoundaryPeriodSorts(
  periodSort: number,
  timeView: Hs6SumTimeView,
) {
  return getPeriodBoundarySorts(periodSort, timeView);
}

function addHs6SumMonthCoverage({
  coverageByPeriod,
  itemCode,
  periodKey,
  seriesKey,
  sourcePeriodSort,
}: {
  coverageByPeriod: Map<string, Map<string, Map<string, Set<number>>>>;
  itemCode: string;
  periodKey: string;
  seriesKey: string;
  sourcePeriodSort: number;
}) {
  let coverageBySeries = coverageByPeriod.get(periodKey);

  if (!coverageBySeries) {
    coverageBySeries = new Map();
    coverageByPeriod.set(periodKey, coverageBySeries);
  }

  let coverageByItem = coverageBySeries.get(seriesKey);

  if (!coverageByItem) {
    coverageByItem = new Map();
    coverageBySeries.set(seriesKey, coverageByItem);
  }

  let coveredPeriods = coverageByItem.get(itemCode);

  if (!coveredPeriods) {
    coveredPeriods = new Set();
    coverageByItem.set(itemCode, coveredPeriods);
  }

  coveredPeriods.add(sourcePeriodSort);
}

function hasHs6SumBoundaryCoverage({
  basketItems,
  row,
  seriesKeys,
  timeView,
  coverageByPeriod,
}: {
  basketItems: readonly BasketItem[];
  row: ChartRow;
  seriesKeys: readonly string[];
  timeView: Hs6SumTimeView;
  coverageByPeriod: Map<string, Map<string, Map<string, Set<number>>>>;
}) {
  const boundarySorts = getHs6SumBoundaryPeriodSorts(row.periodSort, timeView);

  if (!boundarySorts) {
    return true;
  }

  const coverageBySeries = coverageByPeriod.get(row.periodKey);

  return seriesKeys.every((seriesKey) => {
    const coverageByItem = coverageBySeries?.get(seriesKey);

    return basketItems.every((item) => {
      const coveredPeriods = coverageByItem?.get(item.code);

      return Boolean(
        coveredPeriods &&
          boundarySorts.every((periodSort) => coveredPeriods.has(periodSort)),
      );
    });
  });
}

function addBasketValueToRows({
  rowsByPeriod,
  coverageByPeriod,
  item,
  dataset,
  commodity,
  seriesKey,
  timeView,
}: {
  rowsByPeriod: Map<string, ChartRow>;
  coverageByPeriod: Map<string, Map<string, Map<string, Set<number>>>>;
  item: BasketItem;
  dataset: Dataset;
  commodity?: Dataset["commodities"][number];
  seriesKey: string;
  timeView: Hs6SumTimeView;
}) {
  for (const period of dataset.periods) {
    const displayPeriod = getHs6SumPeriod(period, timeView);

    if (timeView !== "monthly") {
      addHs6SumMonthCoverage({
        coverageByPeriod,
        itemCode: item.code,
        periodKey: displayPeriod.key,
        seriesKey,
        sourcePeriodSort: period.sort,
      });
    }

    const sourceRow = dataset.rows.find((row) => row.periodKey === period.key);
    const value = sourceRow && commodity ? getRowValue(sourceRow, commodity.id) ?? 0 : 0;
    const existing = rowsByPeriod.get(displayPeriod.key);
    const existingValue = existing?.[seriesKey];

    rowsByPeriod.set(displayPeriod.key, {
      periodKey: displayPeriod.key,
      periodLabel: existing?.periodLabel ?? displayPeriod.label,
      periodSort: existing?.periodSort ?? displayPeriod.sort,
      ...existing,
      [seriesKey]:
        (typeof existingValue === "number" ? existingValue : 0) + value,
    });
  }
}

function findBasketFallbackDataset(
  config: SectorConfig,
  item: BasketItem,
  granularity: Granularity,
  scope: SectorScopeOption,
) {
  if (item.level === "hs6") {
    return undefined;
  }

  if (scope.type === "export" && scope.scope) {
    return getBasketFallbackExportDatasets(config, item.level).find(
      (dataset) =>
        dataset.actualGranularity === granularity && dataset.scope === scope.scope,
    );
  }

  if (scope.type === "import" && scope.country) {
    return getBasketFallbackImportDatasets(config, item.level).find(
      (dataset) =>
        dataset.actualGranularity === granularity && dataset.country === scope.country,
    );
  }

  return undefined;
}

function findBasketDataset(
  config: SectorConfig,
  item: BasketItem,
  granularity: Granularity,
  scope: SectorScopeOption,
) {
  const sectorDataset = findDataset(config, item.level, granularity, scope);
  const sectorCommodity = findCommodity(sectorDataset, item.level, item.code);

  if (sectorDataset && (sectorCommodity || item.level === "hs6")) {
    return {
      dataset: sectorDataset,
      commodity: sectorCommodity,
    };
  }

  const fallbackDataset = findBasketFallbackDataset(config, item, granularity, scope);

  if (fallbackDataset) {
    return {
      dataset: fallbackDataset,
      commodity: findCommodity(fallbackDataset, item.level, item.code),
    };
  }

  return sectorDataset
    ? {
        dataset: sectorDataset,
        commodity: sectorCommodity,
      }
    : undefined;
}

function buildBasketRows({
  config,
  selectedScopes,
  basketItems,
  timeView,
}: {
  config: SectorConfig;
  selectedScopes: SectorScopeOption[];
  basketItems: BasketItem[];
  timeView: Hs6SumTimeView;
}) {
  const rowsByPeriod = new Map<string, ChartRow>();
  const coverageByPeriod = new Map<string, Map<string, Map<string, Set<number>>>>();
  const seriesKeys = selectedScopes.map((scope) => getSeriesKey(scope.key));

  if (basketItems.length === 0) {
    return [];
  }

  for (const scope of selectedScopes) {
    const seriesKey = getSeriesKey(scope.key);

    for (const item of basketItems) {
      const basketDataset = findBasketDataset(config, item, "monthly", scope);

      if (!basketDataset) {
        continue;
      }

      addBasketValueToRows({
        rowsByPeriod,
        coverageByPeriod,
        item,
        dataset: basketDataset.dataset,
        commodity: basketDataset.commodity,
        seriesKey,
        timeView,
      });
    }
  }

  return [...rowsByPeriod.values()]
    .filter((row) =>
      hasHs6SumBoundaryCoverage({
        basketItems,
        row,
        seriesKeys,
        timeView,
        coverageByPeriod,
      }),
    )
    .sort((left, right) => left.periodSort - right.periodSort);
}

function buildRows({
  config,
  selectedScopes,
  periodView,
  commodityCode,
  level,
}: {
  config: SectorConfig;
  selectedScopes: SectorScopeOption[];
  periodView: PeriodView;
  commodityCode: string;
  level: SectorLevel;
}) {
  const rowsByPeriod = new Map<string, ChartRow>();
  const coverageByPeriod = new Map<string, Map<string, Set<number>>>();
  const coverageSeriesKeys = new Set<string>();

  if (!commodityCode) {
    return [];
  }

  for (const scope of selectedScopes) {
    const dataset = findDataset(config, level, "monthly", scope);
    const commodity = findCommodity(dataset, level, commodityCode);

    if (!dataset || !commodity) {
      continue;
    }

    const seriesKey = getSeriesKey(scope.key);
    const rowsBySourcePeriod = new Map(
      dataset.rows.map((row) => [row.periodKey, row]),
    );
    coverageSeriesKeys.add(seriesKey);

    for (const period of dataset.periods) {
      const displayPeriod = getPeriodViewPeriod(period, periodView);
      const sourceRow = rowsBySourcePeriod.get(period.key);
      const value = sourceRow ? getRowValue(sourceRow, commodity.id) : undefined;
      const existing = rowsByPeriod.get(displayPeriod.key);
      const existingValue = existing?.[seriesKey];

      if (periodView !== "monthly") {
        addPeriodCoverage({
          coverageByPeriod,
          periodKey: displayPeriod.key,
          seriesKey,
          sourcePeriodSort: period.sort,
        });
      }

      rowsByPeriod.set(displayPeriod.key, {
        periodKey: displayPeriod.key,
        periodLabel: existing?.periodLabel ?? displayPeriod.label,
        periodSort: existing?.periodSort ?? displayPeriod.sort,
        ...existing,
        [seriesKey]:
          (typeof existingValue === "number" ? existingValue : 0) + (value ?? 0),
      });
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

function SectorScopeMultiSelect({
  scopeOptions,
  selectedScopeKeys,
  onChange,
}: {
  scopeOptions: SectorScopeOption[];
  selectedScopeKeys: string[];
  onChange: (scopeKeys: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedSet = useMemo(
    () => new Set(selectedScopeKeys),
    [selectedScopeKeys],
  );
  const summary = useMemo(() => {
    if (selectedScopeKeys.length === 0) {
      return "No scopes";
    }

    if (selectedScopeKeys.length === scopeOptions.length) {
      return "All scopes";
    }

    if (selectedScopeKeys.length === 1) {
      return (
        scopeOptions.find((option) => option.key === selectedScopeKeys[0])?.label ??
        "1 scope"
      );
    }

    return `${selectedScopeKeys.length} scopes`;
  }, [scopeOptions, selectedScopeKeys]);

  function toggleScope(scopeKey: string) {
    if (selectedSet.has(scopeKey)) {
      onChange(selectedScopeKeys.filter((key) => key !== scopeKey));
      return;
    }

    onChange([
      ...selectedScopeKeys.filter((key) =>
        scopeOptions.some((option) => option.key === key),
      ),
      scopeKey,
    ]);
  }

  return (
    <div className="field country-multiselect commodity-scope-multiselect">
      <span>Scopes</span>
      <div className="country-multiselect__control">
        <button
          type="button"
          className="country-multiselect__button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((previous) => !previous)}
        >
          <span>{summary}</span>
          <span aria-hidden="true">▾</span>
        </button>

        {isOpen ? (
          <div className="country-multiselect__panel">
            <div className="country-multiselect__actions">
              <button
                type="button"
                onClick={() => onChange(scopeOptions.map((option) => option.key))}
              >
                Select all
              </button>
              <button type="button" onClick={() => onChange([])}>
                Clear
              </button>
            </div>

            <div className="country-multiselect__options">
              {scopeOptions.map((option) => (
                <label className="country-multiselect__option" key={option.key}>
                  <input
                    type="checkbox"
                    checked={selectedSet.has(option.key)}
                    onChange={() => toggleScope(option.key)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Hs6SumSidePanel({
  basketItems,
  hs10CodeCounts,
  selectedHs6SumCode,
  onChange,
}: {
  basketItems: BasketItem[];
  hs10CodeCounts: Map<string, number>;
  selectedHs6SumCode: string;
  onChange: (hs6Code: string) => void;
}) {
  function getHs10CountLabel(item: BasketItem) {
    if (item.level !== "hs6") {
      return undefined;
    }

    const count = hs10CodeCounts.get(item.code);

    if (count == null) {
      return "HS10 count unavailable";
    }

    return `${count} HS10 code${count === 1 ? "" : "s"}`;
  }

  return (
    <aside className="hs6-sum-panel" aria-label="Product group basket selection">
      <div className="hs6-sum-panel__header">
        <h2>Product groups</h2>
        <span>{basketItems.length} codes</span>
      </div>

      <div className="hs6-sum-panel__options">
        <button
          type="button"
          className={
            selectedHs6SumCode === allHs6SumCodesKey
              ? "hs6-sum-panel__option hs6-sum-panel__option--active"
              : "hs6-sum-panel__option"
          }
          aria-pressed={selectedHs6SumCode === allHs6SumCodesKey}
          onClick={() => onChange(allHs6SumCodesKey)}
        >
          <strong>All</strong>
          <span>Combine all selected product groups</span>
        </button>

        {basketItems.map((item) => {
          const hs10CountLabel = getHs10CountLabel(item);

          return (
          <button
            type="button"
            key={item.code}
            className={
              selectedHs6SumCode === item.code
                ? "hs6-sum-panel__option hs6-sum-panel__option--active"
                : "hs6-sum-panel__option"
            }
            aria-pressed={selectedHs6SumCode === item.code}
            onClick={() => onChange(item.code)}
          >
            <strong>
              {getBasketLevelLabel(item.level)} {item.code}
            </strong>
            <span>{item.label}</span>
            {hs10CountLabel ? <span>{hs10CountLabel}</span> : null}
          </button>
          );
        })}
      </div>
    </aside>
  );
}

function SectorLineChart({
  title,
  description,
  emptyMessage,
  rows,
  selectedScopes,
  granularity,
  granularityLabel,
  periodView,
  chartLink,
  tooltipGrowthMode,
  effectiveValueMode,
  valueFormatter,
}: {
  title: string;
  description: string;
  emptyMessage: string;
  rows: ChartRow[];
  selectedScopes: SectorScopeOption[];
  granularity: Granularity;
  granularityLabel?: string;
  periodView?: PeriodView;
  chartLink?: ChartLinkProps;
  tooltipGrowthMode?: TooltipGrowthMode;
  effectiveValueMode: ChartValueMode;
  valueFormatter: (value: number) => string;
}) {
  const seriesKeys = useMemo(
    () => selectedScopes.map((scope) => getSeriesKey(scope.key)),
    [selectedScopes],
  );
  const displayRows = useMemo(() => {
    if (effectiveValueMode === "monthlyGrowth") {
      return buildMonthlyGrowthRows(rows, seriesKeys);
    }

    if (tooltipGrowthMode === "sameMonthPreviousYear") {
      return buildSameMonthPreviousYearTooltipRows(rows, seriesKeys);
    }

    if (tooltipGrowthMode === "previousCalendarYear") {
      return buildPreviousCalendarYearTooltipRows(rows, seriesKeys);
    }

    if (tooltipGrowthMode === "previousFiscalYear") {
      return buildPreviousFiscalYearTooltipRows(rows, seriesKeys);
    }

    return rows;
  }, [effectiveValueMode, rows, seriesKeys, tooltipGrowthMode]);
  const pinnedTooltip = usePinnedTooltip({
    rows: displayRows,
    initialPinnedLabel: decodePinnedTooltipLabel(
      chartLink?.chartState,
      displayRows.map((row) => row.periodLabel),
    ),
    stateKey: chartLink?.chartStateKey,
  });

  function getPinnedChartParams(): ChartUrlState {
    const state = chartLink?.getChartParams?.() ?? {};
    const encodedPinnedTooltipLabel = encodePinnedTooltipLabel(
      pinnedTooltip.pinnedLabel,
    );

    if (encodedPinnedTooltipLabel) {
      state[pinnedTooltipStateKey] = encodedPinnedTooltipLabel;
    }

    return state;
  }

  return (
    <section
      className={chartLink ? "chart-card chart-target" : "chart-card"}
      id={
        chartLink
          ? getChartTargetId(chartLink.activeTab, chartLink.chartId)
          : undefined
      }
      aria-label={`${title} chart`}
    >
      <div className="chart-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="chart-header__actions">
          <span className="granularity">{granularityLabel ?? granularity}</span>
          {chartLink ? (
            <ChartLinkButton {...chartLink} getChartParams={getPinnedChartParams} />
          ) : null}
        </div>
      </div>

      {selectedScopes.length > 0 && rows.length > 0 ? (
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
                angle={displayRows.length > 8 ? -35 : 0}
                textAnchor={displayRows.length > 8 ? "end" : "middle"}
                height={displayRows.length > 8 ? 70 : 36}
                tickMargin={12}
              />
              <YAxis
                tickFormatter={(value) => valueFormatter(Number(value))}
                width={82}
              />
              <Tooltip
                {...pinnedTooltip.tooltipProps}
                allowEscapeViewBox={{ y: true }}
                content={
                  <SharedTooltip
                    isPinned={pinnedTooltip.isPinned}
                    onClearPinned={pinnedTooltip.clearPinnedTooltip}
                    valueFormatter={
                      effectiveValueMode === "monthlyGrowth" ? formatPercent : undefined
                    }
                  />
                }
                wrapperStyle={{ whiteSpace: "normal", zIndex: 30 }}
              />
              <EventReferenceLines granularity={granularity} periodView={periodView} />
              <PinnedTooltipReferenceLine label={pinnedTooltip.pinnedLabel} />
              {selectedScopes.map((scope, index) => (
                <Line
                  key={scope.key}
                  type="monotone"
                  dataKey={getSeriesKey(scope.key)}
                  name={scope.label}
                  stroke={getLineColor(index)}
                  strokeWidth={2}
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
        <div className="empty-state">{emptyMessage}</div>
      )}
    </section>
  );
}

export function SectorImportsTab({
  config,
  activeTab,
  activeChart,
  chartState,
  chartStateKey,
  onChartLink,
}: {
  config: SectorConfig;
  activeTab: string;
  activeChart?: string;
  chartState?: ChartUrlState;
  chartStateKey?: string;
  onChartLink: (chartId: string, chartState?: ChartUrlState) => void;
}) {
  const levelsToRender = config.levelsToRender ?? ["hs2", "hs4", "hs6"];
  const shouldRenderHs8 = levelsToRender.includes("hs8");
  const scopeOptions = useMemo(() => buildScopeOptions(config), [config]);
  const basketScopeOptions = useMemo(() => buildBasketScopeOptions(config), [config]);
  const hs2Options = useMemo(() => buildHs2Options(config), [config]);
  const basketCatalog = useMemo(() => buildBasketCatalog(config), [config]);
  const hs10CodeCounts = useMemo(() => buildHs10CodeCounts(config), [config]);
  const standardChartIds = levelsToRender;
  const defaultScopeKeys = useMemo(() => getDefaultScopeKeys(scopeOptions), [scopeOptions]);
  const defaultHs6SumScopeKeys = useMemo(
    () => getDefaultHs6SumScopeKeys(basketScopeOptions),
    [basketScopeOptions],
  );
  const scopeKeys = useMemo(
    () => scopeOptions.map((option) => option.key),
    [scopeOptions],
  );
  const basketScopeKeys = useMemo(
    () => basketScopeOptions.map((option) => option.key),
    [basketScopeOptions],
  );
  const knownBasketCodes = useMemo(
    () => [...basketCatalog.keys()],
    [basketCatalog],
  );
  const defaultBasketCodes = useMemo(
    () =>
      parseBasketInput(config.defaultHs6SumCodes.join("\n"), basketCatalog).selectedCodes,
    [basketCatalog, config.defaultHs6SumCodes],
  );
  const hs2Codes = useMemo(() => getHs2Codes(hs2Options), [hs2Options]);
  const defaultHs2Code = hs2Options[0]?.hsCode ?? "";
  const initialStandardState =
    isSectorLevel(activeChart) && standardChartIds.includes(activeChart)
      ? chartState
      : undefined;
  const initialBasketState = activeChart === "hs6-sum" ? chartState : undefined;
  const initialHs6SumCodes = useMemo(
    () => {
      const decodedCodes = decodeStringArray(
        initialBasketState,
        "bc",
        defaultBasketCodes,
        knownBasketCodes,
      );

      return parseBasketInput(decodedCodes.join("\n"), basketCatalog).selectedCodes;
    },
    [basketCatalog, defaultBasketCodes, initialBasketState, knownBasketCodes],
  );
  const [periodView, setPeriodView] = useState<PeriodView>(() =>
    decodePeriodView(initialStandardState, "g"),
  );
  const granularity = getPeriodViewGranularity(periodView);
  const granularityLabel = getPeriodViewLabel(periodView);
  const [valueMode, setValueMode] = useState<ChartValueMode>(() =>
    decodeValueMode(initialStandardState, "v"),
  );
  const [selectedScopeKeys, setSelectedScopeKeys] = useState<string[]>(() =>
    decodeStringArray(initialStandardState, "sc", defaultScopeKeys, scopeKeys),
  );
  const [selectedHs6SumScopeKeys, setSelectedHs6SumScopeKeys] = useState<string[]>(
    () =>
      decodeStringArray(
        initialBasketState,
        "bsc",
        defaultHs6SumScopeKeys,
        basketScopeKeys,
      ),
  );
  const [hs6SumTimeView, setHs6SumTimeView] = useState<Hs6SumTimeView>(() =>
    decodeHs6SumTimeView(initialBasketState),
  );
  const [hs6SumValueMode, setHs6SumValueMode] = useState<ChartValueMode>(() =>
    decodeValueMode(initialBasketState, "bvm"),
  );
  const [selectedHs2Code, setSelectedHs2Code] = useState(() =>
    decodeString(initialStandardState, "h2", defaultHs2Code, hs2Codes),
  );
  const hs4Options = useMemo(
    () => buildHs4Options(config, selectedHs2Code),
    [config, selectedHs2Code],
  );
  const hs4Codes = useMemo(() => getHs4Codes(hs4Options), [hs4Options]);
  const defaultHs4Code = hs4Options[0]?.hs4Code ?? "";
  const [selectedHs4Code, setSelectedHs4Code] = useState(() =>
    decodeString(initialStandardState, "h4", defaultHs4Code, hs4Codes),
  );
  const hs6Options = useMemo(
    () => buildHs6Options(config, selectedHs4Code),
    [config, selectedHs4Code],
  );
  const hs6Codes = useMemo(() => getHs6Codes(hs6Options), [hs6Options]);
  const defaultHs6Code = hs6Options[0]?.hs6Code ?? "";
  const [selectedHs6Code, setSelectedHs6Code] = useState(() =>
    decodeString(initialStandardState, "h6", defaultHs6Code, hs6Codes),
  );
  const hs8Options = useMemo(
    () => buildHs8Options(config, selectedHs6Code),
    [config, selectedHs6Code],
  );
  const hs8Codes = useMemo(() => getHs8Codes(hs8Options), [hs8Options]);
  const defaultHs8Code = hs8Options[0]?.hs8Code ?? "";
  const [selectedHs8Code, setSelectedHs8Code] = useState(() =>
    decodeString(initialStandardState, "h8", defaultHs8Code, hs8Codes),
  );
  const [hs6SumInput, setHs6SumInput] = useState(initialHs6SumCodes.join("\n"));
  const [selectedHs6SumCode, setSelectedHs6SumCode] = useState(() =>
    decodeString(initialBasketState, "bsel", allHs6SumCodesKey, [
      allHs6SumCodesKey,
      ...initialHs6SumCodes,
    ]),
  );
  const appliedChartStateKeyRef = useRef<string | undefined>(chartStateKey);
  const selectedScopes = useMemo(
    () =>
      selectedScopeKeys
        .map((scopeKey) => scopeOptions.find((option) => option.key === scopeKey))
        .filter((option): option is SectorScopeOption => Boolean(option)),
    [scopeOptions, selectedScopeKeys],
  );
  const selectedHs6SumScopes = useMemo(
    () =>
      selectedHs6SumScopeKeys
        .map((scopeKey) => basketScopeOptions.find((option) => option.key === scopeKey))
        .filter((option): option is SectorScopeOption => Boolean(option)),
    [basketScopeOptions, selectedHs6SumScopeKeys],
  );
  const selectedHs2Option = hs2Options.find(
    (option) => option.hsCode === selectedHs2Code,
  );
  const selectedHs4Option = hs4Options.find(
    (option) => option.hs4Code === selectedHs4Code,
  );
  const selectedHs6Option = hs6Options.find(
    (option) => option.hs6Code === selectedHs6Code,
  );
  const selectedHs8Option = hs8Options.find(
    (option) => option.hs8Code === selectedHs8Code,
  );
  const effectiveValueMode =
    periodView === "monthly" ? valueMode : "value";
  const valueFormatter =
    effectiveValueMode === "monthlyGrowth" ? formatPercent : formatCompactNumber;
  const tooltipGrowthMode: TooltipGrowthMode | undefined =
    periodView === "monthly"
      ? "sameMonthPreviousYear"
      : periodView === "calendarYear"
        ? "previousCalendarYear"
        : periodView === "fiscalYear"
          ? "previousFiscalYear"
          : undefined;
  const hs6SumEffectiveValueMode =
    hs6SumTimeView === "monthly" ? hs6SumValueMode : "value";
  const hs6SumValueFormatter =
    hs6SumEffectiveValueMode === "monthlyGrowth" ? formatPercent : formatCompactNumber;
  const hs6SumGranularity = getHs6SumGranularity(hs6SumTimeView);
  const hs6SumGranularityLabel = getHs6SumGranularityLabel(hs6SumTimeView);
  const hs6SumTooltipGrowthMode: TooltipGrowthMode | undefined =
    hs6SumTimeView === "monthly"
      ? "sameMonthPreviousYear"
      : hs6SumTimeView === "calendarYear"
        ? "previousCalendarYear"
        : hs6SumTimeView === "fiscalYear"
          ? "previousFiscalYear"
          : undefined;
  const hs2Rows = useMemo(
    () =>
      buildRows({
        config,
        selectedScopes,
        periodView,
        commodityCode: selectedHs2Code,
        level: "hs2",
      }),
    [config, periodView, selectedHs2Code, selectedScopes],
  );
  const hs4Rows = useMemo(
    () =>
      buildRows({
        config,
        selectedScopes,
        periodView,
        commodityCode: selectedHs4Code,
        level: "hs4",
      }),
    [config, periodView, selectedHs4Code, selectedScopes],
  );
  const hs6Rows = useMemo(
    () =>
      buildRows({
        config,
        selectedScopes,
        periodView,
        commodityCode: selectedHs6Code,
        level: "hs6",
      }),
    [config, periodView, selectedHs6Code, selectedScopes],
  );
  const hs8Rows = useMemo(
    () =>
      buildRows({
        config,
        selectedScopes,
        periodView,
        commodityCode: selectedHs8Code,
        level: "hs8",
      }),
    [config, periodView, selectedHs8Code, selectedScopes],
  );
  const parsedBasketInput = useMemo(
    () => parseBasketInput(hs6SumInput, basketCatalog),
    [basketCatalog, hs6SumInput],
  );
  const activeBasketItems = useMemo(() => {
    if (selectedHs6SumCode === allHs6SumCodesKey) {
      return parsedBasketInput.selectedItems;
    }

    const selectedItem = parsedBasketInput.selectedItems.find(
      (item) => item.code === selectedHs6SumCode,
    );

    return selectedItem ? [selectedItem] : parsedBasketInput.selectedItems;
  }, [parsedBasketInput.selectedItems, selectedHs6SumCode]);
  const hs6SumRows = useMemo(
    () =>
      buildBasketRows({
        config,
        selectedScopes: selectedHs6SumScopes,
        basketItems: activeBasketItems,
        timeView: hs6SumTimeView,
      }),
    [activeBasketItems, config, hs6SumTimeView, selectedHs6SumScopes],
  );
  const hs6SumDescription = (() => {
    if (parsedBasketInput.selectedItems.length === 0) {
      return `Choose one or more product groups from the ${config.title} data to compare them as a custom basket.`;
    }

    const periodDescription =
      hs6SumTimeView === "calendarYear"
        ? "Calendar-year totals show the combined value for each year."
        : hs6SumTimeView === "fiscalYear"
          ? "Fiscal-year totals run from April through March."
          : "Monthly values show each period directly.";

    if (selectedHs6SumCode !== allHs6SumCodesKey) {
      const selectedItem = parsedBasketInput.selectedItems.find(
        (item) => item.code === selectedHs6SumCode,
      );
      const selectedItemLabel = selectedItem
        ? `${getBasketLevelLabel(selectedItem.level)} ${selectedItem.code}: ${selectedItem.label}`
        : selectedHs6SumCode;

      return `Showing one product group, ${selectedItemLabel}. ${periodDescription} ${
        hs6SumEffectiveValueMode === "monthlyGrowth"
          ? "Values shown as % growth."
          : "Values shown in US dollars."
      }`;
    }

    return `Showing a custom basket of ${parsedBasketInput.selectedItems.length} product group${
      parsedBasketInput.selectedItems.length === 1 ? "" : "s"
    } (${parsedBasketInput.selectedCodes.join(", ")}). ${periodDescription} ${
      hs6SumEffectiveValueMode === "monthlyGrowth"
        ? "Values shown as % growth."
        : "Values shown in US dollars."
    }`;
  })();
  const sectorTitleLower = config.title.toLowerCase();

  useEffect(() => {
    if (selectedHs2Code && hs2Options.some((option) => option.hsCode === selectedHs2Code)) {
      return;
    }

    setSelectedHs2Code(defaultHs2Code);
  }, [defaultHs2Code, hs2Options, selectedHs2Code]);

  useEffect(() => {
    const nextHs4Code = hs4Options[0]?.hs4Code ?? "";

    if (!selectedHs2Code) {
      setSelectedHs4Code("");
      return;
    }

    if (
      !selectedHs4Code ||
      !hs4Options.some((option) => option.hs4Code === selectedHs4Code)
    ) {
      setSelectedHs4Code(nextHs4Code);
    }
  }, [hs4Options, selectedHs2Code, selectedHs4Code]);

  useEffect(() => {
    const nextHs6Code = hs6Options[0]?.hs6Code ?? "";

    if (!selectedHs4Code) {
      setSelectedHs6Code("");
      return;
    }

    if (
      !selectedHs6Code ||
      !hs6Options.some((option) => option.hs6Code === selectedHs6Code)
    ) {
      setSelectedHs6Code(nextHs6Code);
    }
  }, [hs6Options, selectedHs4Code, selectedHs6Code]);

  useEffect(() => {
    const nextHs8Code = hs8Options[0]?.hs8Code ?? "";

    if (!selectedHs6Code) {
      setSelectedHs8Code("");
      return;
    }

    if (
      !selectedHs8Code ||
      !hs8Options.some((option) => option.hs8Code === selectedHs8Code)
    ) {
      setSelectedHs8Code(nextHs8Code);
    }
  }, [hs8Options, selectedHs6Code, selectedHs8Code]);

  useEffect(() => {
    if (
      selectedHs6SumCode !== allHs6SumCodesKey &&
      !parsedBasketInput.selectedCodes.includes(selectedHs6SumCode)
    ) {
      setSelectedHs6SumCode(allHs6SumCodesKey);
    }
  }, [parsedBasketInput.selectedCodes, selectedHs6SumCode]);

  useEffect(() => {
    if (
      !chartStateKey ||
      appliedChartStateKeyRef.current === chartStateKey ||
      activeChart !== "hs6-sum"
    ) {
      return;
    }

    const nextDecodedBasketCodes = decodeStringArray(
      chartState,
      "bc",
      defaultBasketCodes,
      knownBasketCodes,
    );
    const nextBasketCodes = parseBasketInput(
      nextDecodedBasketCodes.join("\n"),
      basketCatalog,
    ).selectedCodes;

    appliedChartStateKeyRef.current = chartStateKey;
    setSelectedHs6SumScopeKeys(
      decodeStringArray(chartState, "bsc", defaultHs6SumScopeKeys, basketScopeKeys),
    );
    setHs6SumTimeView(decodeHs6SumTimeView(chartState));
    setHs6SumValueMode(decodeValueMode(chartState, "bvm"));
    setHs6SumInput(nextBasketCodes.join("\n"));
    setSelectedHs6SumCode(
      decodeString(chartState, "bsel", allHs6SumCodesKey, [
        allHs6SumCodesKey,
        ...nextBasketCodes,
      ]),
    );
  }, [
    activeChart,
    basketCatalog,
    basketScopeKeys,
    chartState,
    chartStateKey,
    defaultBasketCodes,
    defaultHs6SumScopeKeys,
    knownBasketCodes,
  ]);

  useEffect(() => {
    if (
      !chartStateKey ||
      appliedChartStateKeyRef.current === chartStateKey ||
      !activeChart ||
      !isSectorLevel(activeChart) ||
      !standardChartIds.includes(activeChart)
    ) {
      return;
    }

    const nextDefaultHs2Code = hs2Options[0]?.hsCode ?? "";
    const nextHs2Code = decodeString(chartState, "h2", nextDefaultHs2Code, hs2Codes);
    const nextHs4Options = buildHs4Options(config, nextHs2Code);
    const nextHs4Codes = getHs4Codes(nextHs4Options);
    const nextDefaultHs4Code = nextHs4Options[0]?.hs4Code ?? "";
    const nextHs4Code = decodeString(
      chartState,
      "h4",
      nextDefaultHs4Code,
      nextHs4Codes,
    );
    const nextHs6Options = buildHs6Options(config, nextHs4Code);
    const nextHs6Codes = getHs6Codes(nextHs6Options);
    const nextDefaultHs6Code = nextHs6Options[0]?.hs6Code ?? "";
    const nextHs6Code = decodeString(
      chartState,
      "h6",
      nextDefaultHs6Code,
      nextHs6Codes,
    );
    const nextHs8Options = buildHs8Options(config, nextHs6Code);
    const nextHs8Codes = getHs8Codes(nextHs8Options);
    const nextDefaultHs8Code = nextHs8Options[0]?.hs8Code ?? "";

    appliedChartStateKeyRef.current = chartStateKey;
    setPeriodView(decodePeriodView(chartState, "g"));
    setValueMode(decodeValueMode(chartState, "v"));
    setSelectedScopeKeys(decodeStringArray(chartState, "sc", defaultScopeKeys, scopeKeys));
    setSelectedHs2Code(nextHs2Code);
    setSelectedHs4Code(nextHs4Code);
    setSelectedHs6Code(nextHs6Code);
    setSelectedHs8Code(
      decodeString(chartState, "h8", nextDefaultHs8Code, nextHs8Codes),
    );
  }, [
    activeChart,
    chartState,
    chartStateKey,
    config,
    defaultScopeKeys,
    hs2Codes,
    hs2Options,
    scopeKeys,
    standardChartIds,
  ]);

  function getHs6SumChartParams(): ChartUrlState {
    const state: ChartUrlState = {};
    const encodedScopes = encodeStringArray(
      selectedHs6SumScopeKeys,
      defaultHs6SumScopeKeys,
    );
    const encodedTimeView = encodeString(hs6SumTimeView, "monthly");
    const encodedValueMode = encodeValueMode(hs6SumValueMode);
    const encodedCodes = encodeStringArray(
      parsedBasketInput.selectedCodes,
      defaultBasketCodes,
    );
    const selectedBasketCode =
      selectedHs6SumCode !== allHs6SumCodesKey &&
      parsedBasketInput.selectedCodes.includes(selectedHs6SumCode)
        ? selectedHs6SumCode
        : allHs6SumCodesKey;
    const encodedSelectedCode = encodeString(selectedBasketCode, allHs6SumCodesKey);

    if (encodedScopes) {
      state.bsc = encodedScopes;
    }

    if (encodedTimeView) {
      state.bt = encodedTimeView;
    }

    if (encodedValueMode) {
      state.bvm = encodedValueMode;
    }

    if (encodedCodes) {
      state.bc = encodedCodes;
    }

    if (encodedSelectedCode) {
      state.bsel = encodedSelectedCode;
    }

    return state;
  }

  function getStandardChartParams(): ChartUrlState {
    const state: ChartUrlState = {};
    const encodedPeriodView = encodePeriodView(periodView);
    const encodedValueMode = encodeValueMode(valueMode);
    const encodedScopes = encodeStringArray(selectedScopeKeys, defaultScopeKeys);
    const encodedHs2Code = encodeString(selectedHs2Code, defaultHs2Code);
    const encodedHs4Code = encodeString(selectedHs4Code, defaultHs4Code);
    const encodedHs6Code = encodeString(selectedHs6Code, defaultHs6Code);
    const encodedHs8Code = encodeString(selectedHs8Code, defaultHs8Code);

    if (encodedPeriodView) {
      state.g = encodedPeriodView;
    }

    if (encodedValueMode) {
      state.v = encodedValueMode;
    }

    if (encodedScopes) {
      state.sc = encodedScopes;
    }

    if (encodedHs2Code) {
      state.h2 = encodedHs2Code;
    }

    if (encodedHs4Code) {
      state.h4 = encodedHs4Code;
    }

    if (encodedHs6Code) {
      state.h6 = encodedHs6Code;
    }

    if (shouldRenderHs8 && encodedHs8Code) {
      state.h8 = encodedHs8Code;
    }

    return state;
  }

  return (
    <section className="chart-section" aria-label={`${config.title} imports`}>
      <div className="section-heading">
        <div>
          <h2>{config.title}</h2>
          <p>{config.description}</p>
        </div>
      </div>

      <section className="sector-sum-section" aria-label={`Custom ${config.title} product basket`}>
        <div className="section-heading">
          <div>
            <h2>Custom {config.title} product basket</h2>
            <p>
              Pick the product groups you care about, and this chart combines
              them into one basket so you can compare that basket across import
              and export scopes.
            </p>
          </div>
        </div>

        <section className="controls controls--auto-parts controls--hs6-sum" aria-label={`Custom ${config.title} product basket controls`}>
          <SectorScopeMultiSelect
            scopeOptions={basketScopeOptions}
            selectedScopeKeys={selectedHs6SumScopeKeys}
            onChange={setSelectedHs6SumScopeKeys}
          />

          <label className="field">
            <span>Period</span>
            <select
              value={hs6SumTimeView}
              onChange={(event) =>
                setHs6SumTimeView(event.target.value as Hs6SumTimeView)
              }
            >
              <option value="monthly">Monthly</option>
              <option value="calendarYear">Calendar Year</option>
              <option value="fiscalYear">Fiscal Year</option>
            </select>
          </label>

          {hs6SumTimeView === "monthly" ? (
            <ValueModeToggle valueMode={hs6SumValueMode} onChange={setHs6SumValueMode} />
          ) : null}

          <label className="field field--auto-parts-select">
            <span>Product groups to include</span>
            <textarea
              className="hs6-sum-input"
              value={hs6SumInput}
              onChange={(event) => setHs6SumInput(event.target.value)}
              placeholder="Enter HS2, HS4, or HS6 codes separated by commas, spaces, or new lines, e.g. 85, 8501, 850110"
              rows={3}
            />
          </label>

          <div className="hs6-sum-summary" aria-live="polite">
            {parsedBasketInput.selectedItems.length > 0 ? (
              <p>
                Included:{" "}
                {parsedBasketInput.selectedItems
                  .map(
                    (item) =>
                      `${getBasketLevelLabel(item.level)} ${item.code} (${item.label})`,
                  )
                  .join("; ")}
              </p>
            ) : (
              <p>No valid known HS2, HS4, or HS6 codes selected.</p>
            )}

            {parsedBasketInput.unknownCodes.length > 0 ? (
              <p>Unknown HS codes ignored: {parsedBasketInput.unknownCodes.join(", ")}</p>
            ) : null}

            {parsedBasketInput.invalidEntries.length > 0 ? (
              <p>Invalid entries ignored: {parsedBasketInput.invalidEntries.join(", ")}</p>
            ) : null}
          </div>
        </section>

        <div className="hs6-sum-chart-layout">
          <Hs6SumSidePanel
            basketItems={parsedBasketInput.selectedItems}
            hs10CodeCounts={hs10CodeCounts}
            selectedHs6SumCode={selectedHs6SumCode}
            onChange={setSelectedHs6SumCode}
          />

          <SectorLineChart
            title={`Custom ${sectorTitleLower} product basket`}
            description={hs6SumDescription}
            emptyMessage="Enter at least one known product group code and select one or more scopes to display this basket chart."
            rows={hs6SumRows}
            selectedScopes={selectedHs6SumScopes}
            granularity={hs6SumGranularity}
            granularityLabel={hs6SumGranularityLabel}
            periodView={hs6SumTimeView}
            chartLink={{
              activeTab,
              chartId: "hs6-sum",
              chartState: activeChart === "hs6-sum" ? chartState : undefined,
              chartStateKey: activeChart === "hs6-sum" ? chartStateKey : undefined,
              getChartParams: getHs6SumChartParams,
              onChartLink,
            }}
            tooltipGrowthMode={hs6SumTooltipGrowthMode}
            effectiveValueMode={hs6SumEffectiveValueMode}
            valueFormatter={hs6SumValueFormatter}
          />
        </div>
      </section>

      <section className="controls controls--auto-parts" aria-label={`${config.title} controls`}>
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

        <SectorScopeMultiSelect
          scopeOptions={scopeOptions}
          selectedScopeKeys={selectedScopeKeys}
          onChange={setSelectedScopeKeys}
        />

        {periodView === "monthly" ? (
          <ValueModeToggle valueMode={valueMode} onChange={setValueMode} />
        ) : null}

        <label className="field field--auto-parts-select">
          <span>HS2 commodity</span>
          <select
            value={selectedHs2Code}
            onChange={(event) => setSelectedHs2Code(event.target.value)}
          >
            <option value="">Select an HS2 commodity</option>
            {hs2Options.map((option) => (
              <option key={option.hsCode} value={option.hsCode}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="auto-parts-grid">
        <SectorLineChart
          title={`${config.title} HS2 commodity`}
          description={
            selectedHs2Option
              ? `Selected HS2: ${selectedHs2Option.label}. ${
                  effectiveValueMode === "monthlyGrowth"
                    ? "Values shown as % growth."
                    : "Values shown in US dollars."
                }`
              : `Choose an HS2 commodity from the ${sectorTitleLower} source data.`
          }
          emptyMessage="Select an HS2 commodity and at least one scope to display this chart."
          rows={hs2Rows}
          selectedScopes={selectedScopes}
          granularity={granularity}
          granularityLabel={granularityLabel}
          periodView={periodView}
          chartLink={{
            activeTab,
            chartId: "hs2",
            chartState: activeChart === "hs2" ? chartState : undefined,
            chartStateKey: activeChart === "hs2" ? chartStateKey : undefined,
            getChartParams: getStandardChartParams,
            onChartLink,
          }}
          tooltipGrowthMode={tooltipGrowthMode}
          effectiveValueMode={effectiveValueMode}
          valueFormatter={valueFormatter}
        />

        <section className="controls controls--auto-parts-secondary" aria-label={`HS4 ${config.title} control`}>
          <label className="field field--auto-parts-select">
            <span>HS4 commodity</span>
            <select
              value={selectedHs4Code}
              onChange={(event) => setSelectedHs4Code(event.target.value)}
              disabled={!selectedHs2Code}
            >
              <option value="">Select an HS4 commodity</option>
              {hs4Options.map((option) => (
                <option key={option.hs4Code} value={option.hs4Code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <SectorLineChart
          title={`${config.title} HS4 commodity`}
          description={
            selectedHs4Option
              ? `Selected HS4: ${selectedHs4Option.label}. ${
                  effectiveValueMode === "monthlyGrowth"
                    ? "Values shown as % growth."
                    : "Values shown in US dollars."
                }`
              : "Choose an HS4 commodity within the selected HS2 commodity."
          }
          emptyMessage="Select an HS4 commodity and at least one scope to display this chart."
          rows={hs4Rows}
          selectedScopes={selectedScopes}
          granularity={granularity}
          granularityLabel={granularityLabel}
          periodView={periodView}
          chartLink={{
            activeTab,
            chartId: "hs4",
            chartState: activeChart === "hs4" ? chartState : undefined,
            chartStateKey: activeChart === "hs4" ? chartStateKey : undefined,
            getChartParams: getStandardChartParams,
            onChartLink,
          }}
          tooltipGrowthMode={tooltipGrowthMode}
          effectiveValueMode={effectiveValueMode}
          valueFormatter={valueFormatter}
        />

        <section className="controls controls--auto-parts-secondary" aria-label={`HS6 ${config.title} control`}>
          <label className="field field--auto-parts-select">
            <span>HS6 commodity</span>
            <select
              value={selectedHs6Code}
              onChange={(event) => setSelectedHs6Code(event.target.value)}
              disabled={!selectedHs4Code}
            >
              <option value="">Select an HS6 commodity</option>
              {hs6Options.map((option) => (
                <option key={option.hs6Code} value={option.hs6Code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <SectorLineChart
          title={`${config.title} HS6 commodity`}
          description={
            selectedHs6Option
              ? `Selected HS6: ${selectedHs6Option.label}. ${
                  effectiveValueMode === "monthlyGrowth"
                    ? "Values shown as % growth."
                    : "Values shown in US dollars."
                }`
              : "Choose an HS6 commodity within the selected HS4 commodity."
          }
          emptyMessage="Select an HS6 commodity and at least one scope to display this chart."
          rows={hs6Rows}
          selectedScopes={selectedScopes}
          granularity={granularity}
          granularityLabel={granularityLabel}
          periodView={periodView}
          chartLink={{
            activeTab,
            chartId: "hs6",
            chartState: activeChart === "hs6" ? chartState : undefined,
            chartStateKey: activeChart === "hs6" ? chartStateKey : undefined,
            getChartParams: getStandardChartParams,
            onChartLink,
          }}
          tooltipGrowthMode={tooltipGrowthMode}
          effectiveValueMode={effectiveValueMode}
          valueFormatter={valueFormatter}
        />

        {shouldRenderHs8 ? (
          <>
            <section className="controls controls--auto-parts-secondary" aria-label={`HS8 ${config.title} control`}>
              <label className="field field--auto-parts-select">
                <span>HS8 commodity</span>
                <select
                  value={selectedHs8Code}
                  onChange={(event) => setSelectedHs8Code(event.target.value)}
                  disabled={!selectedHs6Code}
                >
                  <option value="">Select an HS8 commodity</option>
                  {hs8Options.map((option) => (
                    <option key={option.hs8Code} value={option.hs8Code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <SectorLineChart
              title={`${config.title} HS8 commodity`}
              description={
                selectedHs8Option
                  ? `Selected HS8: ${selectedHs8Option.label}. ${
                      effectiveValueMode === "monthlyGrowth"
                        ? "Values shown as % growth."
                        : "Values shown in US dollars."
                    }`
                  : "Choose an HS8 commodity within the selected HS6 commodity."
              }
              emptyMessage="Select an HS8 commodity and at least one scope to display this chart."
              rows={hs8Rows}
              selectedScopes={selectedScopes}
              granularity={granularity}
              granularityLabel={granularityLabel}
              periodView={periodView}
              chartLink={{
                activeTab,
                chartId: "hs8",
                chartState: activeChart === "hs8" ? chartState : undefined,
                chartStateKey: activeChart === "hs8" ? chartStateKey : undefined,
                getChartParams: getStandardChartParams,
                onChartLink,
              }}
              tooltipGrowthMode={tooltipGrowthMode}
              effectiveValueMode={effectiveValueMode}
              valueFormatter={valueFormatter}
            />
          </>
        ) : null}

      </div>
    </section>
  );
}

export default SectorImportsTab;
