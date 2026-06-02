import { csvParse } from "d3-dsv";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const generatedDataDir = path.join(rootDir, "data", "generated");

const primarySourceFile = "data/raw/us-census/imports/auto-parts/hs84-85-87-primary.csv";
const sourceFiles = [
  primarySourceFile,
  "data/raw/us-census/imports/auto-parts/hs84-85-87-japan-thailand-vietnam.csv",
];
const valueColumn = "Customs Value (Gen) ($US)";
const europeWithoutUkCountry = "Europe (without UK)";
const europeWithoutUkSourceFile = `${primarySourceFile} (Europe - United Kingdom)`;
const monthLabels = [
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
const monthNameToIndex = new Map(
  [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].map((month, index) => [month, index + 1]),
);
const levels = [
  {
    id: "hs2",
    codeLength: 2,
    codeField: "hsCode",
    outputFile: "auto-parts-imports-hs2.json",
    label: "HS2",
  },
  {
    id: "hs4",
    codeLength: 4,
    codeField: "hs4Code",
    outputFile: "auto-parts-imports-hs4.json",
    label: "HS4",
  },
  {
    id: "hs6",
    codeLength: 6,
    codeField: "hs6Code",
    outputFile: "auto-parts-imports-hs6.json",
    label: "HS6",
  },
];

function parseCurrency(value) {
  const normalized = String(value ?? "").replace(/[$,\s]/g, "");
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid customs value: ${value}`);
  }

  return parsed;
}

function parseMonthlyTime(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^([A-Za-z]+)\s+(\d{4})$/);
  const month = match ? monthNameToIndex.get(match[1].toLowerCase()) : undefined;
  const year = match ? Number(match[2]) : NaN;

  if (!month || !Number.isFinite(year)) {
    throw new Error(`Invalid monthly time value: ${value}`);
  }

  return {
    key: `${year}-${String(month).padStart(2, "0")}`,
    label: `${monthLabels[month - 1]} ${year}`,
    sort: year * 100 + month,
    year,
    month,
  };
}

function findHeaderIndex(text, sourceFile) {
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex(
    (line) => line.includes('"Commodity"') && line.includes('"Time"'),
  );

  if (headerIndex === -1) {
    throw new Error(`${sourceFile} does not contain the expected CSV header row`);
  }

  return headerIndex;
}

function countrySlug(country) {
  return String(country)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function countrySort(left, right) {
  return left.localeCompare(right, "en-US", {
    numeric: true,
    sensitivity: "base",
  });
}

function commoditySort(left, right) {
  return left.code.localeCompare(right.code, "en-US", { numeric: true });
}

function formatYearLabel(year, months) {
  if (months.length === 12) {
    return String(year);
  }

  const lastMonth = Math.max(...months);
  return `${year} through ${monthLabels[lastMonth - 1]}`;
}

function getLevelForCode(code) {
  return levels.find((level) => level.codeLength === code.length);
}

function addHs10Code(hs10CodesByHs6, hs10Code) {
  const hs6Code = hs10Code.slice(0, 6);

  if (!hs10CodesByHs6.has(hs6Code)) {
    hs10CodesByHs6.set(hs6Code, new Set());
  }

  hs10CodesByHs6.get(hs6Code).add(hs10Code);
}

function buildCommodity(code, commodityName, level, hs10CodesByHs6) {
  return {
    id: `${level.id}_${code}`,
    code,
    hsCode: code.slice(0, 2),
    hs4Code: code.length >= 4 ? code.slice(0, 4) : undefined,
    hs6Code: code.length >= 6 ? code.slice(0, 6) : undefined,
    hs10CodeCount:
      level.id === "hs6" ? hs10CodesByHs6.get(code)?.size : undefined,
    name: commodityName,
    total: 0,
  };
}

async function readEntriesFromSource(sourceFile) {
  const csvPath = path.join(rootDir, sourceFile);
  const text = await readFile(csvPath, "utf8");
  const lines = text.split(/\r?\n/);
  const records = csvParse(lines.slice(findHeaderIndex(text, sourceFile)).join("\n").trim());
  const requiredColumns = ["Commodity", "Country", "Time", valueColumn];
  const missingColumns = requiredColumns.filter(
    (column) => !records.columns.includes(column),
  );

  if (missingColumns.length > 0) {
    throw new Error(`${sourceFile} is missing required columns: ${missingColumns.join(", ")}`);
  }

  const entriesByLevel = Object.fromEntries(levels.map((level) => [level.id, []]));
  const hs10CodesByHs6 = new Map();
  let skippedTenDigitRows = 0;

  for (const record of records) {
    const commodityName = String(record.Commodity ?? "").trim();
    const country = String(record.Country ?? "").trim();
    const code = commodityName.match(/^(\d+)\b/)?.[1];

    if (!commodityName || !code) {
      continue;
    }

    if (!country) {
      throw new Error(`${sourceFile} contains a row without a Country value`);
    }

    if (code.length === 10) {
      addHs10Code(hs10CodesByHs6, code);
      skippedTenDigitRows += 1;
      continue;
    }

    const level = getLevelForCode(code);

    if (!level) {
      continue;
    }

    const period = parseMonthlyTime(record.Time);

    entriesByLevel[level.id].push({
      sourceFile,
      country,
      code,
      hsCode: code.slice(0, 2),
      hs4Code: code.length >= 4 ? code.slice(0, 4) : undefined,
      hs6Code: code.length >= 6 ? code.slice(0, 6) : undefined,
      commodityName,
      periodKey: period.key,
      periodLabel: period.label,
      periodSort: period.sort,
      year: period.year,
      month: period.month,
      value: parseCurrency(record[valueColumn]),
    });
  }

  return {
    entriesByLevel,
    hs10CodesByHs6,
    skippedTenDigitRows,
  };
}

async function readEntries() {
  const entriesByLevel = Object.fromEntries(levels.map((level) => [level.id, []]));
  const hs10CodesByHs6 = new Map();
  const skippedTenDigitRowsBySource = new Map();

  for (const sourceFile of sourceFiles) {
    const sourceEntries = await readEntriesFromSource(sourceFile);

    for (const level of levels) {
      for (const entry of sourceEntries.entriesByLevel[level.id]) {
        entriesByLevel[level.id].push(entry);
      }
    }

    for (const [hs6Code, hs10Codes] of sourceEntries.hs10CodesByHs6.entries()) {
      if (!hs10CodesByHs6.has(hs6Code)) {
        hs10CodesByHs6.set(hs6Code, new Set());
      }

      for (const hs10Code of hs10Codes) {
        hs10CodesByHs6.get(hs6Code).add(hs10Code);
      }
    }

    skippedTenDigitRowsBySource.set(sourceFile, sourceEntries.skippedTenDigitRows);
  }

  return {
    entriesByLevel,
    hs10CodesByHs6,
    skippedTenDigitRows: [...skippedTenDigitRowsBySource.values()].reduce(
      (total, count) => total + count,
      0,
    ),
    skippedTenDigitRowsBySource,
  };
}

function aggregateEntries(entries, country) {
  const aggregated = new Map();

  for (const entry of entries) {
    if (entry.country !== country) {
      continue;
    }

    const key = `${entry.periodKey}|${entry.code}`;
    const existing = aggregated.get(key);
    aggregated.set(key, {
      entry,
      value: (existing?.value ?? 0) + entry.value,
    });
  }

  return aggregated;
}

function deriveEuropeWithoutUkEntries(entries) {
  const europeEntries = aggregateEntries(entries, "Europe");
  const ukEntries = aggregateEntries(entries, "United Kingdom");

  return [...europeEntries.entries()].map(([key, { entry, value }]) => ({
    ...entry,
    sourceFile: europeWithoutUkSourceFile,
    country: europeWithoutUkCountry,
    value: value - (ukEntries.get(key)?.value ?? 0),
  }));
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

function groupEntriesByCountry(entries) {
  const entriesByCountry = new Map();
  const sourceFilesByCountry = new Map();

  for (const entry of entries) {
    if (!entriesByCountry.has(entry.country)) {
      entriesByCountry.set(entry.country, []);
    }

    entriesByCountry.get(entry.country).push(entry);
    if (!sourceFilesByCountry.has(entry.country)) {
      sourceFilesByCountry.set(entry.country, new Set());
    }
    sourceFilesByCountry.get(entry.country).add(
      entry.country === europeWithoutUkCountry ? europeWithoutUkSourceFile : entry.sourceFile,
    );
  }

  return [...entriesByCountry.entries()]
    .sort(([leftCountry], [rightCountry]) => countrySort(leftCountry, rightCountry))
    .map(([country, countryEntries]) => ({
      country,
      sourceFile: [...sourceFilesByCountry.get(country)].sort().join("; "),
      entries: countryEntries,
    }));
}

function buildDataset({
  country,
  sourceFile: datasetSourceFile,
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
    hs10CodeCount: commodity.hs10CodeCount,
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
  const slug = countrySlug(country);

  return {
    id: `auto-parts-imports-${level.id}-${slug}-${granularity}`,
    label: `${granularity === "monthly" ? "Monthly" : "Yearly"} auto-parts ${level.label} imports - ${country}`,
    country,
    sourceFile: datasetSourceFile,
    valueLabel: valueColumn,
    expectedGranularity: granularity,
    actualGranularity: granularity,
    coverage,
    periods,
    commodities: datasetCommodities,
    rows,
  };
}

function buildDatasetsForCountry(
  { country, sourceFile: datasetSourceFile, entries },
  level,
  hs10CodesByHs6,
) {
  const commodityByCode = new Map();
  const monthlyPeriodsByKey = new Map();
  const monthlyValues = new Map();
  const yearlyValues = new Map();
  const coverageByYear = new Map();

  for (const entry of entries) {
    if (!commodityByCode.has(entry.code)) {
      commodityByCode.set(
        entry.code,
        buildCommodity(entry.code, entry.commodityName, level, hs10CodesByHs6),
      );
    }

    monthlyPeriodsByKey.set(entry.periodKey, {
      key: entry.periodKey,
      label: entry.periodLabel,
      sort: entry.periodSort,
    });
    monthlyValues.set(
      `${entry.periodKey}|${entry.code}`,
      (monthlyValues.get(`${entry.periodKey}|${entry.code}`) ?? 0) + entry.value,
    );
    yearlyValues.set(
      `${entry.year}|${entry.code}`,
      (yearlyValues.get(`${entry.year}|${entry.code}`) ?? 0) + entry.value,
    );

    if (!coverageByYear.has(entry.year)) {
      coverageByYear.set(entry.year, new Set());
    }

    coverageByYear.get(entry.year).add(entry.month);
  }

  const commodities = [...commodityByCode.values()].sort(commoditySort);
  const monthlyPeriods = [...monthlyPeriodsByKey.values()].sort(
    (left, right) => left.sort - right.sort,
  );
  const coverage = buildCoverage(entries);
  const yearlyPeriods = [...coverageByYear.entries()]
    .sort(([leftYear], [rightYear]) => leftYear - rightYear)
    .map(([year, months]) => {
      const sortedMonths = [...months].sort((left, right) => left - right);

      return {
        key: String(year),
        label: formatYearLabel(year, sortedMonths),
        sort: year * 100 + Math.max(...sortedMonths),
      };
    });

  return [
    buildDataset({
      country,
      sourceFile: datasetSourceFile,
      granularity: "monthly",
      level,
      periods: monthlyPeriods,
      commodities,
      values: monthlyValues,
      coverage,
    }),
    buildDataset({
      country,
      sourceFile: datasetSourceFile,
      granularity: "yearly",
      level,
      periods: yearlyPeriods,
      commodities,
      values: yearlyValues,
      coverage,
    }),
  ];
}

const {
  entriesByLevel,
  hs10CodesByHs6,
  skippedTenDigitRows,
  skippedTenDigitRowsBySource,
} = await readEntries();

await mkdir(generatedDataDir, { recursive: true });

for (const level of levels) {
  const entries = [
    ...entriesByLevel[level.id],
    ...deriveEuropeWithoutUkEntries(entriesByLevel[level.id]),
  ];
  const countryEntries = groupEntriesByCountry(entries);
  const datasets = countryEntries.flatMap((item) =>
    buildDatasetsForCountry(item, level, hs10CodesByHs6),
  );
  const outputPath = path.join(generatedDataDir, level.outputFile);

  await writeFile(outputPath, `${JSON.stringify({ datasets }, null, 2)}\n`);

  for (const dataset of datasets) {
    console.log(
      `${dataset.label}: ${dataset.commodities.length} commodities, ${dataset.periods.length} periods`,
    );
  }
}

for (const [sourceFile, skippedRows] of skippedTenDigitRowsBySource.entries()) {
  console.log(`Skipped ${skippedRows} auto-parts 10-digit HTS rows from ${sourceFile}`);
}

console.log(`Skipped ${skippedTenDigitRows} auto-parts 10-digit HTS rows total`);
