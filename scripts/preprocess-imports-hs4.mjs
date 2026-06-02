import { csvParse } from "d3-dsv";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const generatedDataDir = path.join(rootDir, "data", "generated");

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

const expectedCountries = [
  "Bangladesh",
  "Canada",
  "China",
  "Europe",
  "Europe (without UK)",
  "India",
  "Indonesia",
  "Japan",
  "Korea, South",
  "Malaysia",
  "Mexico",
  "Pakistan",
  "Philippines",
  "Singapore",
  "Taiwan",
  "Thailand",
  "United Kingdom",
  "Vietnam",
];
const sources = [
  {
    sourceFile: "data/raw/us-census/imports/hs4/india.csv",
    expectedCountry: "India",
  },
  {
    sourceFile: "data/raw/us-census/imports/hs4/china.csv",
    expectedCountry: "China",
  },
  {
    sourceFile: "data/raw/us-census/imports/hs4/asia-others.csv",
  },
  {
    sourceFile: "data/raw/us-census/imports/hs4/north-america-europe-uk.csv",
    allowedCountries: ["Canada", "Europe", "Mexico", "United Kingdom"],
  },
];
const europeWithoutUkCountry = "Europe (without UK)";
const europeWithoutUkSourceFile =
  "data/raw/us-census/imports/hs4/north-america-europe-uk.csv (Europe - United Kingdom)";

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

function commoditySort(left, right) {
  return left.hs4Code.localeCompare(right.hs4Code, "en-US", { numeric: true });
}

function countrySort(left, right) {
  return left.localeCompare(right, "en-US", {
    numeric: true,
    sensitivity: "base",
  });
}

