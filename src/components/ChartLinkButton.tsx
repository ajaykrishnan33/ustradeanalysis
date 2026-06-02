import type { ChartLinkProps } from "../chartLinks";

function ChartLinkButton({ chartId, getChartParams, onChartLink }: ChartLinkProps) {
  return (
    <button
      type="button"
      className="chart-link-button"
      onClick={() => onChartLink(chartId, getChartParams?.())}
      aria-label="Link to this chart"
    >
      Link
    </button>
  );
}

export default ChartLinkButton;
