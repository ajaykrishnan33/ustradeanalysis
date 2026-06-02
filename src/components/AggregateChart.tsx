import { useMemo, useState } from "react";
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
  formatCompactNumber,
  findDatasetByGranularity,
  sumCommodityValues,
} from "../chartUtils";
import type { ChartRow, Dataset } from "../types";
import EventReferenceLines from "./EventReferenceLines";
import SharedTooltip from "./SharedTooltip";

type AggregateChartProps = {
  title: string;
  eyebrow: string;
  description: string;
  datasets: Dataset[];
  seriesName: string;
};

const aggregateSeriesKey = "allCommodities";

function buildAggregateRows(dataset: Dataset): ChartRow[] {
  const commodityIds = dataset.commodities.map((commodity) => commodity.id);

  return dataset.rows.map((row) => ({
    periodKey: row.periodKey,
    periodLabel: row.periodLabel,
    periodSort: row.periodSort,
    [aggregateSeriesKey]: sumCommodityValues(row, commodityIds),
  }));
}

function AggregateChart({
  title,
  eyebrow,
  description,
  datasets,
  seriesName,
}: AggregateChartProps) {
  const [granularity, setGranularity] = useState(datasets[0]?.actualGranularity ?? "monthly");
  const dataset = findDatasetByGranularity(datasets, granularity);
  const rows = useMemo(() => {
    return buildAggregateRows(dataset);
  }, [dataset]);
  const latestValue = useMemo(() => {
    const latestRow = [...rows]
      .reverse()
      .find((row) => typeof row[aggregateSeriesKey] === "number");

    return typeof latestRow?.[aggregateSeriesKey] === "number"
      ? latestRow[aggregateSeriesKey]
      : 0;
  }, [rows]);

  return (
    <section className="chart-section" aria-label={title}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      <section className="controls controls--aggregate" aria-label={`${title} controls`}>
        <label className="field">
          <span>View</span>
          <select
            value={granularity}
            onChange={(event) => setGranularity(event.target.value as typeof granularity)}
          >
            {datasets.map((item) => (
              <option key={item.id} value={item.actualGranularity}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

      </section>

      <section className="chart-card" aria-label={`${title} line chart`}>
        <div className="chart-header">
          <div>
            <h2>{seriesName}</h2>
            <p>
              Source: {dataset.sourceFile}. Values shown in US dollars.
              {" "}Latest visible value: {formatCompactNumber(latestValue)}.
            </p>
          </div>
          <span className="granularity">{dataset.actualGranularity}</span>
        </div>

        <div className="chart-wrap chart-wrap--comparison">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={rows}
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
                tickFormatter={(value) => formatCompactNumber(Number(value))}
                width={82}
              />
              <Tooltip content={<SharedTooltip />} />
              <EventReferenceLines granularity={dataset.actualGranularity} />
              <Line
                type="monotone"
                dataKey={aggregateSeriesKey}
                name="All Commodities"
                stroke="#0f172a"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </section>
  );
}

export default AggregateChart;
