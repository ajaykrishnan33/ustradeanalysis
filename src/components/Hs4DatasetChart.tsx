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
  findDatasetByGranularity,
  formatCompactNumber,
  getLineColor,
} from "../chartUtils";
import type { Commodity, Dataset, Granularity } from "../types";
import EventReferenceLines from "./EventReferenceLines";
import SharedTooltip from "./SharedTooltip";

type Hs2Option = {
  hsCode: string;
  label: string;
  commodityIds: string[];
};

type Hs4DatasetChartProps = {
  title: string;
  eyebrow: string;
  description: string;
  datasets: Dataset[];
  valueDescription: string;
  emptyMessage: string;
};

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
      existing.commodityIds.push(commodity.id);
      continue;
    }

    optionsByHs2.set(commodity.hsCode, {
      hsCode: commodity.hsCode,
      label: labelByHs2.get(commodity.hsCode) ?? commodity.hsCode,
      commodityIds: [commodity.id],
    });
  }

  return [...optionsByHs2.values()].sort((left, right) =>
    left.hsCode.localeCompare(right.hsCode, "en-US", { numeric: true }),
  );
}

function Hs4DatasetChart({
  title,
  eyebrow,
  description,
  datasets,
  valueDescription,
  emptyMessage,
}: Hs4DatasetChartProps) {
  const [granularity, setGranularity] = useState<Granularity>(
    datasets[0]?.actualGranularity ?? "monthly",
  );
  const dataset = findDatasetByGranularity(datasets, granularity);
  const hs2Options = useMemo(() => buildHs2Options(dataset), [dataset]);
  const initialHs2Code = hs2Options[0]?.hsCode ?? "";
  const [commodityQuery, setCommodityQuery] = useState("");
  const [selectedHs2Code, setSelectedHs2Code] = useState(initialHs2Code);
  const [selectedCommodityIds, setSelectedCommodityIds] = useState<Set<string>>(
    () => new Set(hs2Options[0]?.commodityIds ?? []),
  );
  const selectedHs2Option = hs2Options.find(
    (option) => option.hsCode === selectedHs2Code,
  );
  const colorByCommodityId = useMemo(() => {
    return new Map(
      dataset.commodities.map((commodity, index) => [
        commodity.id,
        getLineColor(index),
      ]),
    );
  }, [dataset.commodities]);
  const selectedHs2Commodities = useMemo(() => {
    const selectedIds = new Set(selectedHs2Option?.commodityIds ?? []);
    return dataset.commodities.filter((commodity) => selectedIds.has(commodity.id));
  }, [dataset.commodities, selectedHs2Option]);
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
      selectedHs2Commodities.filter((commodity) =>
        selectedCommodityIds.has(commodity.id),
      ),
    [selectedHs2Commodities, selectedCommodityIds],
  );
  const topCommodity = useMemo(
    () =>
      dataset.commodities.reduce<Commodity | undefined>(
        (best, commodity) =>
          !best || commodity.total > best.total ? commodity : best,
        undefined,
      ),
    [dataset.commodities],
  );

  useEffect(() => {
    const firstOption = hs2Options[0];
    setCommodityQuery("");
    setSelectedHs2Code(firstOption?.hsCode ?? "");
    setSelectedCommodityIds(new Set(firstOption?.commodityIds ?? []));
  }, [dataset, hs2Options]);

  function toggleCommodity(commodityId: string) {
    setSelectedCommodityIds((previous) => {
      const next = new Set(previous);

      if (next.has(commodityId)) {
        next.delete(commodityId);
      } else {
        next.add(commodityId);
      }

      return next;
    });
  }

  function selectAll() {
    setSelectedCommodityIds(new Set(selectedHs2Option?.commodityIds ?? []));
  }

  function clearAll() {
    setSelectedCommodityIds(new Set());
  }

  function selectHs2(hsCode: string) {
    setSelectedHs2Code(hsCode);
    setCommodityQuery("");

    const option = hs2Options.find((item) => item.hsCode === hsCode);
    setSelectedCommodityIds(new Set(option?.commodityIds ?? []));
  }

  return (
    <section className="chart-section" aria-label={title}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      <section className="controls controls--hs4" aria-label={`${title} controls`}>
        {datasets.length > 1 ? (
          <label className="field">
            <span>View</span>
            <select
              value={granularity}
              onChange={(event) => setGranularity(event.target.value as Granularity)}
            >
              {datasets.map((item) => (
                <option key={item.id} value={item.actualGranularity}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="field">
          <span>HS2 commodity</span>
          <select
            value={selectedHs2Code}
            onChange={(event) => selectHs2(event.target.value)}
          >
            {hs2Options.map((option) => (
              <option key={option.hsCode} value={option.hsCode}>
                {option.label} - {option.commodityIds.length} HS4 codes
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
                  checked={selectedCommodityIds.has(commodity.id)}
                  onChange={() => toggleCommodity(commodity.id)}
                />
                <span
                  className="commodity-option__swatch"
                  style={{
                    backgroundColor: colorByCommodityId.get(commodity.id),
                  }}
                />
                <span className="commodity-option__name">{commodity.name}</span>
              </label>
            ))}
          </div>
        </aside>

        <section className="chart-card" aria-label={`${title} line chart`}>
          <div className="chart-header">
            <div>
              <h2>{valueDescription}</h2>
              <p>
                Source: {dataset.sourceFile}. Values shown in US dollars.
                {topCommodity
                  ? ` Largest series by total value: ${topCommodity.name} (${formatCompactNumber(
                      topCommodity.total,
                    )}).`
                  : ""}
              </p>
            </div>
            <span className="granularity">{dataset.actualGranularity}</span>
          </div>

          {visibleCommodities.length > 0 ? (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={dataset.rows}
                  margin={{ top: 12, right: 32, bottom: 28, left: 24 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="periodLabel"
                    interval={0}
                    angle={dataset.periods.length > 8 ? -35 : 0}
                    textAnchor={dataset.periods.length > 8 ? "end" : "middle"}
                    height={dataset.periods.length > 8 ? 70 : 36}
                    tickMargin={12}
                  />
                  <YAxis
                    tickFormatter={(value) => formatCompactNumber(Number(value))}
                    width={82}
                  />
                  <Tooltip content={<SharedTooltip />} />
                  <EventReferenceLines granularity={dataset.actualGranularity} />
                  {visibleCommodities.map((commodity) => (
                    <Line
                      key={commodity.id}
                      type="monotone"
                      dataKey={commodity.id}
                      name={commodity.name}
                      stroke={colorByCommodityId.get(commodity.id)}
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
      </section>
    </section>
  );
}

export default Hs4DatasetChart;
