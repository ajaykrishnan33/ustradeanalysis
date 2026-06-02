import type { ChartLinkProps } from "../chartLinks";
import type { Dataset } from "../types";
import CountryHs4DatasetChart from "./CountryHs4DatasetChart";

function Hs4ImportChart({
  importHs4Datasets,
  chartLink,
}: {
  importHs4Datasets: Dataset[];
  chartLink?: ChartLinkProps;
}) {
  return (
    <CountryHs4DatasetChart
      title="US-reported imports by HS4"
      description="Customs value by four-digit HS import commodity from the US Census trade data."
      datasets={importHs4Datasets}
      valueDescription="Customs value by HS4 commodity"
      emptyMessage="Select one or more HS4 commodities to display the chart."
      chartLink={chartLink}
    />
  );
}

export default Hs4ImportChart;
