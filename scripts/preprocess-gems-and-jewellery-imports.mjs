import { csvParse } from "d3-dsv";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const generatedDataDir = path.join(rootDir, "data", "generated");

const sourceFile = "data/raw/us-census/imports/gems-and-jewellery/hs71-primary.csv";
const valueColumn = "Customs Value (Gen) ($US)";
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
    outputFile: "gems-and-jewellery-imports-hs2.json",
    label: "HS2",
  },
  {
    id: "hs4",
    codeLength: 4,
    codeField: "hs4Code",
    outputFile: "gems-and-jewellery-imports-hs4.json",
    label: "HS4",
  },
  {
    id: "hs6",
    codeLength: 6,
    codeField: "hs6Code",
    outputFile: "gems-and-jewellery-imports-hs6.json",
    label: "HS6",
  },
  {
    id: "hs8",
    codeLength: 8,
    codeField: "hs8Code",
    outputFile: "gems-and-jewellery-imports-hs8.json",
    label: "HS8",
  },
];

function parseCurrency(value) {
  const parsed = Number(String(value ?? "").replace(/[$,\s]/g, ""));

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

function findHeaderIndex(text) {
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
  return (
    String(country)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  );
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

function buildCommodity(code, commodityName, level) {
  return {
    id: `${level.id}_${code}`,
    code,
    hsCode: code.slice(0, 2),
    hs4Code: code.length >= 4 ? code.slice(0, 4) : undefined,
    hs6Code: code.length >= 6 ? code.slice(0, 6) : undefined,
    hs8Code: code.length >= 8 ? code.slice(0, 8) : undefined,
    name: commodityName,
    total: 0,
  };
}

function buildHs8CommodityName(code, commodityName) {
  return `${code} ${String(commodityName).replace(/^\d+\s*/, "")}`;
}

async function readEntries() {
  const csvPath = path.join(rootDir, sourceFile);
  const text = await readFile(csvPath, "utf8");
  const records = csvParse(
    text.split(/\r?\n/).slice(findHeaderIndex(text)).join("\n").trim(),
  );
  const missingColumns = ["Commodity", "Country", "Time", valueColumn].filter(
    (column) => !records.columns.includes(column),
  );

  if (missingColumns.length > 0) {
    throw new Error(`${sourceFile} is missing required columns: ${missingColumns.join(", ")}`);
  }

  const entriesByLevel = Object.fromEntries(levels.map((level) => [level.id, []]));
  let aggregatedTenDigitRows = 0;
  let skippedRows = 0;

  for (const record of records) {
    const rawCommodityName = String(record.Commodity ?? "").trim();
    const country = String(record.Country ?? "").trim();
    const rawCode = rawCommodityName.match(/^(\d+)\b/)?.[1];

    if (!rawCommodityName || !rawCode) {
      continue;
    }

    if (!country) {
      throw new Error(`${sourceFile} contains a row without a Country value`);
    }

    const levelCode = rawCode.length === 10 ? rawCode.slice(0, 8) : rawCode;
    const level = getLevelForCode(levelCode);

    if (!level) {
      skippedRows += 1;
      continue;
    }

    if (rawCode.length === 10) {
      aggregatedTenDigitRows += 1;
    }

    const period = parseMonthlyTime(record.Time);
    const commodityName =
      rawCode.length === 10
        ? buildHs8CommodityName(levelCode, rawCommodityName)
        : rawCommodityName;

    entriesByLevel[level.id].push({
      sourceFile,
      country,
      code: levelCode,
      hsCode: levelCode.slice(0, 2),
      hs4Code: levelCode.length >= 4 ? levelCode.slice(0, 4) : undefined,
      hs6Code: levelCode.length >= 6 ? levelCode.slice(0, 6) : undefined,
      hs8Code: levelCode.length >= 8 ? levelCode.slice(0, 8) : undefined,
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
    aggregatedTenDigitRows,
    skippedRows,
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

function groupEntriesByCountry(entries) {
  const entriesByCountry = new Map();

  for (const entry of entries) {
    if (!entriesByCountry.has(entry.country)) {
      entriesByCountry.set(entry.country, []);
    }

    entriesByCountry.get(entry.country).push(entry);
  }

  return [...entriesByCountry.entries()]
    .sort(([leftCountry], [rightCountry]) => countrySort(leftCountry, rightCountry))
    .map(([country, countryEntries]) => ({
      country,
      entries: countryEntries,
    }));
}

function buildDataset({
  country,
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
  const slug = countrySlug(country);

  return {
    id: `gems-and-jewellery-imports-${level.id}-${slug}-${granularity}`,
    label: `${granularity === "monthly" ? "Monthly" : "Yearly"} gems and jewellery ${level.label} imports - ${country}`,
    country,
    sourceFile,
    valueLabel: valueColumn,
    expectedGranularity: granularity,
    actualGranularity: granularity,
    coverage,
    periods,
    commodities: datasetCommodities,
    rows,
  };
}

function buildDatasetsForCountry({ country, entries }, level) {
  const commodityByCode = new Map();
  const monthlyPeriodsByKey = new Map();
  const monthlyValues = new Map();
  const yearlyValues = new Map();
  const coverageByYear = new Map();

  for (const entry of entries) {
    if (!commodityByCode.has(entry.code)) {
      commodityByCode.set(
        entry.code,
        buildCommodity(entry.code, entry.commodityName, level),
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
      granularity: "monthly",
      level,
      periods: monthlyPeriods,
      commodities,
      values: monthlyValues,
      coverage,
    }),
    buildDataset({
      country,
      granularity: "yearly",
      level,
      periods: yearlyPeriods,
      commodities,
      values: yearlyValues,
      coverage,
    }),
  ];
}

const { entriesByLevel, aggregatedTenDigitRows, skippedRows } = await readEntries();

await mkdir(generatedDataDir, { recursive: true });

for (const level of levels) {
  const countryEntries = groupEntriesByCountry(entriesByLevel[level.id]);
  const datasets = countryEntries.flatMap((item) =>
    buildDatasetsForCountry(item, level),
  );
  const outputPath = path.join(generatedDataDir, level.outputFile);

  await writeFile(outputPath, `${JSON.stringify({ datasets }, null, 2)}\n`);

  for (const dataset of datasets) {
    console.log(
      `${dataset.label}: ${dataset.commodities.length} commodities, ${dataset.periods.length} periods`,
    );
  }
}

console.log(`Aggregated ${aggregatedTenDigitRows} gems and jewellery 10-digit HTS rows to HS8`);
console.log(`Skipped ${skippedRows} gems and jewellery rows with unsupported code lengths`);
