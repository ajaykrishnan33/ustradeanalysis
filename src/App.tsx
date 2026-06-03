import { useEffect, useRef, useState } from "react";
import { SectorImportsTab } from "./components/SectorImportsTab";
import CommodityWiseTab from "./components/CommodityWiseTab";
import ComparisonChart from "./components/ComparisonChart";
import CountryAggregateChart from "./components/CountryAggregateChart";
import CountryDatasetChart from "./components/CountryDatasetChart";
import HelpPanel from "./components/HelpPanel";
import Hs4ComparisonChart from "./components/Hs4ComparisonChart";
import Hs4ExportChart from "./components/Hs4ExportChart";
import Hs4ImportChart from "./components/Hs4ImportChart";
import ScopedAggregateExportChart from "./components/ScopedAggregateExportChart";
import ScopedExportDatasetChart from "./components/ScopedExportDatasetChart";
import { getChartTargetId } from "./chartLinks";
import {
  getChartUrlState,
  setChartUrlState,
  type ChartUrlState,
} from "./chartUrlState";
import { getHelpContent } from "./helpContent";
import { sectorConfigs } from "./sectorConfigs";
import {
  loadCommodityWiseTabData,
  loadComparisonTabData,
  loadIndiaExportsTabData,
  loadSectorConfig,
  loadUsImportsTabData,
} from "./tradeData";
import type { Dataset } from "./types";

const baseTabs = [
  {
    id: "us-imports",
    label: "US Imports",
  },
  {
    id: "india-exports",
    label: "India Exports",
  },
  {
    id: "comparison",
    label: "US-India Comparison",
  },
  {
    id: "commodity-wise",
    label: "Commodity-wise",
  },
];

const tabs = [
  ...baseTabs,
  ...sectorConfigs.map((config) => ({
    id: config.id,
    label: config.tabLabel,
  })),
];
const defaultTabId = "us-imports";

function ExternalLinkIcon() {
  return (
    <svg
      className="site-footer__link-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9 2h5v5h-1.5V4.56l-6.22 6.22-1.06-1.06 6.22-6.22H9V2Z" />
      <path d="M3.5 4.5h4V6h-4v6.5H10v-4h1.5v4A1.5 1.5 0 0 1 10 14H3.5A1.5 1.5 0 0 1 2 12.5V6a1.5 1.5 0 0 1 1.5-1.5Z" />
    </svg>
  );
}

const chartIdsByTab: Record<string, string[]> = {
  "us-imports": ["all-imports", "hs2-imports", "hs4-imports"],
  "india-exports": ["all-exports", "hs2-exports", "hs4-exports"],
  comparison: ["hs2-comparison", "hs4-comparison"],
  "commodity-wise": ["hs2-commodity", "hs4-commodity"],
};

function isValidTabId(tabId: string | null): tabId is string {
  return Boolean(tabId && tabs.some((tab) => tab.id === tabId));
}

function getTabIdFromUrl() {
  const tabId = new URLSearchParams(window.location.search).get("tab");

  return isValidTabId(tabId) ? tabId : defaultTabId;
}

function hasInvalidTabParam() {
  const tabId = new URLSearchParams(window.location.search).get("tab");

  return tabId !== null && !isValidTabId(tabId);
}

function getChartIdsForTab(tabId: string) {
  const sectorMetadata = sectorConfigs.find((config) => config.id === tabId);

  if (sectorMetadata) {
    return ["hs6-sum", ...(sectorMetadata.levelsToRender ?? ["hs2", "hs4", "hs6"])];
  }

  return chartIdsByTab[tabId] ?? [];
}

function isValidChartId(tabId: string, chartId: string | null): chartId is string {
  return Boolean(chartId && getChartIdsForTab(tabId).includes(chartId));
}

function getChartIdFromUrl(tabId = getTabIdFromUrl()) {
  const chartId = new URLSearchParams(window.location.search).get("chart");

  return isValidChartId(tabId, chartId) ? chartId : undefined;
}

function hasInvalidChartParam(tabId = getTabIdFromUrl()) {
  const chartId = new URLSearchParams(window.location.search).get("chart");

  return chartId !== null && !isValidChartId(tabId, chartId);
}

