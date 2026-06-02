import ExcelJS from "exceljs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "data", "generated");
const scopeSources = [
  {
    scope: "us",
    scopeLabel: "Indian exports to the US",
    sourceRoot: path.join(rootDir, "data", "raw", "tradestat", "exports", "hs4", "us"),
    sourceFile: "data/raw/tradestat/exports/hs4/us",
    monthlyOutput: "exports-hs4-monthly.json",
    yearlyOutput: "exports-hs4-yearly.json",
    monthlyId: "exports-hs4-monthly",
    yearlyId: "exports-hs4-yearly",
  },
  {
    scope: "global",
    scopeLabel: "Global Indian exports",
    sourceRoot: path.join(rootDir, "data", "raw", "tradestat", "exports", "hs4", "global"),
    sourceFile: "data/raw/tradestat/exports/hs4/global",
    monthlyOutput: "exports-hs4-global-monthly.json",
    yearlyOutput: "exports-hs4-global-yearly.json",
    monthlyId: "exports-hs4-global-monthly",
    yearlyId: "exports-hs4-global-yearly",
  },
];

const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const monthNameToNumber = new Map(
  monthNames.map((monthName, index) => [monthName.toLowerCase(), index + 1]),
);

function normalizeCell(value) {
  if (value == null) {
    return "";
  }

  if (typeof value === "object" && "text" in value) {
    return String(value.text ?? "").trim();
  }

  if (typeof value === "object" && "result" in value) {
    return String(value.result ?? "").trim();
  }

  return String(value).trim();
}

function parseNumber(value) {
  const raw = normalizeCell(value);

  if (!raw || raw === "-") {
    return 0;
  }

  const parsed = Number(raw.replace(/,/g, ""));

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value: ${raw}`);
  }

  return parsed;
}

function formatMonthLabel(year, month) {
  return `${monthNames[month - 1]} ${year}`;
}

function formatYearLabel(year, months) {
  if (months.length === 12) {
    return String(year);
  }

  const lastMonth = Math.max(...months);
  return `${year} through ${monthNames[lastMonth - 1]}`;
}

function commoditySort(left, right) {
  return left.hs4Code.localeCompare(right.hs4Code, "en-US", { numeric: true });
}

function getCellText(row, columnNumber) {
  return normalizeCell(row.getCell(columnNumber).value);
}

function findMonthlyValueColumns(headerRow) {
  const columns = [];

  headerRow.eachCell((cell, columnNumber) => {
    const header = normalizeCell(cell.value).replace(/\s+/g, " ");
    const match = header.match(
      /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{4})\b/i,
    );

    if (!match) {
      return;
    }

    columns.push({
      columnNumber,
      year: Number(match[2]),
      month: monthNameToNumber.get(match[1].toLowerCase()),
    });
  });

  return columns;
}

async function readHs2Names() {
  const names = new Map();
  const sources = [
    { scope: "global", file: "exports-global-monthly.json" },
    { scope: "us", file: "exports-monthly.json" },
    { scope: "non-us-imports", file: "exports-non-us-imports-monthly.json" },
  ];

  for (const source of sources) {
    const exportsJson = JSON.parse(
      await readFile(path.join(outputDir, source.file), "utf8"),
    );

    for (const commodity of exportsJson.dataset?.commodities ?? []) {
      if (!commodity.hsCode || !commodity.name) {
        continue;
      }

      const scopedKey = `${source.scope}|${commodity.hsCode}`;

      if (!names.has(scopedKey)) {
        names.set(scopedKey, commodity.name);
      }

      const genericKey = `*|${commodity.hsCode}`;

      if (!names.has(genericKey)) {
        names.set(genericKey, commodity.name);
      }
    }
  }

  return names;
}

function buildHs2Commodities(commodities, hs2Names, scope) {
  return [
    ...new Set(commodities.map((commodity) => commodity.hsCode)),
  ]
    .sort((left, right) => left.localeCompare(right, "en-US", { numeric: true }))
    .map((hsCode) => ({
      hsCode,
      name:
        hs2Names.get(`${scope}|${hsCode}`) ??
        hs2Names.get(`us|${hsCode}`) ??
        hs2Names.get(`global|${hsCode}`) ??
        hs2Names.get(`*|${hsCode}`) ??
        hsCode,
    }));
}

async function listWorkbooks(sourceRoot, sourceFile) {
  const folderEntries = await readdir(sourceRoot, { withFileTypes: true });
  const yearFolders = folderEntries
    .filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const workbooks = [];

  for (const yearFolder of yearFolders) {
    const folderPath = path.join(sourceRoot, yearFolder);
    const fileEntries = await readdir(folderPath, { withFileTypes: true });

    for (const entry of fileEntries) {
      if (entry.isFile() && /\.xlsx$/i.test(entry.name)) {
        workbooks.push({
          path: path.join(folderPath, entry.name),
          relativePath: path.join(sourceFile, yearFolder, entry.name),
          folderYear: Number(yearFolder),
          filename: entry.name,
        });
      }
    }
  }

  return workbooks.sort((left, right) => {
    if (left.folderYear !== right.folderYear) {
      return left.folderYear - right.folderYear;
    }

    return left.filename.localeCompare(right.filename);
  });
}

async function readWorkbookEntries(workbookInfo) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookInfo.path);

  const worksheet = workbook.worksheets[0];
  const reportLine = getCellText(worksheet.getRow(2), 1);

  if (!/US\s*\$\s*Million/i.test(reportLine)) {
    throw new Error(`${workbookInfo.relativePath} does not report values in US $ Million`);
  }

  const headerRow = worksheet.getRow(3);
  const valueColumns = findMonthlyValueColumns(headerRow);

  if (valueColumns.length === 0) {
    throw new Error(`${workbookInfo.relativePath} has no month-specific value columns`);
  }

  const entries = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 3) {
      return;
    }

    const hs4Code = getCellText(row, 2).padStart(4, "0");
    const commodityName = getCellText(row, 3).replace(/\.$/, "");

    if (!/^\d{4}$/.test(hs4Code) || !commodityName) {
      return;
    }

    const hsCode = hs4Code.slice(0, 2);

    for (const valueColumn of valueColumns) {
      const value = parseNumber(row.getCell(valueColumn.columnNumber).value) * 1_000_000;

      entries.push({
        hsCode,
        hs4Code,
        commodityName,
        commodityLabel: `${hs4Code} ${commodityName}`,
        periodKey: `${valueColumn.year}-${String(valueColumn.month).padStart(2, "0")}`,
        periodLabel: formatMonthLabel(valueColumn.year, valueColumn.month),
        periodSort: valueColumn.year * 100 + valueColumn.month,
        year: valueColumn.year,
        month: valueColumn.month,
        value,
        sourceFolderYear: workbookInfo.folderYear,
        sourceFile: workbookInfo.relativePath,
      });
    }
  });

  return entries;
}

function dedupeEntries(entries) {
  const byKey = new Map();
  const conflicts = [];

  for (const entry of entries) {
    const key = `${entry.periodKey}|${entry.hs4Code}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, entry);
      continue;
    }

    if (existing.value !== entry.value) {
      conflicts.push({ existing, replacement: entry });
    }

    if (entry.sourceFolderYear >= existing.sourceFolderYear) {
      byKey.set(key, entry);
    }
  }

  return {
    entries: [...byKey.values()],
    conflicts,
  };
}

