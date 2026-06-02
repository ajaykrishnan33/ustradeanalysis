import type { ChartLinkProps } from "../chartLinks";
import type { Dataset } from "../types";
import ScopedHs4ExportChart from "./ScopedHs4ExportChart";

function Hs4ExportChart({
  exportHs4ScopeDatasets,
  chartLink,
}: {
  exportHs4ScopeDatasets: Dataset[];
  chartLink?: ChartLinkProps;
}) {
  return (
    <ScopedHs4ExportChart
      title="India-reported exports by HS4"
      description="TradeStat export values by four-digit HS commodity, converted from US $ million to US dollars."
      datasets={exportHs4ScopeDatasets}
      valueDescription="Export value by HS4 commodity"
      emptyMessage="Select one or more HS4 commodities to display the chart."
      chartLink={chartLink}
    />
  );
}

export default Hs4ExportChart;
