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
  formatCompactNumber,
  formatPercent,
  getExportScopeKey,
  getExportScopeLabel,
  getLineColor,
  getRowValue,
} from "../chartUtils";
import { getChartTargetId, type ChartLinkProps } from "../chartLinks";
import type { ChartRow, Commodity, Dataset, ExportScope, Granularity } from "../types";
import ChartLinkButton from "./ChartLinkButton";
import EventReferenceLines from "./EventReferenceLines";
import ExportScopeMultiSelect from "./ExportScopeMultiSelect";
import SharedTooltip from "./SharedTooltip";
import ValueModeToggle from "./ValueModeToggle";

type Hs2Option = {
  hsCode: string;
  label: string;
  hs4Codes: string[];
};

type ScopedHs4ExportChartProps = {
  title: string;
  description: string;
  datasets: Dataset[];
  valueDescription: string;
  emptyMessage: string;
  chartLink?: ChartLinkProps;
};

function seriesKey(scope: ExportScope, hs4Code: string) {
  return `${getExportScopeKey(scope)}_hs4_${hs4Code}`;
}

function getAvailableScopes(datasets: Dataset[]) {
  const scopes = new Set(datasets.map((dataset) => dataset.scope));
  return exportScopeOrder.filter((scope) => scopes.has(scope));
}

function getDataset(
  datasets: Dataset[],
  granularity: Granularity,
  scope: ExportScope,
) {
  return datasets.find(
    (dataset) =>
      dataset.actualGranularity === granularity && dataset.scope === scope,
  );
}

function buildHs2Options(dataset: Dataset) {
  const optionsByHs2 = new Map<string, Hs2Option>();
  const labelByHs2 = new Map(
    dataset.hs2Commodities?.map((commodity) => [
      commodity.hsCode,
      commodity.name,
    ]) ?? [],
  );

  for (const commodity of dataset.commodities) {
    if (!commodity.hsCode || !commodity.hs4Code) {
      continue;
    }

    const existing = optionsByHs2.get(commodity.hsCode);

    if (existing) {
      existing.hs4Codes.push(commodity.hs4Code);
      continue;
    }

    optionsByHs2.set(commodity.hsCode, {
      hsCode: commodity.hsCode,
      label: labelByHs2.get(commodity.hsCode) ?? commodity.hsCode,
      hs4Codes: [commodity.hs4Code],
    });
  }

  return [...optionsByHs2.values()].sort((left, right) =>
    left.hsCode.localeCompare(right.hsCode, "en-US", { numeric: true }),
  );
}

function buildRows({
  datasets,
  selectedHs4Codes,
}: {
  datasets: Dataset[];
  selectedHs4Codes: Set<string>;
}) {
  const rowsByPeriod = new Map<string, ChartRow>();

  for (const dataset of datasets) {
    if (!dataset.scope) {
      continue;
    }

    for (const row of dataset.rows) {
      const period = dataset.periods.find((item) => item.key === row.periodKey);
      const existing = rowsByPeriod.get(row.periodKey);
      const nextRow: ChartRow = {
        periodKey: row.periodKey,
        periodLabel: existing?.periodLabel ?? period?.label ?? row.periodLabel,
        periodSort: existing?.periodSort ?? period?.sort ?? row.periodSort,
        ...existing,
      };

      for (const commodity of dataset.commodities) {
        if (!commodity.hs4Code || !selectedHs4Codes.has(commodity.hs4Code)) {
          continue;
        }

        nextRow[seriesKey(dataset.scope, commodity.hs4Code)] =
          getRowValue(row, commodity.id) ?? 0;
      }

      rowsByPeriod.set(row.periodKey, nextRow);
    }
  }

  return [...rowsByPeriod.values()].sort(
    (left, right) => left.periodSort - right.periodSort,
  );
}

