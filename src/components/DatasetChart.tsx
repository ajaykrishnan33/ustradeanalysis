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
import { formatCompactNumber, getLineColor } from "../chartUtils";
import type { Commodity, Dataset } from "../types";
import EventReferenceLines from "./EventReferenceLines";
import SharedTooltip from "./SharedTooltip";

type DatasetChartProps = {
  title: string;
  eyebrow: string;
  description: string;
  datasets: Dataset[];
  valueDescription: string;
};

function DatasetChart({
  title,
  eyebrow,
  description,
  datasets,
  valueDescription,
}: DatasetChartProps) {
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? "");
  const [commodityQuery, setCommodityQuery] = useState("");
  const [selectedCommodityIds, setSelectedCommodityIds] = useState<Set<string>>(
    () => new Set(datasets[0]?.commodities.map((commodity) => commodity.id) ?? []),
  );

  const dataset = useMemo(
    () => datasets.find((item) => item.id === datasetId) ?? datasets[0],
    [datasetId, datasets],
  );

  useEffect(() => {
    setCommodityQuery("");
    setSelectedCommodityIds(new Set(dataset.commodities.map((commodity) => commodity.id)));
  }, [dataset]);

  const colorByCommodityId = useMemo(() => {
    return new Map(
      dataset.commodities.map((commodity, index) => [
        commodity.id,
        getLineColor(index),
      ]),
    );
  }, [dataset.commodities]);

  const filteredCommodities = useMemo(() => {
    const normalizedQuery = commodityQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return dataset.commodities;
    }

    return dataset.commodities.filter((commodity) =>
      commodity.name.toLowerCase().includes(normalizedQuery),
    );
  }, [commodityQuery, dataset.commodities]);

  const visibleCommodities = useMemo(
    () =>
      dataset.commodities.filter((commodity) =>
        selectedCommodityIds.has(commodity.id),
      ),
    [dataset.commodities, selectedCommodityIds],
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
    setSelectedCommodityIds(new Set(dataset.commodities.map((commodity) => commodity.id)));
  }

  function clearAll() {
    setSelectedCommodityIds(new Set());
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

      <section className="controls" aria-label={`${title} controls`}>
        <label className="field">
          <span>View</span>
          <select
            value={datasetId}
            onChange={(event) => setDatasetId(event.target.value)}
          >
            {datasets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <div className="control-actions">
          <button type="button" onClick={selectAll}>
            Select all
          </button>
          <button type="button" onClick={clearAll}>
            Clear
          </button>
        </div>

        <label className="field field--search">
          <span>Find commodities</span>
          <input
            type="search"
            value={commodityQuery}
            onChange={(event) => setCommodityQuery(event.target.value)}
            placeholder="Search by commodity name or HS code"
          />
        </label>
      </section>

      <section className="layout">
        <aside className="commodity-panel" aria-label={`${title} commodity selector`}>
          <div className="panel-header">
            <div>
              <h2>Commodities</h2>
              <span>
                {visibleCommodities.length} of {dataset.commodities.length} shown
              </span>
            </div>
            <div className="panel-actions" aria-label="Commodity bulk actions">
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
            <div className="empty-state">
              Select one or more commodities to display the chart.
            </div>
          )}
        </section>
      </section>
    </section>
  );
}

export default DatasetChart;
