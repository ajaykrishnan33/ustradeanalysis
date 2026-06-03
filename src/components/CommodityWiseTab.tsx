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
  buildMonthlyGrowthRows,
  buildSameMonthPreviousYearTooltipRows,
  type ChartValueMode,
  exportScopeOrder,
  findDatasetByGranularity,
  formatCompactNumber,
  formatPercent,
  getExportScopeLabel,
  getLineColor,
  getRowValue,
} from "../chartUtils";
import { getChartTargetId, type ChartLinkProps } from "../chartLinks";
import {
  decodeGranularity,
  decodePinnedTooltipLabel,
  decodeString,
  decodeStringArray,
  decodeValueMode,
  encodeGranularity,
  encodePinnedTooltipLabel,
  encodeString,
  encodeStringArray,
  encodeValueMode,
  pinnedTooltipStateKey,
  type ChartUrlState,
} from "../chartUrlState";
import type { ChartRow, Dataset, ExportScope, Granularity } from "../types";
import ChartLinkButton from "./ChartLinkButton";
import EventReferenceLines from "./EventReferenceLines";
import PinnedTooltipReferenceLine from "./PinnedTooltipReferenceLine";
import SharedTooltip from "./SharedTooltip";
import ValueModeToggle from "./ValueModeToggle";
import usePinnedTooltip from "./usePinnedTooltip";

type CommodityScopeOption = {
  key: string;
  label: string;
  type: "export" | "import";
  scope?: ExportScope;
  country?: string;
};

type Hs2Option = {
  hsCode: string;
  label: string;
};

type Hs4Option = {
  hs4Code: string;
  label: string;
};

type CommodityWiseTabData = {
  exportHs4ScopeDatasets: Dataset[];
  exportScopeDatasets: Dataset[];
  importDatasets: Dataset[];
  importHs4Datasets: Dataset[];
};

type CommodityWiseTabProps = CommodityWiseTabData & {
  activeTab: string;
  activeChart?: string;
  chartState?: ChartUrlState;
  chartStateKey?: string;
  onChartLink: (chartId: string, chartState?: ChartUrlState) => void;
};

const defaultImportScopeKey = "import:India";

function getScopeKey(option: Pick<CommodityScopeOption, "type" | "scope" | "country">) {
  return option.type === "export"
    ? `export:${option.scope ?? "unknown"}`
    : `import:${option.country ?? "unknown"}`;
}

function getSeriesKey(scopeKey: string) {
  return scopeKey.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
}

function buildScopeOptions(data: CommodityWiseTabData) {
  const exportScopes = new Set(
    data.exportScopeDatasets
      .map((dataset) => dataset.scope)
      .filter((scope): scope is ExportScope => Boolean(scope)),
  );
  const exportOptions = exportScopeOrder
    .filter((scope) => exportScopes.has(scope))
    .map<CommodityScopeOption>((scope) => ({
      key: getScopeKey({ type: "export", scope }),
      label: getExportScopeLabel(scope),
      type: "export",
      scope,
    }));
  const importOptions = [
    ...new Set(
      data.importDatasets
        .map((dataset) => dataset.country)
        .filter((country): country is string => Boolean(country)),
    ),
  ]
    .sort()
    .map<CommodityScopeOption>((country) => ({
      key: getScopeKey({ type: "import", country }),
      label: `US-reported imports from ${country}`,
      type: "import",
      country,
    }));

  return [...exportOptions, ...importOptions];
}

