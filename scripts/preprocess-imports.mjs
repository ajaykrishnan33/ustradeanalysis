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
const monthNameToNumber = new Map(
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
    sourceFile: "data/raw/us-census/imports/hs2/india.csv",
    expectedCountry: "India",
  },
  {
    sourceFile: "data/raw/us-census/imports/hs2/china.csv",
    expectedCountry: "China",
  },
  {
    sourceFile: "data/raw/us-census/imports/hs2/asia-others.csv",
  },
  {
    sourceFile: "data/raw/us-census/imports/hs2/north-america-europe-uk.csv",
    allowedCountries: ["Canada", "Europe", "Mexico", "United Kingdom"],
  },
];
const europeWithoutUkCountry = "Europe (without UK)";
const europeWithoutUkSourceFile =
  "data/raw/us-census/imports/hs2/north-america-europe-uk.csv (Europe - United Kingdom)";

function parseCurrency(value) {
  const normalized = String(value ?? "").replace(/[$,\s]/g, "");
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid customs value: ${value}`);
  }

  return parsed;
}

function formatMonthLabel(year, month) {
  return `${monthLabels[month - 1]} ${year}`;
}

function formatYearLabel(year, months) {
  if (months.length === 12) {
    return String(year);
  }

  const lastMonth = Math.max(...months);
  return `${year} through ${monthLabels[lastMonth - 1]}`;
}

function parseTime(value) {
  const raw = String(value ?? "").trim();

  if (/^\d{4}$/.test(raw)) {
    const year = Number(raw);

    return {
      key: String(year),
      label: String(year),
      sort: year * 100,
      granularity: "yearly",
      year,
    };
  }

  const partialYearMatch = raw.match(/^(\d{4})\s+through\s+(.+)$/i);

  if (partialYearMatch) {
    const year = Number(partialYearMatch[1]);
    const month =
      monthNameToNumber.get(partialYearMatch[2].trim().toLowerCase()) ?? 12;
    const months = Array.from({ length: month }, (_, index) => index + 1);

    return {
      key: String(year),
      label: formatYearLabel(year, months),
      sort: year * 100 + month,
      granularity: "yearly",
      year,
      month,
    };
  }

  const monthYearMatch = raw.match(/^([A-Za-z]+)\s+(\d{4})$/);

  if (monthYearMatch) {
    const month = monthNameToNumber.get(monthYearMatch[1].toLowerCase());
    const year = Number(monthYearMatch[2]);

    if (!month || !Number.isFinite(year)) {
      throw new Error(`Invalid time value: ${value}`);
    }

    return {
      key: `${year}-${String(month).padStart(2, "0")}`,
      label: formatMonthLabel(year, month),
      sort: year * 100 + month,
      granularity: "monthly",
      year,
      month,
    };
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid time value: ${value}`);
  }

  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  return {
    key: `${year}-${String(month).padStart(2, "0")}`,
    label: formatMonthLabel(year, month),
    sort: year * 100 + month,
    granularity: "monthly",
    year,
    month,
  };
}