function ScopedHs4ExportChart({
  title,
  description,
  datasets,
  valueDescription,
  emptyMessage,
  chartLink,
}: ScopedHs4ExportChartProps) {
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [valueMode, setValueMode] = useState<ChartValueMode>("value");
  const availableScopes = useMemo(() => getAvailableScopes(datasets), [datasets]);
  const [selectedScopes, setSelectedScopes] = useState<ExportScope[]>(() =>
    availableScopes.includes("us") ? ["us"] : availableScopes.slice(0, 1),
  );
  const [commodityQuery, setCommodityQuery] = useState("");
  const [selectedHs2Code, setSelectedHs2Code] = useState("");
  const [selectedHs4Codes, setSelectedHs4Codes] = useState<Set<string>>(new Set());
  const initializedGranularityRef = useRef<Granularity | null>(null);
  const visibleDatasets = selectedScopes
    .map((scope) => getDataset(datasets, granularity, scope))
    .filter((dataset): dataset is Dataset => Boolean(dataset));
  const primaryScope = selectedScopes[0];
  const primaryDataset = primaryScope
    ? getDataset(datasets, granularity, primaryScope)
    : undefined;
  const hs2Options = useMemo(
    () => (primaryDataset ? buildHs2Options(primaryDataset) : []),
    [primaryDataset],
  );
  const selectedHs2Option = hs2Options.find(
    (option) => option.hsCode === selectedHs2Code,
  );
  const selectedHs2Commodities = useMemo(() => {
    const selectedCodes = new Set(selectedHs2Option?.hs4Codes ?? []);
    return (primaryDataset?.commodities ?? []).filter(
      (commodity) => commodity.hs4Code && selectedCodes.has(commodity.hs4Code),
    );
  }, [primaryDataset, selectedHs2Option]);
  const filteredCommodities = useMemo(() => {
    const normalizedQuery = commodityQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return selectedHs2Commodities;
    }

    return selectedHs2Commodities.filter((commodity) => {
      return (
        commodity.name.toLowerCase().includes(normalizedQuery) ||
        commodity.hs4Code?.includes(normalizedQuery) ||
        commodity.hsCode?.includes(normalizedQuery)
      );
    });
  }, [commodityQuery, selectedHs2Commodities]);
  const visibleCommodities = useMemo(
    () =>
      selectedHs2Commodities.filter(
        (commodity) =>
          commodity.hs4Code && selectedHs4Codes.has(commodity.hs4Code),
      ),
    [selectedHs2Commodities, selectedHs4Codes],
  );
  const rows = useMemo(
    () =>
      buildRows({
        datasets: visibleDatasets,
        selectedHs4Codes,
      }),
    [selectedHs4Codes, visibleDatasets],
  );
  const seriesKeys = useMemo(
    () =>
      selectedScopes.flatMap((scope) =>
        visibleCommodities
          .map((commodity) =>
            commodity.hs4Code ? seriesKey(scope, commodity.hs4Code) : undefined,
          )
          .filter((key): key is string => Boolean(key)),
      ),
    [selectedScopes, visibleCommodities],
  );
  const effectiveValueMode =
    granularity === "monthly" ? valueMode : "value";
  const displayRows = useMemo(() => {
    if (effectiveValueMode === "monthlyGrowth") {
      return buildMonthlyGrowthRows(rows, seriesKeys);
    }

    if (granularity === "monthly") {
      return buildSameMonthPreviousYearTooltipRows(rows, seriesKeys);
    }

    return rows;
  }, [effectiveValueMode, granularity, rows, seriesKeys]);
  const valueFormatter =
    effectiveValueMode === "monthlyGrowth" ? formatPercent : formatCompactNumber;
  const topCommodity = useMemo(
    () =>
      (primaryDataset?.commodities ?? []).reduce<Commodity | undefined>(
        (best, commodity) =>
          !best || commodity.total > best.total ? commodity : best,
        undefined,
      ),
    [primaryDataset],
  );

  useEffect(() => {
    if (initializedGranularityRef.current === granularity) {
      return;
    }

    initializedGranularityRef.current = granularity;
    const firstOption = hs2Options[0];
    setCommodityQuery("");
    setSelectedHs2Code(firstOption?.hsCode ?? "");
    setSelectedHs4Codes(new Set(firstOption?.hs4Codes ?? []));
  }, [granularity, hs2Options]);

  function selectHs2(hsCode: string) {
    setSelectedHs2Code(hsCode);
    setCommodityQuery("");

    const option = hs2Options.find((item) => item.hsCode === hsCode);
    setSelectedHs4Codes(new Set(option?.hs4Codes ?? []));
  }

  function toggleCommodity(hs4Code?: string | null) {
    if (!hs4Code) {
      return;
    }

    setSelectedHs4Codes((previous) => {
      const next = new Set(previous);

      if (next.has(hs4Code)) {
        next.delete(hs4Code);
      } else {
        next.add(hs4Code);
      }

      return next;
    });
  }

  function selectAll() {
    setSelectedHs4Codes(new Set(selectedHs2Option?.hs4Codes ?? []));
  }

  function clearAll() {
    setSelectedHs4Codes(new Set());
  }

  return (
    <section className="chart-section" aria-label={title}>
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      <section className="controls controls--hs4" aria-label={`${title} controls`}>
        <label className="field">
          <span>View</span>
          <select
            value={granularity}
            onChange={(event) => setGranularity(event.target.value as Granularity)}
          >
            <option value="monthly">Monthly exports</option>
            <option value="yearly">Yearly exports</option>
          </select>
        </label>

        <ExportScopeMultiSelect
          availableScopes={availableScopes}
          selectedScopes={selectedScopes}
          onChange={setSelectedScopes}
        />
        {granularity === "monthly" ? (
          <ValueModeToggle valueMode={valueMode} onChange={setValueMode} />
        ) : null}

        <label className="field">
          <span>HS2 commodity</span>
          <select
            value={selectedHs2Code}
            onChange={(event) => selectHs2(event.target.value)}
          >
            {hs2Options.map((option) => (
              <option key={option.hsCode} value={option.hsCode}>
                {option.label} - {option.hs4Codes.length} HS4 codes
              </option>
            ))}
          </select>
        </label>

        <label className="field field--search">
          <span>Find HS4 commodities</span>
          <input
            type="search"
            value={commodityQuery}
            onChange={(event) => setCommodityQuery(event.target.value)}
            placeholder="Search within selected HS2 by HS4 code or commodity name"
          />
        </label>
      </section>

      <section className="layout">
        <aside className="commodity-panel" aria-label={`${title} commodity selector`}>
          <div className="panel-header">
            <div>
              <h2>HS4 commodities</h2>
              <span>
                {visibleCommodities.length} of {selectedHs2Commodities.length} selected
                {selectedHs2Option ? ` - ${selectedHs2Option.label}` : ""}
              </span>
            </div>
            <div className="panel-actions" aria-label="HS4 bulk actions">
              <button type="button" onClick={selectAll}>
                Select all
              </button>
              <button type="button" onClick={clearAll}>
                Clear all
              </button>
            </div>
          </div>
          <div className="commodity-list">
            {filteredCommodities.map((commodity) => (
              <label className="commodity-option" key={commodity.id}>
                <input
                  type="checkbox"
                  checked={selectedHs4Codes.has(commodity.hs4Code ?? "")}
                  onChange={() => toggleCommodity(commodity.hs4Code)}
                />
                <span
                  className="commodity-option__swatch"
                  style={{
                    backgroundColor: commodity.hs4Code
                      ? getLineColor(Number(commodity.hs4Code))
                      : undefined,
                  }}
                />
                <span className="commodity-option__name">{commodity.name}</span>
              </label>
            ))}
          </div>
        </aside>

        <section
          className={chartLink ? "chart-card chart-target" : "chart-card"}
          id={
            chartLink
              ? getChartTargetId(chartLink.activeTab, chartLink.chartId)
              : undefined
          }
          aria-label={`${title} line chart`}
        >
          <div className="chart-header">
            <div>
              <h2>{valueDescription}</h2>
              <p>
                {effectiveValueMode === "monthlyGrowth"
                  ? "Values shown as % growth vs previous month."
                  : "Values shown in US dollars."}
                {topCommodity && primaryScope
                  ? ` Largest ${getExportScopeLabel(primaryScope)} series by total value: ${topCommodity.name} (${formatCompactNumber(
                      topCommodity.total,
                    )}).`
                  : ""}
              </p>
            </div>
            <div className="chart-header__actions">
              <span className="granularity">{granularity}</span>
              {chartLink ? <ChartLinkButton {...chartLink} /> : null}
            </div>
          </div>

          {visibleCommodities.length > 0 && selectedScopes.length > 0 ? (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={displayRows}
                  margin={{ top: 12, right: 32, bottom: 28, left: 24 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="periodLabel"
                    interval={0}
                    angle={rows.length > 8 ? -35 : 0}
                    textAnchor={rows.length > 8 ? "end" : "middle"}
                    height={rows.length > 8 ? 70 : 36}
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
                  {selectedScopes.flatMap((scope, scopeIndex) =>
                    visibleCommodities.map((commodity, commodityIndex) => {
                      if (!commodity.hs4Code) {
                        return null;
                      }

                      return (
                        <Line
                          key={`${scope}-${commodity.hs4Code}`}
                          type="monotone"
                          dataKey={seriesKey(scope, commodity.hs4Code)}
                          name={`${getExportScopeLabel(scope)} - ${commodity.name}`}
                          stroke={getLineColor(commodityIndex * 2 + scopeIndex)}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                      );
                    }),
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-state">{emptyMessage}</div>
          )}
        </section>
      </section>
    </section>
  );
}

export default ScopedHs4ExportChart;
