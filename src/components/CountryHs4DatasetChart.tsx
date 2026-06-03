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
  formatCompactNumber,
  formatPercent,
  getCountrySeriesKey,
  getLineColor,
  getRowValue,
} from "../chartUtils";
import { getChartTargetId, type ChartLinkProps } from "../chartLinks";
import {
  decodeGranularity,
  decodePinnedTooltipLabel,
  decodeSelection,
  decodeString,
  decodeStringArray,
  decodeValueMode,
  encodeGranularity,
  encodePinnedTooltipLabel,
  encodeSelection,
  encodeString,
  encodeStringArray,
  encodeValueMode,
  pinnedTooltipStateKey,
  type ChartUrlState,
} from "../chartUrlState";
import type { ChartRow, Commodity, Dataset, Granularity } from "../types";
import ChartLinkButton from "./ChartLinkButton";
import CountryMultiSelect from "./CountryMultiSelect";
import EventReferenceLines from "./EventReferenceLines";
import PinnedTooltipReferenceLine from "./PinnedTooltipReferenceLine";
import SharedTooltip from "./SharedTooltip";
import ValueModeToggle from "./ValueModeToggle";
import usePinnedTooltip from "./usePinnedTooltip";

type Hs2Option = {
  hsCode: string;
  label: string;
  hs4Codes: string[];
};

type CountryHs4DatasetChartProps = {
  title: string;
  description: string;
  datasets: Dataset[];
  valueDescription: string;
  emptyMessage: string;
  chartLink?: ChartLinkProps;
};

function seriesKey(country: string, hs4Code: string) {
  return `${getCountrySeriesKey(country)}_${hs4Code}`;
}

function getDataset(datasets: Dataset[], granularity: Granularity, country: string) {
  return datasets.find(
    (dataset) =>
      dataset.actualGranularity === granularity && dataset.country === country,
  );
}

function getAvailableCountries(datasets: Dataset[]) {
  return [
    ...new Set(
      datasets
        .map((dataset) => dataset.country)
        .filter((country): country is string => Boolean(country)),
    ),
  ].sort();
}

function getDefaultCountries(countries: string[]) {
  return countries.includes("India") ? ["India"] : countries.slice(0, 1);
}

function getHs2Codes(options: Hs2Option[]) {
  return options.map((option) => option.hsCode);
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
    const country = dataset.country ?? "Unknown";

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

        nextRow[seriesKey(country, commodity.hs4Code)] =
          getRowValue(row, commodity.id) ?? 0;
      }

      rowsByPeriod.set(row.periodKey, nextRow);
    }
  }

  return [...rowsByPeriod.values()].sort(
    (left, right) => left.periodSort - right.periodSort,
  );
}