function countrySlug(country) {
  return String(country)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function formatYearLabel(year, months) {
  if (months.length === 12) {
    return String(year);
  }

  const lastMonth = Math.max(...months);
  return `${year} through ${monthLabels[lastMonth - 1]}`;
}

async function readHs2Names() {
  const importsJsonPath = path.join(generatedDataDir, "imports.json");
  const importsJson = JSON.parse(await readFile(importsJsonPath, "utf8"));
  const names = new Map();

  for (const dataset of importsJson.datasets ?? []) {
    for (const commodity of dataset.commodities ?? []) {
      if (dataset.country && commodity.hsCode && commodity.name) {
        const key = `${dataset.country}|${commodity.hsCode}`;

        if (!names.has(key)) {
          names.set(key, commodity.name);
        }

        const genericKey = `*|${commodity.hsCode}`;

        if (!names.has(genericKey)) {
          names.set(genericKey, commodity.name);
        }
      }
    }
  }

  return names;
}

function buildHs2Commodities(commodities, hs2Names, country) {
  return [
    ...new Set(commodities.map((commodity) => commodity.hsCode)),
  ]
    .sort((left, right) => left.localeCompare(right, "en-US", { numeric: true }))
    .map((hsCode) => ({
      hsCode,
      name: hs2Names.get(`${country}|${hsCode}`) ?? hs2Names.get(`*|${hsCode}`) ?? hsCode,
    }));
}

function buildDataset({
  id,
  label,
  country,
  sourceFile,
  granularity,
  periods,
  commodities,
  values,
  hs2Commodities,
  coverage,
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
      country,
      sourceFile,
      valueLabel: valueColumn,
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

async function readEntries(source) {
  const csvPath = path.join(rootDir, source.sourceFile);
  const text = await readFile(csvPath, "utf8");
  const lines = text.split(/\r?\n/);
  const records = csvParse(
    lines.slice(findHeaderIndex(text, source.sourceFile)).join("\n").trim(),
  );
  const requiredColumns = ["Commodity", "Country", "Time", valueColumn];
  const missingColumns = requiredColumns.filter(
    (column) => !records.columns.includes(column),
  );

  if (missingColumns.length > 0) {
    throw new Error(
      `${source.sourceFile} is missing required columns: ${missingColumns.join(", ")}`,
    );
  }

  const entries = [];

  for (const record of records) {
    const commodityName = String(record.Commodity ?? "").trim();
    const country = String(record.Country ?? "").trim();
    const hs4Code = commodityName.match(/^(\d{4})\b/)?.[1];

    if (!commodityName || !hs4Code) {
      continue;
    }

    if (!country) {
      throw new Error(`${source.sourceFile} contains a row without a Country value`);
    }

    if (source.expectedCountry && country !== source.expectedCountry) {
      throw new Error(
        `${source.sourceFile} contains country "${country}", expected "${source.expectedCountry}"`,
      );
    }

    if (source.allowedCountries && !source.allowedCountries.includes(country)) {
      continue;
    }

    const period = parseMonthlyTime(record.Time);

    entries.push({
      country,
      hsCode: hs4Code.slice(0, 2),
      hs4Code,
      commodityName,
      periodKey: period.key,
      periodLabel: period.label,
      periodSort: period.sort,
      year: period.year,
      month: period.month,
      value: parseCurrency(record[valueColumn]),
    });
  }

  return entries;
}

function aggregateEntries(entries, country, keyForEntry) {
  const aggregated = new Map();

  for (const entry of entries) {
    if (entry.country !== country) {
      continue;
    }

    const key = keyForEntry(entry);
    const existing = aggregated.get(key);
    aggregated.set(key, {
      entry,
      value: (existing?.value ?? 0) + entry.value,
    });
  }

  return aggregated;
}

function deriveEuropeWithoutUkEntries(entries) {
  const keyForEntry = (entry) => `${entry.periodKey}|${entry.hs4Code}`;
  const europeEntries = aggregateEntries(entries, "Europe", keyForEntry);
  const ukEntries = aggregateEntries(entries, "United Kingdom", keyForEntry);

  return [...europeEntries.entries()].map(([key, { entry, value }]) => ({
    ...entry,
    country: europeWithoutUkCountry,
    value: value - (ukEntries.get(key)?.value ?? 0),
  }));
}

function groupEntriesByCountry(sourceEntries) {
  const entriesByCountry = new Map();
  const sourceFileByCountry = new Map();

  for (const { source, entries } of sourceEntries) {
    for (const entry of entries) {
      if (!entriesByCountry.has(entry.country)) {
        entriesByCountry.set(entry.country, []);
      }

      entriesByCountry.get(entry.country).push(entry);
      sourceFileByCountry.set(entry.country, source.sourceFile);
    }
  }

  return [...entriesByCountry.entries()]
    .sort(([leftCountry], [rightCountry]) => countrySort(leftCountry, rightCountry))
    .map(([country, entries]) => ({
      country,
      sourceFile: sourceFileByCountry.get(country),
      entries,
    }));
}

function buildDatasetsForCountry({ country, sourceFile, entries }, hs2Names) {
  const commodityByHs4 = new Map();
  const monthlyPeriodsByKey = new Map();
  const monthlyValues = new Map();
  const yearlyValues = new Map();
  const coverageByYear = new Map();
  const slug = countrySlug(country);

  for (const entry of entries) {
    if (!commodityByHs4.has(entry.hs4Code)) {
      commodityByHs4.set(entry.hs4Code, {
        id: `hs4_${entry.hs4Code}`,
        hsCode: entry.hsCode,
        hs4Code: entry.hs4Code,
        name: entry.commodityName,
        total: 0,
      });
    }

    monthlyPeriodsByKey.set(entry.periodKey, {
      key: entry.periodKey,
      label: entry.periodLabel,
      sort: entry.periodSort,
    });
    monthlyValues.set(
      `${entry.periodKey}|${entry.hs4Code}`,
      (monthlyValues.get(`${entry.periodKey}|${entry.hs4Code}`) ?? 0) + entry.value,
    );
    yearlyValues.set(
      `${entry.year}|${entry.hs4Code}`,
      (yearlyValues.get(`${entry.year}|${entry.hs4Code}`) ?? 0) + entry.value,
    );

    if (!coverageByYear.has(entry.year)) {
      coverageByYear.set(entry.year, new Set());
    }

    coverageByYear.get(entry.year).add(entry.month);
  }

  const commodities = [...commodityByHs4.values()].sort(commoditySort);
  const hs2Commodities = buildHs2Commodities(
    commodities,
    hs2Names,
    country,
  );
  const monthlyPeriods = [...monthlyPeriodsByKey.values()].sort(
    (left, right) => left.sort - right.sort,
  );
  const coverage = Object.fromEntries(
    [...coverageByYear.entries()]
      .sort(([leftYear], [rightYear]) => leftYear - rightYear)
      .map(([year, months]) => [
        String(year),
        [...months].sort((left, right) => left - right),
      ]),
  );
  const yearlyPeriods = Object.entries(coverage).map(([year, months]) => ({
    key: year,
    label: formatYearLabel(Number(year), months),
    sort: Number(year) * 100 + Math.max(...months),
  }));

  return {
    monthly: buildDataset({
      id: `imports-hs4-${slug}-monthly`,
      label: `Monthly HS4 imports - ${country}`,
      country,
      sourceFile,
      granularity: "monthly",
      periods: monthlyPeriods,
      commodities,
      values: monthlyValues,
      coverage,
      hs2Commodities,
    }).dataset,
    yearly: buildDataset({
      id: `imports-hs4-${slug}-yearly`,
      label: `Yearly HS4 imports - ${country}`,
      country,
      sourceFile,
      granularity: "yearly",
      periods: yearlyPeriods,
      commodities,
      values: yearlyValues,
      coverage,
      hs2Commodities,
    }).dataset,
  };
}

const hs2Names = await readHs2Names();
const sourceEntries = await Promise.all(
  sources.map(async (source) => ({
    source,
    entries: await readEntries(source),
  })),
);
sourceEntries.push({
  source: {
    sourceFile: europeWithoutUkSourceFile,
  },
  entries: deriveEuropeWithoutUkEntries(sourceEntries.flatMap((item) => item.entries)),
});
const countryEntries = groupEntriesByCountry(sourceEntries);
const countries = countryEntries.map((item) => item.country);
const missingCountries = expectedCountries.filter(
  (country) => !countries.includes(country),
);

if (missingCountries.length > 0) {
  throw new Error(`Missing expected HS4 import countries: ${missingCountries.join(", ")}`);
}

const datasetsBySource = countryEntries.map((countryEntry) =>
  buildDatasetsForCountry(countryEntry, hs2Names),
);
const monthlyDatasets = datasetsBySource.map((item) => item.monthly);
const yearlyDatasets = datasetsBySource.map((item) => item.yearly);
const outputPath = path.join(generatedDataDir, "imports-hs4.json");
const yearlyOutputPath = path.join(generatedDataDir, "imports-hs4-yearly.json");

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify({ datasets: monthlyDatasets }, null, 2)}\n`,
);
await writeFile(
  yearlyOutputPath,
  `${JSON.stringify({ datasets: yearlyDatasets }, null, 2)}\n`,
);

for (const dataset of [...monthlyDatasets, ...yearlyDatasets]) {
  const hs2Count = new Set(dataset.commodities.map((commodity) => commodity.hsCode)).size;
  console.log(
    `${dataset.label}: ${dataset.commodities.length} HS4 commodities, ${hs2Count} HS2 parents, ${dataset.periods.length} periods`,
  );
}