function buildDataset({
  id,
  label,
  scope,
  sourceFile,
  granularity,
  periods,
  commodities,
  values,
  coverage,
  hs2Commodities,
}) {
  const datasetCommodities = commodities.map((commodity) => ({
    ...commodity,
    total: 0,
  }));
  const rows = periods.map((period) => {
    const row = {
      periodKey: period.key,
      periodLabel: period.label,
      periodSort: period.sort,
    };

    for (const commodity of datasetCommodities) {
      const value = values.get(`${period.key}|${commodity.hs4Code}`);

      if (value != null) {
        row[commodity.id] = value;
        commodity.total += value;
      }
    }

    return row;
  });

  return {
    dataset: {
      id,
      label,
      scope,
      sourceFile,
      valueLabel: "Export value (US $)",
      expectedGranularity: granularity,
      actualGranularity: granularity,
      coverage,
      hs2Commodities,
      periods,
      commodities: datasetCommodities,
      rows,
    },
  };
}

function buildCoverage(entries) {
  const coverageByYear = new Map();

  for (const entry of entries) {
    if (!coverageByYear.has(entry.year)) {
      coverageByYear.set(entry.year, new Set());
    }

    coverageByYear.get(entry.year).add(entry.month);
  }

  return Object.fromEntries(
    [...coverageByYear.entries()]
      .sort(([leftYear], [rightYear]) => leftYear - rightYear)
      .map(([year, months]) => [
        String(year),
        [...months].sort((left, right) => left - right),
      ]),
  );
}