function commoditySort(left, right) {
  return left.localeCompare(right, "en-US", {
    numeric: true,
    sensitivity: "base",
  });
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

function extractHsCode(commodityName) {
  return String(commodityName).match(/^(\d{2})\b/)?.[1] ?? null;
}

function parseCsv(text, sourceFile) {
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex(
    (line) => line.includes("Commodity") && line.includes("Time"),
  );

  if (headerIndex === -1) {
    throw new Error(`${sourceFile} does not contain the expected CSV header row`);
  }

  return csvParse(lines.slice(headerIndex).join("\n").trim());
}

async function readEntries(source) {
  const csvPath = path.join(rootDir, source.sourceFile);
  const text = await readFile(csvPath, "utf8");
  const records = parseCsv(text, source.sourceFile);
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
    const commodity = String(record.Commodity ?? "").trim();
    const country = String(record.Country ?? "").trim();

    if (!commodity) {
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

    const period = parseTime(record.Time);

    if (period.granularity !== "monthly") {
      throw new Error(
        `${source.sourceFile} contains non-monthly time value: ${record.Time}`,
      );
    }

    entries.push({
      country,
      commodity,
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
  const keyForEntry = (entry) => `${entry.periodKey}|${entry.commodity}`;
  const europeEntries = aggregateEntries(entries, "Europe", keyForEntry);
  const ukEntries = aggregateEntries(entries, "United Kingdom", keyForEntry);

  return [...europeEntries.entries()].map(([key, { entry, value }]) => ({
    ...entry,
    country: europeWithoutUkCountry,
    value: value - (ukEntries.get(key)?.value ?? 0),
  }));
}

function buildCoverage(entries) {
  const coverageByYear = new Map();

  for (const entry of entries) {
    if (!entry.year || !entry.month) {
      continue;
    }

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

function buildDataset({
  id,
  label,
  country,
  sourceFile,
  granularity,
  entries,
  periods,
  coverage,
}) {
  const commodities = new Set();
  const values = new Map();

  for (const entry of entries) {
    commodities.add(entry.commodity);
    values.set(
      `${entry.periodKey}|${entry.commodity}`,
      (values.get(`${entry.periodKey}|${entry.commodity}`) ?? 0) + entry.value,
    );
  }

  const sortedCommodities = [...commodities].sort(commoditySort).map((name, index) => ({
    id: `commodity_${String(index + 1).padStart(3, "0")}`,
    hsCode: extractHsCode(name),
    name,
    total: 0,
  }));
  const commodityByName = new Map(
    sortedCommodities.map((commodity) => [commodity.name, commodity]),
  );
  const rows = periods.map((period) => {
    const row = {
      periodKey: period.key,
      periodLabel: period.label,
      periodSort: period.sort,
    };

    for (const [key, value] of values.entries()) {
      const [periodKey, commodityName] = key.split("|");

      if (periodKey !== period.key) {
        continue;
      }

      const commodity = commodityByName.get(commodityName);

      if (!commodity) {
        continue;
      }

      row[commodity.id] = value;
      commodity.total += value;
    }

    return row;
  });

  return {
    id,
    label,
    country,
    sourceFile,
    valueLabel: valueColumn,
    expectedGranularity: granularity,
    actualGranularity: granularity,
    coverage,
    periods,
    commodities: sortedCommodities,
    rows,
  };
}

function buildMonthlyDataset({ country, sourceFile, entries }) {
  const periodsByKey = new Map();
  const slug = countrySlug(country);

  for (const entry of entries) {
    periodsByKey.set(entry.periodKey, {
      key: entry.periodKey,
      label: entry.periodLabel,
      sort: entry.periodSort,
    });
  }

  const periods = [...periodsByKey.values()].sort(
    (left, right) => left.sort - right.sort,
  );

  return buildDataset({
    id: `imports-${slug}-monthly`,
    label: `Monthly imports - ${country}`,
    country,
    sourceFile,
    granularity: "monthly",
    entries,
    periods,
    coverage: buildCoverage(entries),
  });
}

function buildYearlyDatasetFromMonthly({ country, sourceFile, entries }) {
  const coverageByYear = new Map();
  const yearlyEntriesByKey = new Map();
  const slug = countrySlug(country);

  for (const entry of entries) {
    if (!entry.year || !entry.month) {
      continue;
    }

    if (!coverageByYear.has(entry.year)) {
      coverageByYear.set(entry.year, new Set());
    }

    coverageByYear.get(entry.year).add(entry.month);

    const key = `${entry.year}|${entry.commodity}`;
    yearlyEntriesByKey.set(key, {
      commodity: entry.commodity,
      periodKey: String(entry.year),
      periodLabel: "",
      periodSort: entry.year * 100,
      year: entry.year,
      value: (yearlyEntriesByKey.get(key)?.value ?? 0) + entry.value,
    });
  }

  const coverage = Object.fromEntries(
    [...coverageByYear.entries()]
      .sort(([leftYear], [rightYear]) => leftYear - rightYear)
      .map(([year, months]) => [
        String(year),
        [...months].sort((left, right) => left - right),
      ]),
  );
  const periods = Object.entries(coverage).map(([year, months]) => ({
    key: year,
    label: formatYearLabel(Number(year), months),
    sort: Number(year) * 100 + Math.max(...months),
  }));
  const entriesWithLabels = [...yearlyEntriesByKey.values()].map((entry) => ({
    ...entry,
    periodLabel:
      periods.find((period) => period.key === entry.periodKey)?.label ??
      entry.periodKey,
  }));

  return buildDataset({
    id: `imports-${slug}-yearly`,
    label: `Yearly imports - ${country}`,
    country,
    sourceFile,
    granularity: "yearly",
    entries: entriesWithLabels,
    periods,
    coverage,
  });
}

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
  throw new Error(`Missing expected import countries: ${missingCountries.join(", ")}`);
}

const datasets = countryEntries.flatMap((item) => [
  buildMonthlyDataset(item),
  buildYearlyDatasetFromMonthly(item),
]);
const outputPath = path.join(generatedDataDir, "imports.json");

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      datasets,
    },
    null,
    2,
  )}\n`,
);

for (const dataset of datasets) {
  console.log(
    `${dataset.label}: ${dataset.commodities.length} commodities, ${dataset.periods.length} periods`,
  );
}