function getDefaultScopeKeys(scopeOptions: CommodityScopeOption[]) {
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

function findScopedDataset(
  data: CommodityWiseTabData,
  option: CommodityScopeOption,
  granularity: Granularity,
  level: "hs2" | "hs4",
) {
  if (option.type === "export" && option.scope) {
    const datasets =
      level === "hs2" ? data.exportScopeDatasets : data.exportHs4ScopeDatasets;
    return datasets.find(
      (dataset) =>
        dataset.actualGranularity === granularity && dataset.scope === option.scope,
    );
  }

  if (option.type === "import" && option.country) {
    const datasets = level === "hs2" ? data.importDatasets : data.importHs4Datasets;
    return datasets.find(
      (dataset) =>
        dataset.actualGranularity === granularity &&
        dataset.country === option.country,
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

function buildHs2Options(data: CommodityWiseTabData) {
  const labelsByHs2 = new Map<string, string>();

  for (const dataset of [...data.exportScopeDatasets, ...data.importDatasets]) {
    for (const commodity of dataset.commodities) {
      setHs2Label(labelsByHs2, commodity.hsCode, commodity.name);
    }
  }

  for (const dataset of [
    ...data.exportHs4ScopeDatasets,
    ...data.importHs4Datasets,
  ]) {
    for (const commodity of dataset.hs2Commodities ?? []) {
      setHs2Label(labelsByHs2, commodity.hsCode, commodity.name);
    }

    for (const commodity of dataset.commodities) {
      setHs2Label(labelsByHs2, commodity.hsCode, commodity.hsCode);
    }
  }

  return [...labelsByHs2.entries()]
    .filter(([hsCode]) => hsCode !== "00")
    .map<Hs2Option>(([hsCode, label]) => ({ hsCode, label }))
    .sort((left, right) =>
      left.hsCode.localeCompare(right.hsCode, "en-US", { numeric: true }),
    );
}

function buildHs4Options(data: CommodityWiseTabData, selectedHs2Code: string) {
  const labelsByHs4 = new Map<string, string>();

  for (const dataset of [
    ...data.exportHs4ScopeDatasets,
    ...data.importHs4Datasets,
  ]) {
    for (const commodity of dataset.commodities) {
      if (!commodity.hs4Code || commodity.hsCode !== selectedHs2Code) {
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

function buildRows({
  data,
  selectedScopes,
  granularity,
  commodityCode,
  level,
  fillMissingValues = false,
}: {
  data: CommodityWiseTabData;
  selectedScopes: CommodityScopeOption[];
  granularity: Granularity;
  commodityCode: string;
  level: "hs2" | "hs4";
  fillMissingValues?: boolean;
}) {
  const rowsByPeriod = new Map<string, ChartRow>();

  for (const scope of selectedScopes) {
    const dataset = findScopedDataset(data, scope, granularity, level);
    const commodity = dataset?.commodities.find((item) =>
      level === "hs2"
        ? item.hsCode === commodityCode
        : item.hs4Code === commodityCode,
    );

    if (!dataset || !commodity) {
      continue;
    }

    const seriesKey = getSeriesKey(scope.key);

    for (const period of dataset.periods) {
      const sourceRow = dataset.rows.find((row) => row.periodKey === period.key);
      const value = sourceRow ? getRowValue(sourceRow, commodity.id) : undefined;

      if (value == null && !fillMissingValues) {
        continue;
      }

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

function CommodityScopeMultiSelect({
  scopeOptions,
  selectedScopeKeys,
  onChange,
}: {
  scopeOptions: CommodityScopeOption[];
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

function CommodityLineChart({
  title,
  description,
  rows,
  selectedScopes,
  granularity,
  chartLink,
  effectiveValueMode,
  valueFormatter,
}: {
  title: string;
  description: string;
  rows: ChartRow[];
  selectedScopes: CommodityScopeOption[];
  granularity: Granularity;
  chartLink?: ChartLinkProps;
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

    if (granularity === "monthly") {
      return buildSameMonthPreviousYearTooltipRows(rows, seriesKeys);
    }

    return rows;
  }, [effectiveValueMode, granularity, rows, seriesKeys]);
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
          <span className="granularity">{granularity}</span>
          {chartLink ? (
            <ChartLinkButton {...chartLink} getChartParams={getPinnedChartParams} />
          ) : null}
        </div>
      </div>

      {selectedScopes.length > 0 ? (
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
                content={
                  <SharedTooltip
                    isPinned={pinnedTooltip.isPinned}
                    onClearPinned={pinnedTooltip.clearPinnedTooltip}
                    valueFormatter={
                      effectiveValueMode === "monthlyGrowth" ? formatPercent : undefined
                    }
                  />
                }
              />
              <EventReferenceLines granularity={granularity} />
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
        <div className="empty-state">Select one or more scopes to display the chart.</div>
      )}
    </section>
  );
}

function CommodityWiseTab(data: CommodityWiseTabProps) {
  const scopeOptions = useMemo(() => buildScopeOptions(data), [data]);
  const hs2Options = useMemo(() => buildHs2Options(data), [data]);
  const defaultScopeKeys = useMemo(
    () => getDefaultScopeKeys(scopeOptions),
    [scopeOptions],
  );
  const hs2Codes = useMemo(() => getHs2Codes(hs2Options), [hs2Options]);
  const initialChartState =
    data.activeChart === "hs2-commodity" || data.activeChart === "hs4-commodity"
      ? data.chartState
      : undefined;
  const [granularity, setGranularity] = useState<Granularity>(() =>
    decodeGranularity(initialChartState, "g"),
  );
  const [valueMode, setValueMode] = useState<ChartValueMode>(() =>
    decodeValueMode(initialChartState, "v"),
  );
  const [selectedScopeKeys, setSelectedScopeKeys] = useState<string[]>(() =>
    decodeStringArray(
      initialChartState,
      "sc",
      defaultScopeKeys,
      scopeOptions.map((option) => option.key),
    ),
  );
  const [selectedHs2Code, setSelectedHs2Code] = useState(() =>
    decodeString(initialChartState, "h2", "", hs2Codes),
  );
  const hs4Options = useMemo(
    () => buildHs4Options(data, selectedHs2Code),
    [data, selectedHs2Code],
  );
  const hs4Codes = useMemo(() => getHs4Codes(hs4Options), [hs4Options]);
  const [selectedHs4Code, setSelectedHs4Code] = useState(() =>
    decodeString(initialChartState, "h4", "", hs4Codes),
  );
  const appliedChartStateKeyRef = useRef<string | undefined>(data.chartStateKey);
  const selectedScopes = useMemo(
    () =>
      selectedScopeKeys
        .map((scopeKey) => scopeOptions.find((option) => option.key === scopeKey))
        .filter((option): option is CommodityScopeOption => Boolean(option)),
    [selectedScopeKeys],
  );
  const selectedHs2Option = hs2Options.find(
    (option) => option.hsCode === selectedHs2Code,
  );
  const selectedHs4Option = hs4Options.find(
    (option) => option.hs4Code === selectedHs4Code,
  );
  const effectiveValueMode =
    granularity === "monthly" ? valueMode : "value";
  const valueFormatter =
    effectiveValueMode === "monthlyGrowth" ? formatPercent : formatCompactNumber;
  const hs2Rows = useMemo(
    () =>
      buildRows({
        data,
        selectedScopes,
        granularity,
        commodityCode: selectedHs2Code,
        level: "hs2",
      }),
    [granularity, selectedHs2Code, selectedScopes],
  );
  const hs4Rows = useMemo(
    () =>
      buildRows({
        data,
        selectedScopes,
        granularity,
        commodityCode: selectedHs4Code,
        level: "hs4",
        fillMissingValues: true,
      }),
    [granularity, selectedHs4Code, selectedScopes],
  );

  useEffect(() => {
    if (!selectedHs2Code) {
      setSelectedHs4Code("");
      return;
    }

    if (
      selectedHs4Code &&
      hs4Options.some((option) => option.hs4Code === selectedHs4Code)
    ) {
      return;
    }

    setSelectedHs4Code(hs4Options[0]?.hs4Code ?? "");
  }, [hs4Options, selectedHs4Code]);

  useEffect(() => {
    if (
      !data.chartStateKey ||
      appliedChartStateKeyRef.current === data.chartStateKey ||
      (data.activeChart !== "hs2-commodity" && data.activeChart !== "hs4-commodity")
    ) {
      return;
    }

    const nextHs2Code = decodeString(data.chartState, "h2", "", hs2Codes);
    const nextHs4Options = buildHs4Options(data, nextHs2Code);
    const nextHs4Codes = getHs4Codes(nextHs4Options);

    appliedChartStateKeyRef.current = data.chartStateKey;
    setGranularity(decodeGranularity(data.chartState, "g"));
    setValueMode(decodeValueMode(data.chartState, "v"));
    setSelectedScopeKeys(
      decodeStringArray(
        data.chartState,
        "sc",
        defaultScopeKeys,
        scopeOptions.map((option) => option.key),
      ),
    );
    setSelectedHs2Code(nextHs2Code);
    setSelectedHs4Code(decodeString(data.chartState, "h4", "", nextHs4Codes));
  }, [
    data,
    data.activeChart,
    data.chartState,
    data.chartStateKey,
    defaultScopeKeys,
    hs2Codes,
    scopeOptions,
  ]);

  function getChartParams(): ChartUrlState {
    const state: ChartUrlState = {};
    const encodedGranularity = encodeGranularity(granularity);
    const encodedValueMode = encodeValueMode(valueMode);
    const encodedScopes = encodeStringArray(selectedScopeKeys, defaultScopeKeys);
    const encodedHs2Code = encodeString(selectedHs2Code);
    const encodedHs4Code = encodeString(selectedHs4Code);

    if (encodedGranularity) {
      state.g = encodedGranularity;
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

    return state;
  }

  return (
    <section className="chart-section" aria-label="Commodity wise comparison">
      <div className="section-heading">
        <div>
          <h2>Commodity-wise comparison</h2>
          <p>
            Compare one HS2 commodity and one HS4 commodity across India export
            scopes and US-reported import scopes.
          </p>
        </div>
      </div>

      <section className="controls controls--commodity-wise" aria-label="Commodity-wise controls">
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

        <CommodityScopeMultiSelect
          scopeOptions={scopeOptions}
          selectedScopeKeys={selectedScopeKeys}
          onChange={setSelectedScopeKeys}
        />

        {granularity === "monthly" ? (
          <ValueModeToggle valueMode={valueMode} onChange={setValueMode} />
        ) : null}

        <label className="field field--commodity-select">
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

      <div className="commodity-wise-grid">
        <CommodityLineChart
          title="HS2 commodity"
          description={`Selected HS2: ${selectedHs2Option?.label ?? selectedHs2Code}. ${
            effectiveValueMode === "monthlyGrowth"
              ? "Values shown as % growth."
              : "Values shown in US dollars."
          }`}
          rows={hs2Rows}
          selectedScopes={selectedScopes}
          granularity={granularity}
          chartLink={{
            activeTab: data.activeTab,
            chartId: "hs2-commodity",
            chartState:
              data.activeChart === "hs2-commodity" ? data.chartState : undefined,
            chartStateKey:
              data.activeChart === "hs2-commodity" ? data.chartStateKey : undefined,
            getChartParams,
            onChartLink: data.onChartLink,
          }}
          effectiveValueMode={effectiveValueMode}
          valueFormatter={valueFormatter}
        />

        <section className="controls controls--commodity-wise-secondary" aria-label="HS4 commodity control">
          <label className="field field--commodity-select">
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

        <CommodityLineChart
          title="HS4 commodity"
          description={
            selectedHs4Option
              ? `Selected HS4: ${selectedHs4Option.label}. ${
                  effectiveValueMode === "monthlyGrowth"
                    ? "Values shown as % growth."
                    : "Values shown in US dollars."
                }`
              : "No HS4 commodity is available for the selected HS2."
          }
          rows={hs4Rows}
          selectedScopes={selectedScopes}
          granularity={granularity}
          chartLink={{
            activeTab: data.activeTab,
            chartId: "hs4-commodity",
            chartState:
              data.activeChart === "hs4-commodity" ? data.chartState : undefined,
            chartStateKey:
              data.activeChart === "hs4-commodity" ? data.chartStateKey : undefined,
            getChartParams,
            onChartLink: data.onChartLink,
          }}
          effectiveValueMode={effectiveValueMode}
          valueFormatter={valueFormatter}
        />
      </div>
    </section>
  );
}

export default CommodityWiseTab;
