import { useEffect, useState } from "react";
import { SectorImportsTab } from "./components/AutoPartsTab";
import CommodityWiseTab from "./components/CommodityWiseTab";
import ComparisonChart from "./components/ComparisonChart";
import CountryAggregateChart from "./components/CountryAggregateChart";
import CountryDatasetChart from "./components/CountryDatasetChart";
import Hs4ComparisonChart from "./components/Hs4ComparisonChart";
import Hs4ExportChart from "./components/Hs4ExportChart";
import Hs4ImportChart from "./components/Hs4ImportChart";
import ScopedAggregateExportChart from "./components/ScopedAggregateExportChart";
import ScopedExportDatasetChart from "./components/ScopedExportDatasetChart";
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
  const [activeTab, setActiveTab] = useState("us-imports");
  const [retryCount, setRetryCount] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>(() => {
    const data = getCachedTabData("us-imports");

    return {
      tabId: "us-imports",
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
  const loadingMessage = `Loading ${getTabLabel(activeTab)} data...`;
  const summaryStats = getSummaryStats(getSummaryImportDatasets(activeTabData));

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

  function retryActiveTabLoad() {
    clearCachedTabData(activeTab);
    setRetryCount((current) => current + 1);
  }

  return (
    <main className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">US import and India export data</p>
          <h1>Commodity trade with the United States</h1>
          <p className="hero__text">
            Compare US-reported imports by country, India-reported exports, and
            matched HS-code time series. Hover over any chart to see period
            values.
          </p>
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
            onClick={() => setActiveTab(tab.id)}
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
              eyebrow="US Census import data"
              description="Total customs value across all import commodities for each period, shown separately for every available reporting country."
              datasets={activeTabData.data.importDatasets}
            />

            <CountryDatasetChart
              title="US-reported imports HS2"
              eyebrow="US Census import data"
              description="Customs value by two-digit HS import commodity from the US Census trade data."
              datasets={activeTabData.data.importDatasets}
              valueDescription="Customs value by commodity"
            />

            <Hs4ImportChart
              importHs4Datasets={activeTabData.data.importHs4Datasets}
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
              title="All India Exports"
              eyebrow="India Ministry of Commerce export data"
              description="Total export value across all HS commodities for each period."
              datasets={activeTabData.data.exportScopeDatasets}
            />

            <ScopedExportDatasetChart
              title="India-reported exports"
              eyebrow="India Ministry of Commerce export data"
              description="TradeStat export values by two-digit HS commodity, converted from US $ million to US dollars."
              datasets={activeTabData.data.exportScopeDatasets}
              valueDescription="Export value by HS commodity"
            />

            <Hs4ExportChart
              exportHs4ScopeDatasets={activeTabData.data.exportHs4ScopeDatasets}
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
            />
            <Hs4ComparisonChart
              exportHs4Datasets={activeTabData.data.exportHs4Datasets}
              indiaImportHs4Datasets={activeTabData.data.indiaImportHs4Datasets}
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
            <CommodityWiseTab {...activeTabData.data} />
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
            />
          </section>
        ) : null}
      </div>
    </main>
  );
}

export default App;