function getTabUrl(tabId: string, chartId?: string, chartState?: ChartUrlState) {
  const url = new URL(window.location.href);
  const nextTabId = isValidTabId(tabId) ? tabId : defaultTabId;

  url.searchParams.set("tab", nextTabId);

  if (chartId && isValidChartId(nextTabId, chartId)) {
    url.searchParams.set("chart", chartId);
    setChartUrlState(url, chartState);
  } else {
    url.searchParams.delete("chart");
    setChartUrlState(url);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

type LoadedTabData =
  | {
      kind: "us-imports";
      data: Awaited<ReturnType<typeof loadUsImportsTabData>>;
    }
  | {
      kind: "india-exports";
      data: Awaited<ReturnType<typeof loadIndiaExportsTabData>>;
    }
  | {
      kind: "comparison";
      data: Awaited<ReturnType<typeof loadComparisonTabData>>;
    }
  | {
      kind: "commodity-wise";
      data: Awaited<ReturnType<typeof loadCommodityWiseTabData>>;
    }
  | {
      kind: "sector";
      data: Awaited<ReturnType<typeof loadSectorConfig>>;
    };

type LoadState = {
  tabId: string;
  data?: LoadedTabData;
  error?: string;
  isLoading: boolean;
};

const loadedTabDataCache = new Map<string, LoadedTabData>();
const loadingTabDataCache = new Map<string, Promise<LoadedTabData>>();

function getTabLabel(tabId: string) {
  return tabs.find((tab) => tab.id === tabId)?.label ?? tabId;
}

async function loadTabData(tabId: string): Promise<LoadedTabData> {
  const sectorMetadata = sectorConfigs.find((config) => config.id === tabId);

  if (sectorMetadata) {
    return {
      kind: "sector",
      data: await loadSectorConfig(sectorMetadata),
    };
  }

  switch (tabId) {
    case "us-imports":
      return {
        kind: "us-imports",
        data: await loadUsImportsTabData(),
      };
    case "india-exports":
      return {
        kind: "india-exports",
        data: await loadIndiaExportsTabData(),
      };
    case "comparison":
      return {
        kind: "comparison",
        data: await loadComparisonTabData(),
      };
    case "commodity-wise":
      return {
        kind: "commodity-wise",
        data: await loadCommodityWiseTabData(),
      };
    default:
      throw new Error(`Unknown tab: ${tabId}`);
  }
}

function getCachedTabData(tabId: string) {
  return loadedTabDataCache.get(tabId);
}

function loadCachedTabData(tabId: string) {
  const loadedData = loadedTabDataCache.get(tabId);

  if (loadedData) {
    return Promise.resolve(loadedData);
  }

  const loadingData = loadingTabDataCache.get(tabId);

  if (loadingData) {
    return loadingData;
  }

  const loadPromise = loadTabData(tabId)
    .then((data) => {
      loadedTabDataCache.set(tabId, data);
      loadingTabDataCache.delete(tabId);
      return data;
    })
    .catch((error) => {
      loadingTabDataCache.delete(tabId);
      throw error;
    });

  loadingTabDataCache.set(tabId, loadPromise);
  return loadPromise;
}

function clearCachedTabData(tabId: string) {
  loadedTabDataCache.delete(tabId);
  loadingTabDataCache.delete(tabId);
}

function getImportDatasetsFromLoadedData(tabData?: LoadedTabData) {
  if (
    tabData?.kind === "us-imports" ||
    tabData?.kind === "comparison" ||
    tabData?.kind === "commodity-wise"
  ) {
    return tabData.data.importDatasets;
  }

  return undefined;
}

function getSummaryImportDatasets(activeTabData?: LoadedTabData) {
  const activeImportDatasets = getImportDatasetsFromLoadedData(activeTabData);

  if (activeImportDatasets) {
    return activeImportDatasets;
  }

  for (const tabData of loadedTabDataCache.values()) {
    const importDatasets = getImportDatasetsFromLoadedData(tabData);

    if (importDatasets) {
      return importDatasets;
    }
  }

  return undefined;
}

function getSummaryStats(importDatasets?: Dataset[]) {
  if (!importDatasets) {
    return undefined;
  }

  const monthlyImportDatasets = importDatasets.filter(
    (dataset) => dataset.actualGranularity === "monthly",
  );

  return {
    importCountryCount: new Set(
      importDatasets
        .map((dataset) => dataset.country)
        .filter((country): country is string => Boolean(country)),
    ).size,
    importHs2CodeCount: new Set(
      monthlyImportDatasets.flatMap((dataset) =>
        dataset.commodities
          .map((commodity) => commodity.hsCode)
          .filter((hsCode): hsCode is string => Boolean(hsCode)),
      ),
    ).size,
    importMonthlyPeriodCount: new Set(
      monthlyImportDatasets.flatMap((dataset) =>
        dataset.periods.map((period) => period.key),
      ),
    ).size,
  };
}

function formatSummaryStat(value: number | undefined) {
  return value == null ? "..." : value;
}

function App() {
  const [initialTabId] = useState(getTabIdFromUrl);
  const [initialChartId] = useState(() => getChartIdFromUrl(initialTabId));
  const [activeTab, setActiveTab] = useState(initialTabId);
  const [activeChart, setActiveChart] = useState<string | undefined>(initialChartId);
  const [locationSearch, setLocationSearch] = useState(() => window.location.search);
  const [retryCount, setRetryCount] = useState(0);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const [loadState, setLoadState] = useState<LoadState>(() => {
    const data = getCachedTabData(initialTabId);

    return {
      tabId: initialTabId,
      data,
      isLoading: !data,
    };
  });
  const cachedActiveTabData = getCachedTabData(activeTab);
  const activeTabData =
    cachedActiveTabData ??
    (loadState.tabId === activeTab ? loadState.data : undefined);
  const isLoading =
    !activeTabData && loadState.tabId === activeTab && loadState.isLoading;
  const loadError =
    !activeTabData && loadState.tabId === activeTab ? loadState.error : undefined;
  const activeTabLabel = getTabLabel(activeTab);
  const activeHelpContent = getHelpContent(activeTab);
  const activeChartState = getChartUrlState(locationSearch);
  const loadingMessage = `Loading ${getTabLabel(activeTab)} data...`;
  const summaryStats = getSummaryStats(getSummaryImportDatasets(activeTabData));

  useEffect(() => {
    if (hasInvalidTabParam() || hasInvalidChartParam(initialTabId)) {
      window.history.replaceState(
        { tabId: initialTabId, chartId: initialChartId ?? null },
        "",
        getTabUrl(initialTabId, initialChartId),
      );
      setLocationSearch(window.location.search);
    }

    function handlePopState() {
      const nextTabId = getTabIdFromUrl();
      const nextChartId = getChartIdFromUrl(nextTabId);

      if (hasInvalidTabParam() || hasInvalidChartParam(nextTabId)) {
        window.history.replaceState(
          { tabId: nextTabId, chartId: nextChartId ?? null },
          "",
          getTabUrl(nextTabId, nextChartId),
        );
      }

      setActiveTab(nextTabId);
      setActiveChart(nextChartId);
      setLocationSearch(window.location.search);
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [initialChartId, initialTabId]);

  useEffect(() => {
    const cachedData = getCachedTabData(activeTab);

    if (cachedData) {
      setLoadState({
        tabId: activeTab,
        data: cachedData,
        isLoading: false,
      });
      return;
    }

    let isCurrent = true;
    setLoadState({
      tabId: activeTab,
      isLoading: true,
    });

    loadCachedTabData(activeTab)
      .then((data) => {
        if (!isCurrent) {
          return;
        }

        setLoadState({
          tabId: activeTab,
          data,
          isLoading: false,
        });
      })
      .catch((error: unknown) => {
        if (!isCurrent) {
          return;
        }

        setLoadState({
          tabId: activeTab,
          error: error instanceof Error ? error.message : String(error),
          isLoading: false,
        });
      });

    return () => {
      isCurrent = false;
    };
  }, [activeTab, retryCount]);

  useEffect(() => {
    if (!activeChart || !activeTabData || isLoading) {
      return;
    }

    const frameId = scrollToChart(activeTab, activeChart);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [activeChart, activeTab, activeTabData, isLoading]);

  function retryActiveTabLoad() {
    clearCachedTabData(activeTab);
    setRetryCount((current) => current + 1);
  }

  function selectTab(tabId: string) {
    if (!isValidTabId(tabId)) {
      return;
    }

    window.history.pushState({ tabId }, "", getTabUrl(tabId));
    setActiveTab(tabId);
    setActiveChart(undefined);
    setLocationSearch(window.location.search);
  }

  function scrollToChart(tabId: string, chartId: string) {
    return window.requestAnimationFrame(() => {
      document
        .getElementById(getChartTargetId(tabId, chartId))
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function linkToChart(chartId: string, chartState?: ChartUrlState) {
    if (!isValidChartId(activeTab, chartId)) {
      return;
    }

    window.history.pushState(
      { tabId: activeTab, chartId },
      "",
      getTabUrl(activeTab, chartId, chartState),
    );
    setActiveChart(chartId);
    setLocationSearch(window.location.search);
    scrollToChart(activeTab, chartId);
  }

  function getChartLink(chartId: string) {
    const isActiveChart = activeChart === chartId;

    return {
      activeTab,
      chartId,
      chartState: isActiveChart ? activeChartState : undefined,
      chartStateKey: isActiveChart ? locationSearch : undefined,
      onChartLink: linkToChart,
    };
  }

  function openHelp() {
    setIsHelpOpen(true);
  }

  function closeHelp() {
    setIsHelpOpen(false);
    window.requestAnimationFrame(() => helpButtonRef.current?.focus());
  }

  return (
    <main className="app">
      <header className="hero">
        <div>
          <h1>Commodity trade with the United States</h1>
          <p className="hero__text">
            Compare US-reported imports by country, India-reported exports, and
            matched HS-code time series. Hover over any chart to see period
            values.
          </p>
        </div>
        <div className="hero__aside">
          <div className="hero__actions">
            <button
              type="button"
              className="help-button"
              onClick={openHelp}
              ref={helpButtonRef}
            >
              Help
            </button>
          </div>
          <div className="summary">
            <div>
              <span className="summary__label">Import countries</span>
              <strong>{formatSummaryStat(summaryStats?.importCountryCount)}</strong>
            </div>
            <div>
              <span className="summary__label">Import HS2 codes</span>
              <strong>{formatSummaryStat(summaryStats?.importHs2CodeCount)}</strong>
            </div>
            <div>
              <span className="summary__label">Monthly periods</span>
              <strong>
                {formatSummaryStat(summaryStats?.importMonthlyPeriodCount)}
              </strong>
            </div>
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label="Trade data sections" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${tab.id}-tab`}
            className={
              activeTab === tab.id
                ? "tabs__button tabs__button--active"
                : "tabs__button"
            }
            aria-controls={`${tab.id}-panel`}
            aria-selected={activeTab === tab.id}
            onClick={() => selectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="tab-panel-shell" aria-busy={isLoading}>
        {isLoading ? (
          <div className="loading-overlay" role="status" aria-live="polite">
            <div className="loading-overlay__card">
              <span className="loading-overlay__spinner" aria-hidden="true" />
              <strong>{loadingMessage}</strong>
            </div>
          </div>
        ) : null}

        {loadError ? (
          <section className="tab-panel" role="tabpanel" id={`${activeTab}-panel`}>
            <div className="empty-state empty-state--error">
              <strong>Unable to load {getTabLabel(activeTab)} data.</strong>
              <p>{loadError}</p>
              <button type="button" onClick={retryActiveTabLoad}>
                Retry
              </button>
            </div>
          </section>
        ) : null}

        {activeTabData?.kind === "us-imports" && activeTab === "us-imports" ? (
          <section
            className="tab-panel"
            role="tabpanel"
            id="us-imports-panel"
            aria-labelledby="us-imports-tab"
          >
            <CountryAggregateChart
              title="All US-reported imports"
              description="Total customs value across all import commodities for each period, shown separately for every available reporting country."
              datasets={activeTabData.data.importDatasets}
              chartLink={getChartLink("all-imports")}
            />

            <CountryDatasetChart
              title="US-reported imports by HS2"
              description="Customs value by two-digit HS import commodity from the US Census trade data."
              datasets={activeTabData.data.importDatasets}
              valueDescription="Customs value by commodity"
              chartLink={getChartLink("hs2-imports")}
            />

            <Hs4ImportChart
              importHs4Datasets={activeTabData.data.importHs4Datasets}
              chartLink={getChartLink("hs4-imports")}
            />
          </section>
        ) : null}

        {activeTabData?.kind === "india-exports" &&
        activeTab === "india-exports" ? (
          <section
            className="tab-panel"
            role="tabpanel"
            id="india-exports-panel"
            aria-labelledby="india-exports-tab"
          >
            <ScopedAggregateExportChart
              title="All India-reported exports"
              description="Total export value across all HS commodities for each period."
              datasets={activeTabData.data.exportScopeDatasets}
              chartLink={getChartLink("all-exports")}
            />

            <ScopedExportDatasetChart
              title="India-reported exports"
              description="TradeStat export values by two-digit HS commodity, converted from US $ million to US dollars."
              datasets={activeTabData.data.exportScopeDatasets}
              valueDescription="Export value by HS commodity"
              chartLink={getChartLink("hs2-exports")}
            />

            <Hs4ExportChart
              exportHs4ScopeDatasets={activeTabData.data.exportHs4ScopeDatasets}
              chartLink={getChartLink("hs4-exports")}
            />
          </section>
        ) : null}

        {activeTabData?.kind === "comparison" && activeTab === "comparison" ? (
          <section
            className="tab-panel"
            role="tabpanel"
            id="comparison-panel"
            aria-labelledby="comparison-tab"
          >
            <ComparisonChart
              exportDatasets={activeTabData.data.exportDatasets}
              indiaImportDatasets={activeTabData.data.indiaImportDatasets}
              chartLink={getChartLink("hs2-comparison")}
            />
            <Hs4ComparisonChart
              exportHs4Datasets={activeTabData.data.exportHs4Datasets}
              indiaImportHs4Datasets={activeTabData.data.indiaImportHs4Datasets}
              chartLink={getChartLink("hs4-comparison")}
            />
          </section>
        ) : null}

        {activeTabData?.kind === "commodity-wise" &&
        activeTab === "commodity-wise" ? (
          <section
            className="tab-panel"
            role="tabpanel"
            id="commodity-wise-panel"
            aria-labelledby="commodity-wise-tab"
          >
            <CommodityWiseTab
              {...activeTabData.data}
              activeTab={activeTab}
              activeChart={activeChart}
              chartState={activeChartState}
              chartStateKey={locationSearch}
              onChartLink={linkToChart}
            />
          </section>
        ) : null}

        {activeTabData?.kind === "sector" ? (
          <section
            className="tab-panel"
            role="tabpanel"
            id={`${activeTabData.data.id}-panel`}
            aria-labelledby={`${activeTabData.data.id}-tab`}
          >
            <SectorImportsTab
              key={activeTabData.data.id}
              config={activeTabData.data}
              activeTab={activeTab}
              activeChart={activeChart}
              chartState={activeChartState}
              chartStateKey={locationSearch}
              onChartLink={linkToChart}
            />
          </section>
        ) : null}
      </div>

      <HelpPanel
        isOpen={isHelpOpen}
        activeTabLabel={activeTabLabel}
        content={activeHelpContent}
        onClose={closeHelp}
      />

      <footer className="site-footer">
        <p>
          Built by{" "}
          <a
            className="site-footer__author"
            href="mailto:akj1996@gmail.com"
            aria-label="Email Ajaykrishnan Jayagopal"
            title="Email Ajaykrishnan Jayagopal"
          >
            Ajaykrishnan Jayagopal
          </a>{" "}
          (2026).
        </p>
        <nav className="site-footer__links" aria-label="Project and data sources">
          <a
            href="https://github.com/ajaykrishnan33/ustradeanalysis"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
            <ExternalLinkIcon />
          </a>
          <span className="site-footer__label">Data sources:</span>
          <a href="https://usatrade.census.gov/" target="_blank" rel="noreferrer">
            USA Trade Online
            <ExternalLinkIcon />
          </a>
          <a
            href="https://tradestat.commerce.gov.in/"
            target="_blank"
            rel="noreferrer"
          >
            TradeStat
            <ExternalLinkIcon />
          </a>
        </nav>
      </footer>
    </main>
  );
}

export default App;
