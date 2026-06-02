import { useEffect, useMemo, useState } from "react";
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
  buildMonthlyGrowthRows,
  type ChartValueMode,
  exportScopeOrder,
  formatCompactNumber,
  formatPercent,
  getExportScopeLabel,
  getLineColor,
  getRowValue,
} from "../chartUtils";
import type { SectorConfig } from "../sectorConfigs";
import type {
  ChartRow,
  Dataset,
  ExportScope,
  Granularity,
  SectorLevel,
} from "../types";
import EventReferenceLines from "./EventReferenceLines";
import SharedTooltip from "./SharedTooltip";
import ValueModeToggle from "./ValueModeToggle";

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

type ParsedHs6Input = {
  selectedCodes: string[];
  invalidEntries: string[];
  unknownCodes: string[];
};

const defaultImportScopeKey = "import:India";
const allHs6SumCodesKey = "all";
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

function getLevelDatasets(config: SectorConfig, level: SectorLevel) {
  return [...getImportDatasets(config, level), ...getExportDatasets(config, level)];
}

function buildScopeOptions(config: SectorConfig) {
  const exportScopes = new Set(
    Object.values(config.exportDatasetsByLevel ?? {})
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
      getImportDatasets(config, "hs2")
        .map((dataset) => dataset.country)
        .filter((country): country is string => Boolean(country)),
    ),
  ]
    .sort()
    .map<SectorScopeOption>((country) => ({
      key: getScopeKey({ type: "import", country }),
      label: `US-reported imports from ${country}`,
      type: "import",
      country,
    }));

  return [...exportOptions, ...importOptions];
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

function buildKnownHs6Labels(config: SectorConfig) {
  const labelsByHs6 = new Map<string, string>();

  for (const dataset of getLevelDatasets(config, "hs6")) {
    for (const commodity of dataset.commodities) {
      if (
        !commodity.hs6Code ||
        labelsByHs6.has(commodity.hs6Code) ||
        !isAllowedHs6Commodity(config, commodity)
      ) {
        continue;
      }

      labelsByHs6.set(commodity.hs6Code, commodity.name);
    }
  }

  return labelsByHs6;
}

