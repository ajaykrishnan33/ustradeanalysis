import type { Dataset } from "../types";
import CountryHs4DatasetChart from "./CountryHs4DatasetChart";

function Hs4ImportChart({ importHs4Datasets }: { importHs4Datasets: Dataset[] }) {
  return (
    <CountryHs4DatasetChart
      title="US-reported imports HS4"
      eyebrow="US Census import data"
      description="Customs value by four-digit HS import commodity from the US Census trade data."
      datasets={importHs4Datasets}
      valueDescription="Customs value by HS4 commodity"
      emptyMessage="Select one or more HS4 commodities to display the chart."
    />
  );
}

export default Hs4ImportChart;