function buildDatasetsFromEntries({
  scope,
  scopeLabel,
  sourceFile,
  monthlyId,
  yearlyId,
  entries,
  hs2Names,
}) {
  const commodityByCode = new Map();
  const monthlyPeriodsByKey = new Map();
  const monthlyValues = new Map();

  for (const entry of entries) {
    if (!commodityByCode.has(entry.hs4Code)) {
      commodityByCode.set(entry.hs4Code, {
        id: `hs4_${entry.hs4Code}`,
        hsCode: entry.hsCode,
        hs4Code: entry.hs4Code,
        name: entry.commodityLabel,
        total: 0,
      });
    }

    monthlyPeriodsByKey.set(entry.periodKey, {
      key: entry.periodKey,
      label: entry.periodLabel,
      sort: entry.periodSort,
    });
    monthlyValues.set(`${entry.periodKey}|${entry.hs4Code}`, entry.value);
  }

  const commodities = [...commodityByCode.values()].sort(commoditySort);
  const hs2Commodities = buildHs2Commodities(commodities, hs2Names, scope);
  const monthlyPeriods = [...monthlyPeriodsByKey.values()].sort(
    (left, right) => left.sort - right.sort,
  );
  const coverage = buildCoverage(entries);
  const yearlyPeriods = Object.entries(coverage).map(([year, months]) => ({
    key: year,
    label: formatYearLabel(Number(year), months),
    sort: Number(year) * 100 + Math.max(...months),
  }));
  const yearlyValues = new Map();

  for (const entry of entries) {
    const key = `${entry.year}|${entry.hs4Code}`;
    yearlyValues.set(key, (yearlyValues.get(key) ?? 0) + entry.value);
  }

  return {
    commodities,
    monthlyPeriods,
    yearlyPeriods,
    monthly: buildDataset({
      id: monthlyId,
      label: `Monthly HS4 ${scopeLabel}`,
      scope,
      sourceFile,
      granularity: "monthly",
      periods: monthlyPeriods,
      commodities,
      values: monthlyValues,
      coverage,
      hs2Commodities,
    }),
    yearly: buildDataset({
      id: yearlyId,
      label: `Yearly HS4 ${scopeLabel}`,
      scope,
      sourceFile,
      granularity: "yearly",
      periods: yearlyPeriods,
      commodities,
      values: yearlyValues,
      coverage,
      hs2Commodities,
    }),
  };
}

async function processScope(config, hs2Names) {
  const workbooks = await listWorkbooks(config.sourceRoot, config.sourceFile);
  const allEntries = (await Promise.all(workbooks.map(readWorkbookEntries))).flat();
  const { entries, conflicts } = dedupeEntries(allEntries);
  const datasets = buildDatasetsFromEntries({
    scope: config.scope,
    scopeLabel: config.scopeLabel,
    sourceFile: config.sourceFile,
    monthlyId: config.monthlyId,
    yearlyId: config.yearlyId,
    entries,
    hs2Names,
  });

  return {
    ...config,
    workbooks,
    entries,
    conflicts,
    datasets,
  };
}

function deriveNonUsEntries(globalEntries, usEntries) {
  const usValueByKey = new Map(
    usEntries.map((entry) => [`${entry.periodKey}|${entry.hs4Code}`, entry.value]),
  );

  return globalEntries.map((entry) => ({
    ...entry,
    value: Math.max(
      entry.value - (usValueByKey.get(`${entry.periodKey}|${entry.hs4Code}`) ?? 0),
      0,
    ),
    sourceFile: "Derived from global exports minus Indian exports to the US",
  }));
}

async function readIndiaHs4ImportEntries() {
  const importsJson = JSON.parse(
    await readFile(path.join(outputDir, "imports-hs4.json"), "utf8"),
  );
  const indiaMonthlyDataset = importsJson.datasets?.find(
    (dataset) =>
      dataset.country === "India" && dataset.actualGranularity === "monthly",
  );

  if (!indiaMonthlyDataset) {
    throw new Error("Could not find monthly India HS4 imports in data/generated/imports-hs4.json");
  }

  const entries = [];

  for (const row of indiaMonthlyDataset.rows ?? []) {
    const year = Math.floor(Number(row.periodSort) / 100);
    const month = Number(row.periodSort) % 100;

    for (const commodity of indiaMonthlyDataset.commodities ?? []) {
      if (!commodity.hs4Code) {
        continue;
      }

      const value = row[commodity.id];

      if (typeof value === "number") {
        entries.push({
          hsCode: commodity.hsCode ?? commodity.hs4Code.slice(0, 2),
          hs4Code: commodity.hs4Code,
          commodityName: commodity.name,
          commodityLabel: commodity.name,
          periodKey: row.periodKey,
          periodLabel: row.periodLabel,
          periodSort: Number(row.periodSort),
          year,
          month,
          value,
          sourceFolderYear: year,
          sourceFile: indiaMonthlyDataset.sourceFile,
        });
      }
    }
  }

  return entries;
}