function CountryHs4DatasetChart({
  title,
  description,
  datasets,
  valueDescription,
  emptyMessage,
  chartLink,
}: CountryHs4DatasetChartProps) {
  const availableCountries = useMemo(
    () => getAvailableCountries(datasets),
    [datasets],
  );
  const defaultCountries = useMemo(
    () => getDefaultCountries(availableCountries),
    [availableCountries],
  );
  const initialChartState = chartLink?.chartState;
  const [granularity, setGranularity] = useState<Granularity>(() =>
    decodeGranularity(initialChartState, "g"),
  );
  const [valueMode, setValueMode] = useState<ChartValueMode>(() =>
    decodeValueMode(initialChartState, "v"),
  );
  const [selectedCountries, setSelectedCountries] = useState<string[]>(() =>
    decodeStringArray(initialChartState, "c", defaultCountries, availableCountries),
  );
  const [commodityQuery, setCommodityQuery] = useState(() =>
    decodeString(initialChartState, "q"),
  );
  const initializedGranularityRef = useRef<Granularity | null>(granularity);
  const appliedChartStateKeyRef = useRef<string | undefined>(chartLink?.chartStateKey);
  const visibleDatasets = selectedCountries
    .map((country) => getDataset(datasets, granularity, country))
    .filter((dataset): dataset is Dataset => Boolean(dataset));
  const primaryCountry = selectedCountries[0];
  const primaryDataset =
    primaryCountry ? getDataset(datasets, granularity, primaryCountry) : undefined;
  const hs2Options = useMemo(
    () => (primaryDataset ? buildHs2Options(primaryDataset) : []),
    [primaryDataset],
  );
  const hs2Codes = useMemo(() => getHs2Codes(hs2Options), [hs2Options]);
  const defaultHs2Code = hs2Options[0]?.hsCode ?? "";
  const [selectedHs2Code, setSelectedHs2Code] = useState(() =>
    decodeString(initialChartState, "h2", defaultHs2Code, hs2Codes),
  );
  const selectedHs2Option = hs2Options.find(
    (option) => option.hsCode === selectedHs2Code,
  );
  const defaultHs4Codes = selectedHs2Option?.hs4Codes ?? [];
  const [selectedHs4Codes, setSelectedHs4Codes] = useState<Set<string>>(
    () => new Set(decodeSelection(initialChartState, "hs", defaultHs4Codes, defaultHs4Codes)),
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
      selectedCountries.flatMap((country) =>
        visibleCommodities
          .map((commodity) =>
            commodity.hs4Code ? seriesKey(country, commodity.hs4Code) : undefined,
          )
          .filter((key): key is string => Boolean(key)),
      ),
    [selectedCountries, visibleCommodities],
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
  const pinnedTooltip = usePinnedTooltip({
    rows: displayRows,
    initialPinnedLabel: decodePinnedTooltipLabel(
      chartLink?.chartState,
      displayRows.map((row) => row.periodLabel),
    ),
    stateKey: chartLink?.chartStateKey,
  });
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

  useEffect(() => {
    if (
      !chartLink?.chartStateKey ||
      appliedChartStateKeyRef.current === chartLink.chartStateKey
    ) {
      return;
    }

    const nextGranularity = decodeGranularity(chartLink.chartState, "g");
    const nextCountries = decodeStringArray(
      chartLink.chartState,
      "c",
      defaultCountries,
      availableCountries,
    );
    const nextPrimaryDataset = nextCountries[0]
      ? getDataset(datasets, nextGranularity, nextCountries[0])
      : undefined;
    const nextHs2Options = nextPrimaryDataset ? buildHs2Options(nextPrimaryDataset) : [];
    const nextHs2Codes = getHs2Codes(nextHs2Options);
    const nextDefaultHs2Code = nextHs2Options[0]?.hsCode ?? "";
    const nextHs2Code = decodeString(
      chartLink.chartState,
      "h2",
      nextDefaultHs2Code,
      nextHs2Codes,
    );
    const nextDefaultHs4Codes =
      nextHs2Options.find((option) => option.hsCode === nextHs2Code)?.hs4Codes ?? [];

    appliedChartStateKeyRef.current = chartLink.chartStateKey;
    initializedGranularityRef.current = nextGranularity;
    setGranularity(nextGranularity);
    setValueMode(decodeValueMode(chartLink.chartState, "v"));
    setSelectedCountries(nextCountries);
    setCommodityQuery(decodeString(chartLink.chartState, "q"));
    setSelectedHs2Code(nextHs2Code);
    setSelectedHs4Codes(
      new Set(
        decodeSelection(
          chartLink.chartState,
          "hs",
          nextDefaultHs4Codes,
          nextDefaultHs4Codes,
        ),
      ),
    );
  }, [
    availableCountries,
    chartLink?.chartState,
    chartLink?.chartStateKey,
    datasets,
    defaultCountries,
  ]);

  function getChartParams(): ChartUrlState {
    const state: ChartUrlState = {};
    const selectedHs4CodesInOrder = defaultHs4Codes.filter((hs4Code) =>
      selectedHs4Codes.has(hs4Code),
    );
    const encodedGranularity = encodeGranularity(granularity);
    const encodedValueMode = encodeValueMode(valueMode);
    const encodedCountries = encodeStringArray(selectedCountries, defaultCountries);
    const encodedQuery = encodeString(commodityQuery);
    const encodedHs2Code = encodeString(selectedHs2Code, defaultHs2Code);
    const encodedHs4Codes = encodeSelection(selectedHs4CodesInOrder, defaultHs4Codes);
    const encodedPinnedTooltipLabel = encodePinnedTooltipLabel(
      pinnedTooltip.pinnedLabel,
    );

    if (encodedGranularity) {
      state.g = encodedGranularity;
    }

    if (encodedValueMode) {
      state.v = encodedValueMode;
    }

    if (encodedCountries) {
      state.c = encodedCountries;
    }

    if (encodedQuery) {
      state.q = encodedQuery;
    }

    if (encodedHs2Code) {
      state.h2 = encodedHs2Code;
    }

    if (encodedHs4Codes) {
      state.hs = encodedHs4Codes;
    }

    if (encodedPinnedTooltipLabel) {
      state[pinnedTooltipStateKey] = encodedPinnedTooltipLabel;
    }

    return state;
  }

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
            <option value="monthly">Monthly imports</option>
            <option value="yearly">Yearly imports</option>
          </select>
        </label>

        <CountryMultiSelect
          countries={availableCountries}
          selectedCountries={selectedCountries}
          onChange={setSelectedCountries}
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
                {topCommodity && primaryCountry
                  ? ` Largest ${primaryCountry} series by total value: ${topCommodity.name} (${formatCompactNumber(
                      topCommodity.total,
                    )}).`
                  : ""}
              </p>
            </div>
            <div className="chart-header__actions">
              <span className="granularity">{granularity}</span>
              {chartLink ? (
                <ChartLinkButton {...chartLink} getChartParams={getChartParams} />
              ) : null}
            </div>
          </div>

          {visibleCommodities.length > 0 ? (
            <div className={pinnedTooltip.getChartWrapperClassName("chart-wrap")}>
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
                  {selectedCountries.flatMap((country, countryIndex) =>
                    visibleCommodities.map((commodity, commodityIndex) => {
                      if (!commodity.hs4Code) {
                        return null;
                      }

                      return (
                        <Line
                          key={`${country}-${commodity.hs4Code}`}
                          type="monotone"
                          dataKey={seriesKey(country, commodity.hs4Code)}
                          name={`${country} - ${commodity.name}`}
                          stroke={getLineColor(commodityIndex * 2 + countryIndex)}
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

export default CountryHs4DatasetChart;
