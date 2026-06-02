import type { ChartUrlState } from "./chartUrlState";

export type ChartLinkProps = {
  activeTab: string;
  chartId: string;
  chartState?: ChartUrlState;
  chartStateKey?: string;
  getChartParams?: () => ChartUrlState;
  onChartLink: (chartId: string, chartState?: ChartUrlState) => void;
};

function sanitizeUrlPart(value: string) {
  return value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "");
}

export function getChartTargetId(tabId: string, chartId: string) {
  return `chart-${sanitizeUrlPart(tabId)}-${sanitizeUrlPart(chartId)}`;
}