function parseHs6Input(value: string, knownHs6Labels: Map<string, string>): ParsedHs6Input {
  const tokens = value
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const selectedCodes: string[] = [];
  const invalidEntries: string[] = [];
  const unknownCodes: string[] = [];
  const seenCodes = new Set<string>();
  const seenInvalidEntries = new Set<string>();
  const seenUnknownCodes = new Set<string>();

  for (const token of tokens) {
    if (!/^\d{6}$/.test(token)) {
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

    if (!knownHs6Labels.has(token)) {
      if (!seenUnknownCodes.has(token)) {
        unknownCodes.push(token);
        seenUnknownCodes.add(token);
      }

      continue;
    }

    selectedCodes.push(token);
  }

  return {
    selectedCodes,
    invalidEntries,
    unknownCodes,
  };
}

function findCommodity(dataset: Dataset | undefined, level: SectorLevel, code: string) {
  const keyField = levelKeyFields[level];

  return dataset?.commodities.find((commodity) => commodity[keyField] === code);
}

function buildRows({
  config,
  selectedScopes,
  granularity,
  commodityCode,
  level,
}: {
  config: SectorConfig;
  selectedScopes: SectorScopeOption[];
  granularity: Granularity;
  commodityCode: string;
  level: SectorLevel;
}) {
  const rowsByPeriod = new Map<string, ChartRow>();

  if (!commodityCode) {
    return [];
  }

  for (const scope of selectedScopes) {
    const dataset = findDataset(config, level, granularity, scope);
    const commodity = findCommodity(dataset, level, commodityCode);

    if (!dataset || !commodity) {
      continue;
    }

    const seriesKey = getSeriesKey(scope.key);

    for (const period of dataset.periods) {
      const sourceRow = dataset.rows.find((row) => row.periodKey === period.key);
      const value = sourceRow ? getRowValue(sourceRow, commodity.id) : undefined;
      const existing = rowsByPeriod.get(period.key);

      rowsByPeriod.set(period.key, {
        periodKey: period.key,
        periodLabel: existing?.periodLabel ?? period.label,
        periodSort: existing?.periodSort ?? period.sort,
        ...existing,
        [seriesKey]: value ?? 0,
      });
    }
  }

  return [...rowsByPeriod.values()].sort(
    (left, right) => left.periodSort - right.periodSort,
  );
}

function buildHs6SumRows({
  config,
  selectedScopes,
  hs6Codes,
}: {
  config: SectorConfig;
  selectedScopes: SectorScopeOption[];
  hs6Codes: string[];
}) {
  const rowsByPeriod = new Map<string, ChartRow>();

  if (hs6Codes.length === 0) {
    return [];
  }

  for (const scope of selectedScopes) {
    const dataset = findDataset(config, "hs6", "monthly", scope);

    if (!dataset) {
      continue;
    }

    const commodityIdByCode = new Map(
      dataset.commodities
        .filter((commodity) => commodity.hs6Code)
        .map((commodity) => [commodity.hs6Code, commodity.id]),
    );
    const seriesKey = getSeriesKey(scope.key);

    for (const period of dataset.periods) {
      const sourceRow = dataset.rows.find((row) => row.periodKey === period.key);
      const value = hs6Codes.reduce((sum, hs6Code) => {
        const commodityId = commodityIdByCode.get(hs6Code);

        return sum + (sourceRow ? getRowValue(sourceRow, commodityId) ?? 0 : 0);
      }, 0);
      const existing = rowsByPeriod.get(period.key);

      rowsByPeriod.set(period.key, {
        periodKey: period.key,
        periodLabel: existing?.periodLabel ?? period.label,
        periodSort: existing?.periodSort ?? period.sort,
        ...existing,
        [seriesKey]: value,
      });
    }
  }

  return [...rowsByPeriod.values()].sort(
    (left, right) => left.periodSort - right.periodSort,
  );
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
  hs6Codes,
  knownHs6Labels,
  selectedHs6SumCode,
  onChange,
}: {
  hs6Codes: string[];
  knownHs6Labels: Map<string, string>;
  selectedHs6SumCode: string;
  onChange: (hs6Code: string) => void;
}) {
  return (
    <aside className="hs6-sum-panel" aria-label="HS6 sum selection">
      <div className="hs6-sum-panel__header">
        <h2>HS6 selection</h2>
        <span>{hs6Codes.length} codes</span>
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
          <span>Sum all entered HS6 codes</span>
        </button>

        {hs6Codes.map((hs6Code) => (
          <button
            type="button"
            key={hs6Code}
            className={
              selectedHs6SumCode === hs6Code
                ? "hs6-sum-panel__option hs6-sum-panel__option--active"
                : "hs6-sum-panel__option"
            }
            aria-pressed={selectedHs6SumCode === hs6Code}
            onClick={() => onChange(hs6Code)}
          >
            <strong>{hs6Code}</strong>
            <span>{knownHs6Labels.get(hs6Code) ?? hs6Code}</span>
          </button>
        ))}
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
  effectiveValueMode,
  valueFormatter,
}: {
  title: string;
  description: string;
  emptyMessage: string;
  rows: ChartRow[];
  selectedScopes: SectorScopeOption[];
  granularity: Granularity;
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

    return rows;
  }, [effectiveValueMode, rows, seriesKeys]);

  return (
    <section className="chart-card" aria-label={`${title} chart`}>
      <div className="chart-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="granularity">{granularity}</span>
      </div>

      {selectedScopes.length > 0 && rows.length > 0 ? (
        <div className="chart-wrap chart-wrap--comparison">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={displayRows}
              margin={{ top: 12, right: 32, bottom: 28, left: 24 }}
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
                content={
                  <SharedTooltip
                    valueFormatter={
                      effectiveValueMode === "monthlyGrowth" ? formatPercent : undefined
                    }
                  />
                }
              />
              <EventReferenceLines granularity={granularity} />
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

export function SectorImportsTab({ config }: { config: SectorConfig }) {
  const levelsToRender = config.levelsToRender ?? ["hs2", "hs4", "hs6"];
  const shouldRenderHs8 = levelsToRender.includes("hs8");
  const scopeOptions = useMemo(() => buildScopeOptions(config), [config]);
  const hs2Options = useMemo(() => buildHs2Options(config), [config]);
  const knownHs6Labels = useMemo(() => buildKnownHs6Labels(config), [config]);
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [valueMode, setValueMode] = useState<ChartValueMode>("value");
  const [selectedScopeKeys, setSelectedScopeKeys] = useState<string[]>(() =>
    scopeOptions.some((option) => option.key === defaultImportScopeKey)
      ? [defaultImportScopeKey]
      : scopeOptions.slice(0, 1).map((option) => option.key),
  );
  const [selectedHs6SumScopeKeys, setSelectedHs6SumScopeKeys] = useState<string[]>(
    () =>
      scopeOptions.some((option) => option.key === defaultImportScopeKey)
        ? [defaultImportScopeKey]
        : scopeOptions.slice(0, 1).map((option) => option.key),
  );
  const [hs6SumValueMode, setHs6SumValueMode] = useState<ChartValueMode>("value");
  const [selectedHs2Code, setSelectedHs2Code] = useState("");
  const hs4Options = useMemo(
    () => buildHs4Options(config, selectedHs2Code),
    [config, selectedHs2Code],
  );
  const [selectedHs4Code, setSelectedHs4Code] = useState("");
  const hs6Options = useMemo(
    () => buildHs6Options(config, selectedHs4Code),
    [config, selectedHs4Code],
  );
  const [selectedHs6Code, setSelectedHs6Code] = useState("");
  const hs8Options = useMemo(
    () => buildHs8Options(config, selectedHs6Code),
    [config, selectedHs6Code],
  );
  const [selectedHs8Code, setSelectedHs8Code] = useState("");
  const [hs6SumInput, setHs6SumInput] = useState(
    config.defaultHs6SumCodes.join("\n"),
  );
  const [selectedHs6SumCode, setSelectedHs6SumCode] = useState(allHs6SumCodesKey);
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
        .map((scopeKey) => scopeOptions.find((option) => option.key === scopeKey))
        .filter((option): option is SectorScopeOption => Boolean(option)),
    [scopeOptions, selectedHs6SumScopeKeys],
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
    granularity === "monthly" ? valueMode : "value";
  const valueFormatter =
    effectiveValueMode === "monthlyGrowth" ? formatPercent : formatCompactNumber;
  const hs6SumValueFormatter =
    hs6SumValueMode === "monthlyGrowth" ? formatPercent : formatCompactNumber;
  const hs2Rows = useMemo(
    () =>
      buildRows({
        config,
        selectedScopes,
        granularity,
        commodityCode: selectedHs2Code,
        level: "hs2",
      }),
    [config, granularity, selectedHs2Code, selectedScopes],
  );
  const hs4Rows = useMemo(
    () =>
      buildRows({
        config,
        selectedScopes,
        granularity,
        commodityCode: selectedHs4Code,
        level: "hs4",
      }),
    [config, granularity, selectedHs4Code, selectedScopes],
  );
  const hs6Rows = useMemo(
    () =>
      buildRows({
        config,
        selectedScopes,
        granularity,
        commodityCode: selectedHs6Code,
        level: "hs6",
      }),
    [config, granularity, selectedHs6Code, selectedScopes],
  );
  const hs8Rows = useMemo(
    () =>
      buildRows({
        config,
        selectedScopes,
        granularity,
        commodityCode: selectedHs8Code,
        level: "hs8",
      }),
    [config, granularity, selectedHs8Code, selectedScopes],
  );
  const parsedHs6SumInput = useMemo(
    () => parseHs6Input(hs6SumInput, knownHs6Labels),
    [hs6SumInput, knownHs6Labels],
  );
  const activeHs6SumCodes = useMemo(() => {
    if (selectedHs6SumCode === allHs6SumCodesKey) {
      return parsedHs6SumInput.selectedCodes;
    }

    return parsedHs6SumInput.selectedCodes.includes(selectedHs6SumCode)
      ? [selectedHs6SumCode]
      : parsedHs6SumInput.selectedCodes;
  }, [parsedHs6SumInput.selectedCodes, selectedHs6SumCode]);
  const hs6SumRows = useMemo(
    () =>
      buildHs6SumRows({
        config,
        selectedScopes: selectedHs6SumScopes,
        hs6Codes: activeHs6SumCodes,
      }),
    [activeHs6SumCodes, config, selectedHs6SumScopes],
  );
  const hs6SumDescription = (() => {
    if (parsedHs6SumInput.selectedCodes.length === 0) {
      return `Enter one or more HS6 codes from the ${config.title} source data.`;
    }

    if (selectedHs6SumCode !== allHs6SumCodesKey) {
      return `Showing HS6 ${selectedHs6SumCode}: ${
        knownHs6Labels.get(selectedHs6SumCode) ?? selectedHs6SumCode
      }. ${
        hs6SumValueMode === "monthlyGrowth"
          ? "Values shown as % growth."
          : "Values shown in US dollars."
      }`;
    }

    return `Summing ${parsedHs6SumInput.selectedCodes.length} HS6 code${
      parsedHs6SumInput.selectedCodes.length === 1 ? "" : "s"
    }: ${parsedHs6SumInput.selectedCodes.join(", ")}. ${
          hs6SumValueMode === "monthlyGrowth"
            ? "Values shown as % growth."
            : "Values shown in US dollars."
        }`;
  })();
  const sectorTitleLower = config.title.toLowerCase();

  useEffect(() => {
    if (!selectedHs2Code) {
      setSelectedHs4Code("");
      return;
    }

    if (
      selectedHs4Code &&
      !hs4Options.some((option) => option.hs4Code === selectedHs4Code)
    ) {
      setSelectedHs4Code("");
    }
  }, [hs4Options, selectedHs2Code, selectedHs4Code]);

  useEffect(() => {
    if (!selectedHs4Code) {
      setSelectedHs6Code("");
      return;
    }

    if (
      selectedHs6Code &&
      !hs6Options.some((option) => option.hs6Code === selectedHs6Code)
    ) {
      setSelectedHs6Code("");
    }
  }, [hs6Options, selectedHs4Code, selectedHs6Code]);

  useEffect(() => {
    if (!selectedHs6Code) {
      setSelectedHs8Code("");
      return;
    }

    if (
      selectedHs8Code &&
      !hs8Options.some((option) => option.hs8Code === selectedHs8Code)
    ) {
      setSelectedHs8Code("");
    }
  }, [hs8Options, selectedHs6Code, selectedHs8Code]);

  useEffect(() => {
    if (
      selectedHs6SumCode !== allHs6SumCodesKey &&
      !parsedHs6SumInput.selectedCodes.includes(selectedHs6SumCode)
    ) {
      setSelectedHs6SumCode(allHs6SumCodesKey);
    }
  }, [parsedHs6SumInput.selectedCodes, selectedHs6SumCode]);

  return (
    <section className="chart-section" aria-label={`${config.title} imports`}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{config.eyebrow}</p>
          <h2>{config.title}</h2>
          <p>{config.description}</p>
        </div>
      </div>

      <section className="sector-sum-section" aria-label={`Summed ${config.title} HS6 codes`}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">HS6 sum view</p>
            <h2>Summed {config.title} HS6 codes</h2>
            <p>
              Enter one or more HS6 codes and compare their summed monthly
              values across an independent set of scopes.
            </p>
          </div>
        </div>

        <section className="controls controls--auto-parts controls--hs6-sum" aria-label={`HS6 aggregate ${config.title} controls`}>
          <SectorScopeMultiSelect
            scopeOptions={scopeOptions}
            selectedScopeKeys={selectedHs6SumScopeKeys}
            onChange={setSelectedHs6SumScopeKeys}
          />

          <ValueModeToggle valueMode={hs6SumValueMode} onChange={setHs6SumValueMode} />

          <label className="field field--auto-parts-select">
            <span>HS6 codes to sum</span>
            <textarea
              className="hs6-sum-input"
              value={hs6SumInput}
              onChange={(event) => setHs6SumInput(event.target.value)}
              placeholder="Enter HS6 codes separated by commas, spaces, or new lines, e.g. 870899, 850110"
              rows={3}
            />
          </label>

          <div className="hs6-sum-summary" aria-live="polite">
            {parsedHs6SumInput.selectedCodes.length > 0 ? (
              <p>
                Included:{" "}
                {parsedHs6SumInput.selectedCodes
                  .map((code) => `${code} (${knownHs6Labels.get(code) ?? code})`)
                  .join("; ")}
              </p>
            ) : (
              <p>No valid known HS6 codes selected.</p>
            )}

            {parsedHs6SumInput.unknownCodes.length > 0 ? (
              <p>Unknown HS6 codes ignored: {parsedHs6SumInput.unknownCodes.join(", ")}</p>
            ) : null}

            {parsedHs6SumInput.invalidEntries.length > 0 ? (
              <p>Invalid entries ignored: {parsedHs6SumInput.invalidEntries.join(", ")}</p>
            ) : null}
          </div>
        </section>

        <div className="hs6-sum-chart-layout">
          <Hs6SumSidePanel
            hs6Codes={parsedHs6SumInput.selectedCodes}
            knownHs6Labels={knownHs6Labels}
            selectedHs6SumCode={selectedHs6SumCode}
            onChange={setSelectedHs6SumCode}
          />

          <SectorLineChart
            title={`Summed ${sectorTitleLower} HS6 codes`}
            description={hs6SumDescription}
            emptyMessage="Enter at least one known HS6 code and select one or more scopes to display this monthly sum."
            rows={hs6SumRows}
            selectedScopes={selectedHs6SumScopes}
            granularity="monthly"
            effectiveValueMode={hs6SumValueMode}
            valueFormatter={hs6SumValueFormatter}
          />
        </div>
      </section>

      <section className="controls controls--auto-parts" aria-label={`${config.title} controls`}>
        <label className="field">
          <span>View</span>
          <select
            value={granularity}
            onChange={(event) => setGranularity(event.target.value as Granularity)}
          >
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>

        <SectorScopeMultiSelect
          scopeOptions={scopeOptions}
          selectedScopeKeys={selectedScopeKeys}
          onChange={setSelectedScopeKeys}
        />

        {granularity === "monthly" ? (
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
