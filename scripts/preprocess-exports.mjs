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
    sourceRoot: path.join(rootDir, "data", "raw", "tradestat", "exports", "hs2", "us"),
    sourceFile: "data/raw/tradestat/exports/hs2/us",
    monthlyOutput: "exports-monthly.json",
    yearlyOutput: "exports-yearly.json",
    monthlyId: "exports-monthly",
    yearlyId: "exports-yearly",
  },
  {
    scope: "global",
    scopeLabel: "Global Indian exports",
    sourceRoot: path.join(rootDir, "data", "raw", "tradestat", "exports", "hs2", "global"),
    sourceFile: "data/raw/tradestat/exports/hs2/global",
    monthlyOutput: "exports-global-monthly.json",
    yearlyOutput: "exports-global-yearly.json",
    monthlyId: "exports-global-monthly",
    yearlyId: "exports-global-yearly",
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
  return left.hsCode.localeCompare(right.hsCode, "en-US", { numeric: true });
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

    const hsCode = getCellText(row, 2).padStart(2, "0");
    const commodityName = getCellText(row, 3).replace(/\.$/, "");

    if (!/^\d{2}$/.test(hsCode) || !commodityName) {
      return;
    }

    for (const valueColumn of valueColumns) {
      const value = parseNumber(row.getCell(valueColumn.columnNumber).value) * 1_000_000;

      entries.push({
        hsCode,
        commodityName,
        commodityLabel: `${hsCode} ${commodityName}`,
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
    const key = `${entry.periodKey}|${entry.hsCode}`;
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
}) {
  const rows = periods.map((period) => {
    const row = {
      periodKey: period.key,
      periodLabel: period.label,
      periodSort: period.sort,
    };

    for (const commodity of commodities) {
      const value = values.get(`${period.key}|${commodity.hsCode}`);

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
      periods,
      commodities,
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
}) {
  const commodityByCode = new Map();
  const monthlyPeriodsByKey = new Map();
  const monthlyValues = new Map();

  for (const entry of entries) {
    if (!commodityByCode.has(entry.hsCode)) {
      commodityByCode.set(entry.hsCode, {
        id: `hs_${entry.hsCode}`,
        hsCode: entry.hsCode,
        name: entry.commodityLabel,
        total: 0,
      });
    }

    monthlyPeriodsByKey.set(entry.periodKey, {
      key: entry.periodKey,
      label: entry.periodLabel,
      sort: entry.periodSort,
    });
    monthlyValues.set(`${entry.periodKey}|${entry.hsCode}`, entry.value);
  }

  const commodities = [...commodityByCode.values()].sort(commoditySort);
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
    const key = `${entry.year}|${entry.hsCode}`;
    yearlyValues.set(key, (yearlyValues.get(key) ?? 0) + entry.value);
  }

  return {
    commodities,
    monthlyPeriods,
    yearlyPeriods,
    monthly: buildDataset({
      id: monthlyId,
      label: `Monthly ${scopeLabel}`,
      scope,
      sourceFile,
      granularity: "monthly",
      periods: monthlyPeriods,
      commodities: commodities.map((commodity) => ({ ...commodity, total: 0 })),
      values: monthlyValues,
      coverage,
    }),
    yearly: buildDataset({
      id: yearlyId,
      label: `Yearly ${scopeLabel}`,
      scope,
      sourceFile,
      granularity: "yearly",
      periods: yearlyPeriods,
      commodities: commodities.map((commodity) => ({ ...commodity, total: 0 })),
      values: yearlyValues,
      coverage,
    }),
  };
}

async function processScope(config) {
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
    usEntries.map((entry) => [`${entry.periodKey}|${entry.hsCode}`, entry.value]),
  );

  return globalEntries.map((entry) => ({
    ...entry,
    value: Math.max(
      entry.value - (usValueByKey.get(`${entry.periodKey}|${entry.hsCode}`) ?? 0),
      0,
    ),
    sourceFile: "Derived from global exports minus Indian exports to the US",
  }));
}

async function readIndiaImportEntries() {
  const importsJson = JSON.parse(
    await readFile(path.join(outputDir, "imports.json"), "utf8"),
  );
  const indiaMonthlyDataset = importsJson.datasets?.find(
    (dataset) =>
      dataset.country === "India" && dataset.actualGranularity === "monthly",
  );

  if (!indiaMonthlyDataset) {
    throw new Error("Could not find monthly India imports in data/generated/imports.json");
  }

  const entries = [];

  for (const row of indiaMonthlyDataset.rows ?? []) {
    const year = Math.floor(Number(row.periodSort) / 100);
    const month = Number(row.periodSort) % 100;

    for (const commodity of indiaMonthlyDataset.commodities ?? []) {
      if (!commodity.hsCode) {
        continue;
      }

      const value = row[commodity.id];

      if (typeof value === "number") {
        entries.push({
          hsCode: commodity.hsCode,
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
  const sourceFile = "Derived from global exports minus US-reported imports from India";
  const importValueByKey = new Map(
    importEntries.map((entry) => [`${entry.periodKey}|${entry.hsCode}`, entry.value]),
  );
  const globalKeys = new Set(
    globalEntries.map((entry) => `${entry.periodKey}|${entry.hsCode}`),
  );
  const derivedEntries = globalEntries.map((entry) => ({
    ...entry,
    value:
      entry.value -
      (importValueByKey.get(`${entry.periodKey}|${entry.hsCode}`) ?? 0),
    sourceFile,
  }));

  for (const entry of importEntries) {
    if (globalKeys.has(`${entry.periodKey}|${entry.hsCode}`)) {
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

const [usResult, globalResult, indiaImportEntries] = await Promise.all([
  ...scopeSources.map(processScope),
  readIndiaImportEntries(),
]);
const importAdjustedEntries = deriveImportAdjustedEntries(
  globalResult.entries,
  indiaImportEntries,
);
const importAdjustedDatasets = buildDatasetsFromEntries({
  scope: "non-us-imports",
  scopeLabel: "Global Indian exports excluding the US",
  sourceFile: "Derived from global exports minus US-reported imports from India",
  monthlyId: "exports-non-us-imports-monthly",
  yearlyId: "exports-non-us-imports-yearly",
  entries: importAdjustedEntries,
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
  path.join(outputDir, "exports-non-us-imports-monthly.json"),
  `${JSON.stringify(importAdjustedDatasets.monthly, null, 2)}\n`,
);
await writeFile(
  path.join(outputDir, "exports-non-us-imports-yearly.json"),
  `${JSON.stringify(importAdjustedDatasets.yearly, null, 2)}\n`,
);

for (const result of [usResult, globalResult]) {
  console.log(
    `TradeStat ${result.scopeLabel}: ${result.workbooks.length} workbooks, ${result.datasets.commodities.length} HS commodities`,
  );
  console.log(`${result.scopeLabel} monthly export periods: ${result.datasets.monthlyPeriods.length}`);
  console.log(`${result.scopeLabel} yearly export periods: ${result.datasets.yearlyPeriods.length}`);

  if (result.conflicts.length > 0) {
    console.warn(
      `TradeStat ${result.scopeLabel} duplicate conflicts: ${result.conflicts.length}. Newer workbook folder values were used.`,
    );
  }
}

console.log(
  `TradeStat Global Indian exports excluding the US: ${importAdjustedDatasets.commodities.length} HS commodities`,
);
console.log(`Global Indian exports excluding the US monthly export periods: ${importAdjustedDatasets.monthlyPeriods.length}`);
console.log(`Global Indian exports excluding the US yearly export periods: ${importAdjustedDatasets.yearlyPeriods.length}`);