function deriveImportAdjustedEntries(globalEntries, importEntries) {
  const sourceFile = "Derived from global exports minus US-reported HS4 imports from India";
  const importValueByKey = new Map(
    importEntries.map((entry) => [`${entry.periodKey}|${entry.hs4Code}`, entry.value]),
  );
  const globalKeys = new Set(
    globalEntries.map((entry) => `${entry.periodKey}|${entry.hs4Code}`),
  );
  const derivedEntries = globalEntries.map((entry) => ({
    ...entry,
    value:
      entry.value -
      (importValueByKey.get(`${entry.periodKey}|${entry.hs4Code}`) ?? 0),
    sourceFile,
  }));

  for (const entry of importEntries) {
    if (globalKeys.has(`${entry.periodKey}|${entry.hs4Code}`)) {
      continue;
    }

    derivedEntries.push({
      ...entry,
      value: -entry.value,
      sourceFile,
    });
  }

  return derivedEntries;
}

const hs2Names = await readHs2Names();
const [usResult, globalResult, indiaHs4ImportEntries] = await Promise.all([
  ...scopeSources.map((config) => processScope(config, hs2Names)),
  readIndiaHs4ImportEntries(),
]);
const importAdjustedEntries = deriveImportAdjustedEntries(
  globalResult.entries,
  indiaHs4ImportEntries,
);
const importAdjustedDatasets = buildDatasetsFromEntries({
  scope: "non-us-imports",
  scopeLabel: "Global Indian exports excluding the US",
  sourceFile: "Derived from global exports minus US-reported HS4 imports from India",
  monthlyId: "exports-hs4-non-us-imports-monthly",
  yearlyId: "exports-hs4-non-us-imports-yearly",
  entries: importAdjustedEntries,
  hs2Names,
});

await mkdir(outputDir, { recursive: true });

for (const result of [usResult, globalResult]) {
  await writeFile(
    path.join(outputDir, result.monthlyOutput),
    `${JSON.stringify(result.datasets.monthly, null, 2)}\n`,
  );
  await writeFile(
    path.join(outputDir, result.yearlyOutput),
    `${JSON.stringify(result.datasets.yearly, null, 2)}\n`,
  );
}

await writeFile(
  path.join(outputDir, "exports-hs4-non-us-imports-monthly.json"),
  `${JSON.stringify(importAdjustedDatasets.monthly, null, 2)}\n`,
);
await writeFile(
  path.join(outputDir, "exports-hs4-non-us-imports-yearly.json"),
  `${JSON.stringify(importAdjustedDatasets.yearly, null, 2)}\n`,
);

for (const result of [usResult, globalResult]) {
  const hs2Count = new Set(
    result.datasets.commodities.map((commodity) => commodity.hsCode),
  ).size;
  console.log(
    `TradeStat HS4 ${result.scopeLabel}: ${result.workbooks.length} workbooks, ${result.datasets.commodities.length} HS4 commodities, ${hs2Count} HS2 parents`,
  );
  console.log(`${result.scopeLabel} monthly HS4 export periods: ${result.datasets.monthlyPeriods.length}`);
  console.log(`${result.scopeLabel} yearly HS4 export periods: ${result.datasets.yearlyPeriods.length}`);

  if (result.conflicts.length > 0) {
    console.warn(
      `TradeStat HS4 ${result.scopeLabel} duplicate conflicts: ${result.conflicts.length}. Newer workbook folder values were used.`,
    );
  }
}

const importAdjustedHs2Count = new Set(
  importAdjustedDatasets.commodities.map((commodity) => commodity.hsCode),
).size;
console.log(
  `TradeStat HS4 Global Indian exports excluding the US: ${importAdjustedDatasets.commodities.length} HS4 commodities, ${importAdjustedHs2Count} HS2 parents`,
);
console.log(`Global Indian exports excluding the US monthly HS4 export periods: ${importAdjustedDatasets.monthlyPeriods.length}`);
console.log(`Global Indian exports excluding the US yearly HS4 export periods: ${importAdjustedDatasets.yearlyPeriods.length}`);
