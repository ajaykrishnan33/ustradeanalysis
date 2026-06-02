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
    sourceRoot: path.join(rootDir, "data", "raw", "tradestat", "exports", "hs8", "us"),
    sourceFile: "data/raw/tradestat/exports/hs8/us",
  },
  {
    scope: "global",
    scopeLabel: "Global Indian exports",
    sourceRoot: path.join(rootDir, "data", "raw", "tradestat", "exports", "hs8", "global"),
    sourceFile: "data/raw/tradestat/exports/hs8/global",
  },
];
const levels = [
  {
    id: "hs6",
    codeField: "hs6Code",
    codeLength: 6,
    label: "HS6",
  },
  {
    id: "hs8",
    codeField: "hs8Code",
    codeLength: 8,
    label: "HS8",
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
const outputFilesByLevel = {
  hs6: {
    us: {
      monthly: "seafood-exports-hs6-monthly.json",
      yearly: "seafood-exports-hs6-yearly.json",
      monthlyId: "seafood-exports-hs6-monthly",
      yearlyId: "seafood-exports-hs6-yearly",
    },
    global: {
      monthly: "seafood-exports-hs6-global-monthly.json",
      yearly: "seafood-exports-hs6-global-yearly.json",
      monthlyId: "seafood-exports-hs6-global-monthly",
      yearlyId: "seafood-exports-hs6-global-yearly",
    },
    "non-us-imports": {
      monthly: "seafood-exports-hs6-non-us-imports-monthly.json",
      yearly: "seafood-exports-hs6-non-us-imports-yearly.json",
      monthlyId: "seafood-exports-hs6-non-us-imports-monthly",
      yearlyId: "seafood-exports-hs6-non-us-imports-yearly",
    },
  },
  hs8: {
    us: {
      monthly: "seafood-exports-hs8-monthly.json",
      yearly: "seafood-exports-hs8-yearly.json",
      monthlyId: "seafood-exports-hs8-monthly",
      yearlyId: "seafood-exports-hs8-yearly",
    },
    global: {
      monthly: "seafood-exports-hs8-global-monthly.json",
      yearly: "seafood-exports-hs8-global-yearly.json",
      monthlyId: "seafood-exports-hs8-global-monthly",
      yearlyId: "seafood-exports-hs8-global-yearly",
    },
    "non-us-imports": {
      monthly: "seafood-exports-hs8-non-us-imports-monthly.json",
      yearly: "seafood-exports-hs8-non-us-imports-yearly.json",
      monthlyId: "seafood-exports-hs8-non-us-imports-monthly",
      yearlyId: "seafood-exports-hs8-non-us-imports-yearly",
    },
  },
};

function buildSectorOutputFiles(prefix) {
  return {
    hs6: {
      us: {
        monthly: `${prefix}-exports-hs6-monthly.json`,
        yearly: `${prefix}-exports-hs6-yearly.json`,
        monthlyId: `${prefix}-exports-hs6-monthly`,
        yearlyId: `${prefix}-exports-hs6-yearly`,
      },
      global: {
        monthly: `${prefix}-exports-hs6-global-monthly.json`,
        yearly: `${prefix}-exports-hs6-global-yearly.json`,
        monthlyId: `${prefix}-exports-hs6-global-monthly`,
        yearlyId: `${prefix}-exports-hs6-global-yearly`,
      },
      "non-us-imports": {
        monthly: `${prefix}-exports-hs6-non-us-imports-monthly.json`,
        yearly: `${prefix}-exports-hs6-non-us-imports-yearly.json`,
        monthlyId: `${prefix}-exports-hs6-non-us-imports-monthly`,
        yearlyId: `${prefix}-exports-hs6-non-us-imports-yearly`,
      },
    },
    hs8: {
      us: {
        monthly: `${prefix}-exports-hs8-monthly.json`,
        yearly: `${prefix}-exports-hs8-yearly.json`,
        monthlyId: `${prefix}-exports-hs8-monthly`,
        yearlyId: `${prefix}-exports-hs8-yearly`,
      },
      global: {
        monthly: `${prefix}-exports-hs8-global-monthly.json`,
        yearly: `${prefix}-exports-hs8-global-yearly.json`,
        monthlyId: `${prefix}-exports-hs8-global-monthly`,
        yearlyId: `${prefix}-exports-hs8-global-yearly`,
      },
      "non-us-imports": {
        monthly: `${prefix}-exports-hs8-non-us-imports-monthly.json`,
        yearly: `${prefix}-exports-hs8-non-us-imports-yearly.json`,
        monthlyId: `${prefix}-exports-hs8-non-us-imports-monthly`,
        yearlyId: `${prefix}-exports-hs8-non-us-imports-yearly`,
      },
    },
  };
}

const sectorExportConfigs = [
  {
    id: "seafood",
    logLabel: "seafood",
    importPrefix: "seafood-imports",
    importSourceLabel: "seafood imports",
    outputFilesByLevel,
  },
  {
    id: "electronics",
    logLabel: "electronics",
    importPrefix: "electronics-imports",
    importSourceLabel: "electronics imports",
    outputFilesByLevel: buildSectorOutputFiles("electronics"),
  },
  {
    id: "textiles",
    logLabel: "textiles",
    importPrefix: "textiles-imports",
    importSourceLabel: "textiles imports",
    outputFilesByLevel: buildSectorOutputFiles("textiles"),
  },
  {
    id: "gems-and-jewellery",
    logLabel: "gems and jewellery",
    importPrefix: "gems-and-jewellery-imports",
    importSourceLabel: "gems and jewellery imports",
    outputFilesByLevel: buildSectorOutputFiles("gems-and-jewellery"),
  },
];

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
  return left.code.localeCompare(right.code, "en-US", { numeric: true });
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

    const hs8Code = getCellText(row, 2).padStart(8, "0");
    const commodityName = getCellText(row, 3).replace(/\.$/, "");

    if (!/^\d{8}$/.test(hs8Code) || !commodityName) {
      return;
    }

    for (const valueColumn of valueColumns) {
      const value = parseNumber(row.getCell(valueColumn.columnNumber).value) * 1_000_000;

      entries.push({
        code: hs8Code,
        hsCode: hs8Code.slice(0, 2),
        hs4Code: hs8Code.slice(0, 4),
        hs6Code: hs8Code.slice(0, 6),
        hs8Code,
        commodityName,
        commodityLabel: `${hs8Code} ${commodityName}`,
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

function dedupeHs8Entries(entries) {
  const byKey = new Map();
  const conflicts = [];

  for (const entry of entries) {
    const key = `${entry.periodKey}|${entry.hs8Code}`;
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

function aggregateEntriesToHs6(entries) {
  const byKey = new Map();

  for (const entry of entries) {
    const code = entry.hs6Code;
    const key = `${entry.periodKey}|${code}`;
    const existing = byKey.get(key);
    const commodityName = `${code} ${entry.commodityName}`;

    byKey.set(key, {
      ...entry,
      code,
      hs8Code: undefined,
      commodityName,
      commodityLabel: commodityName,
      value: (existing?.value ?? 0) + entry.value,
      sourceFile: existing
        ? `${existing.sourceFile}; ${entry.sourceFile}`
        : entry.sourceFile,
    });
  }

  return [...byKey.values()];
}

function buildHs2Commodities(commodities) {
  const labelsByHs2 = new Map();

  for (const commodity of commodities) {
    if (!labelsByHs2.has(commodity.hsCode)) {
      labelsByHs2.set(commodity.hsCode, commodity.hsCode);
    }
  }

  return [...labelsByHs2.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en-US", { numeric: true }))
    .map(([hsCode, name]) => ({ hsCode, name }));
}

function buildDataset({
  id,
  label,
  scope,
  sourceFile,
  granularity,
  level,
  periods,
  commodities,
  values,
  coverage,
}) {
  const datasetCommodities = commodities.map((commodity) => ({
    id: commodity.id,
    hsCode: commodity.hsCode,
    hs4Code: commodity.hs4Code,
    hs6Code: commodity.hs6Code,
    hs8Code: commodity.hs8Code,
    name: commodity.name,
    total: 0,
  }));
  const rows = periods.map((period) => {
    const row = {
      periodKey: period.key,
      periodLabel: period.label,
      periodSort: period.sort,
    };

    for (const commodity of datasetCommodities) {
      const value = values.get(`${period.key}|${commodity[level.codeField]}`);

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
      hs2Commodities: buildHs2Commodities(datasetCommodities),
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
  level,
}) {
  const commodityByCode = new Map();
  const monthlyPeriodsByKey = new Map();
  const monthlyValues = new Map();

  for (const entry of entries) {
    const code = entry[level.codeField];

    if (!code) {
      continue;
    }

    if (!commodityByCode.has(code)) {
      commodityByCode.set(code, {
        id: `${level.id}_${code}`,
        code,
        hsCode: code.slice(0, 2),
        hs4Code: code.length >= 4 ? code.slice(0, 4) : undefined,
        hs6Code: code.length >= 6 ? code.slice(0, 6) : undefined,
        hs8Code: code.length >= 8 ? code.slice(0, 8) : undefined,
        name: entry.commodityLabel,
        total: 0,
      });
    }

    monthlyPeriodsByKey.set(entry.periodKey, {
      key: entry.periodKey,
      label: entry.periodLabel,
      sort: entry.periodSort,
    });
    monthlyValues.set(
      `${entry.periodKey}|${code}`,
      (monthlyValues.get(`${entry.periodKey}|${code}`) ?? 0) + entry.value,
    );
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
    const code = entry[level.codeField];

    if (!code) {
      continue;
    }

    const key = `${entry.year}|${code}`;
    yearlyValues.set(key, (yearlyValues.get(key) ?? 0) + entry.value);
  }

  return {
    commodities,
    monthlyPeriods,
    yearlyPeriods,
    monthly: buildDataset({
      id: monthlyId,
      label: `Monthly ${level.label} ${scopeLabel}`,
      scope,
      sourceFile,
      granularity: "monthly",
      level,
      periods: monthlyPeriods,
      commodities,
      values: monthlyValues,
      coverage,
    }),
    yearly: buildDataset({
      id: yearlyId,
      label: `Yearly ${level.label} ${scopeLabel}`,
      scope,
      sourceFile,
      granularity: "yearly",
      level,
      periods: yearlyPeriods,
      commodities,
      values: yearlyValues,
      coverage,
    }),
  };
}

async function processScope(config) {
  const workbooks = await listWorkbooks(config.sourceRoot, config.sourceFile);
  const allEntries = (await Promise.all(workbooks.map(readWorkbookEntries))).flat();
  const { entries: hs8Entries, conflicts } = dedupeHs8Entries(allEntries);
  const entriesByLevel = {
    hs6: aggregateEntriesToHs6(hs8Entries),
    hs8: hs8Entries,
  };

  return {
    ...config,
    workbooks,
    conflicts,
    entriesByLevel,
  };
}

async function readAllowedCodes(sector, level) {
  const importsJson = JSON.parse(
    await readFile(path.join(outputDir, `${sector.importPrefix}-${level.id}.json`), "utf8"),
  );

  return new Set(
    (importsJson.datasets ?? []).flatMap((dataset) =>
      (dataset.commodities ?? [])
        .map((commodity) => commodity[level.codeField])
        .filter((code) => typeof code === "string" && code.length > 0),
    ),
  );
}

function deriveNonUsEntries(globalEntries, usEntries, level) {
  const usValueByKey = new Map(
    usEntries.map((entry) => [`${entry.periodKey}|${entry[level.codeField]}`, entry.value]),
  );

  return globalEntries.map((entry) => ({
    ...entry,
    value: Math.max(
      entry.value - (usValueByKey.get(`${entry.periodKey}|${entry[level.codeField]}`) ?? 0),
      0,
    ),
    sourceFile: `Derived from global ${level.label} exports minus Indian exports to the US`,
  }));
}

async function readIndiaImportEntries(sector, level) {
  const importsJson = JSON.parse(
    await readFile(path.join(outputDir, `${sector.importPrefix}-${level.id}.json`), "utf8"),
  );
  const indiaMonthlyDataset = importsJson.datasets?.find(
    (dataset) =>
      dataset.country === "India" && dataset.actualGranularity === "monthly",
  );

  if (!indiaMonthlyDataset) {
    throw new Error(
      `Could not find monthly India ${level.label} ${sector.logLabel} imports in data/generated/${sector.importPrefix}-${level.id}.json`,
    );
  }

  const entries = [];

  for (const row of indiaMonthlyDataset.rows ?? []) {
    const year = Math.floor(Number(row.periodSort) / 100);
    const month = Number(row.periodSort) % 100;

    for (const commodity of indiaMonthlyDataset.commodities ?? []) {
      const code = commodity[level.codeField];

      if (!code) {
        continue;
      }

      const value = row[commodity.id];

      if (typeof value === "number") {
        entries.push({
          code,
          hsCode: commodity.hsCode ?? code.slice(0, 2),
          hs4Code: commodity.hs4Code ?? (code.length >= 4 ? code.slice(0, 4) : undefined),
          hs6Code: commodity.hs6Code ?? (code.length >= 6 ? code.slice(0, 6) : undefined),
          hs8Code: commodity.hs8Code ?? (code.length >= 8 ? code.slice(0, 8) : undefined),
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

function deriveImportAdjustedEntries(globalEntries, importEntries, sector, level) {
  const sourceFile = `Derived from global ${level.label} exports minus US-reported ${sector.importSourceLabel} from India`;
  const importValueByKey = new Map(
    importEntries.map((entry) => [`${entry.periodKey}|${entry[level.codeField]}`, entry.value]),
  );
  const globalKeys = new Set(
    globalEntries.map((entry) => `${entry.periodKey}|${entry[level.codeField]}`),
  );
  const derivedEntries = globalEntries.map((entry) => ({
    ...entry,
    value:
      entry.value -
      (importValueByKey.get(`${entry.periodKey}|${entry[level.codeField]}`) ?? 0),
    sourceFile,
  }));

  for (const entry of importEntries) {
    if (globalKeys.has(`${entry.periodKey}|${entry[level.codeField]}`)) {
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

async function writeDataset(filename, data) {
  await writeFile(path.join(outputDir, filename), `${JSON.stringify(data, null, 2)}\n`);
}

const [usResult, globalResult] = await Promise.all(scopeSources.map(processScope));

await mkdir(outputDir, { recursive: true });

for (const sector of sectorExportConfigs) {
  for (const level of levels) {
    const allowedCodes = await readAllowedCodes(sector, level);
    const usEntries = usResult.entriesByLevel[level.id].filter((entry) =>
      allowedCodes.has(entry[level.codeField]),
    );
    const globalEntries = globalResult.entriesByLevel[level.id].filter((entry) =>
      allowedCodes.has(entry[level.codeField]),
    );
    const files = sector.outputFilesByLevel[level.id];
    const usDatasets = buildDatasetsFromEntries({
      scope: "us",
      scopeLabel: "Indian exports to the US",
      sourceFile: usResult.sourceFile,
      monthlyId: files.us.monthlyId,
      yearlyId: files.us.yearlyId,
      entries: usEntries,
      level,
    });
    const globalDatasets = buildDatasetsFromEntries({
      scope: "global",
      scopeLabel: "Global Indian exports",
      sourceFile: globalResult.sourceFile,
      monthlyId: files.global.monthlyId,
      yearlyId: files.global.yearlyId,
      entries: globalEntries,
      level,
    });
    const indiaImportEntries = await readIndiaImportEntries(sector, level);
    const importAdjustedEntries = deriveImportAdjustedEntries(
      globalEntries,
      indiaImportEntries,
      sector,
      level,
    );
    const importAdjustedDatasets = buildDatasetsFromEntries({
      scope: "non-us-imports",
      scopeLabel: "Global Indian exports excluding the US",
      sourceFile: `Derived from global ${level.label} exports minus US-reported ${sector.importSourceLabel} from India`,
      monthlyId: files["non-us-imports"].monthlyId,
      yearlyId: files["non-us-imports"].yearlyId,
      entries: importAdjustedEntries,
      level,
    });

    await writeDataset(files.us.monthly, usDatasets.monthly);
    await writeDataset(files.us.yearly, usDatasets.yearly);
    await writeDataset(files.global.monthly, globalDatasets.monthly);
    await writeDataset(files.global.yearly, globalDatasets.yearly);
    await writeDataset(files["non-us-imports"].monthly, importAdjustedDatasets.monthly);
    await writeDataset(files["non-us-imports"].yearly, importAdjustedDatasets.yearly);

    console.log(
      `TradeStat ${level.label} Indian ${sector.logLabel} exports to the US: ${usResult.workbooks.length} workbooks, ${usDatasets.commodities.length} commodities`,
    );
    console.log(
      `TradeStat ${level.label} Global Indian ${sector.logLabel} exports: ${globalResult.workbooks.length} workbooks, ${globalDatasets.commodities.length} commodities`,
    );
    console.log(
      `TradeStat ${level.label} Global Indian ${sector.logLabel} exports excluding the US: ${importAdjustedDatasets.commodities.length} commodities`,
    );
  }
}

for (const result of [usResult, globalResult]) {
  if (result.conflicts.length > 0) {
    console.warn(
      `TradeStat HS8 ${result.scopeLabel} duplicate conflicts: ${result.conflicts.length}. Newer workbook folder values were used.`,
    );
  }
}
