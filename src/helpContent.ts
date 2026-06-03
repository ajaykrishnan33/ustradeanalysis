import { sectorConfigs, type SectorConfigMetadata } from "./sectorConfigs";

export type HelpSection = {
  title: string;
  body?: string;
  bullets?: string[];
  links?: Array<{
    href: string;
    label: string;
  }>;
};

export type HelpContent = {
  title: string;
  intro: string;
  sections: HelpSection[];
};

const hsCodeBasics: HelpSection = {
  title: "HS codes in plain English",
  body:
    "HS codes are product classification codes used in international trade data. More digits mean a more specific product category.",
  bullets: [
    "HS2 is a broad chapter, such as all machinery or all seafood.",
    "HS4 narrows that chapter into a product family.",
    "HS6 is the internationally comparable product level used by most countries.",
    "HS8 is a more detailed reporting level, useful for drilling into specific products when available.",
  ],
};

const chartBasics: HelpSection = {
  title: "Reading the charts",
  bullets: [
    "Each line is a country, export scope, or selected product series.",
    "Use Monthly for individual months, Calendar Year for Jan-Dec totals, or Fiscal Year for Apr-Mar totals.",
    "Calendar Year and Fiscal Year only show complete annual periods with boundary-month coverage.",
    "Values are in US dollars unless the monthly unit selector is set to % growth.",
    "% growth is available for monthly views and compares each month with the previous month, so it is best for spotting momentum rather than total size.",
    "Hover over a chart to see exact values for a period.",
    "Vertical event lines mark important tariff or policy dates for context.",
  ],
};

const linkBasics: HelpSection = {
  title: "Sharing a chart",
  bullets: [
    "Use the Link button on a chart to update the page URL for that chart.",
    "The link includes the chart's current inputs, so reloading or sharing that URL restores those selections.",
    "Changing inputs does not update the URL until you click Link again.",
    "Inputs not included in the URL use their default values.",
  ],
};

const dataSourceLinks: HelpSection["links"] = [
  {
    href: "https://usatrade.census.gov/",
    label: "USA Trade Online",
  },
  {
    href: "https://tradestat.commerce.gov.in/",
    label: "TradeStat",
  },
];

const scopeBasics: HelpSection = {
  title: "Scopes and sources",
  bullets: [
    "US import charts use US Census data and show imports into the United States from selected countries.",
    "India export charts use India TradeStat data and show Indian exports under different reporting scopes.",
    "Indian exports to the US are reported by India, while US-reported imports from India are reported by the US. They may differ because of timing, definitions, or reporting methods.",
    "Global Indian exports excluding the US subtracts US-reported imports from India from India's global export totals.",
  ],
  links: dataSourceLinks,
};

const helpByTabId: Record<string, HelpContent> = {
  "us-imports": {
    title: "Using the US Imports tab",
    intro:
      "Use this tab to understand what the United States reports importing from different countries and how those imports change over time.",
    sections: [
      hsCodeBasics,
      {
        title: "What to do here",
        bullets: [
          "Start with All US-reported imports to compare total imports by country.",
          "Use the HS2 chart for broad product categories.",
          "Use the HS4 chart when you want a more specific product family.",
          "Use the country selector to compare one or more reporting countries without resetting your commodity choices.",
        ],
      },
      chartBasics,
      linkBasics,
    ],
  },
  "india-exports": {
    title: "Using the India Exports tab",
    intro:
      "Use this tab to understand India-reported exports and compare global exports, exports to the US, and adjusted non-US scopes.",
    sections: [
      hsCodeBasics,
      scopeBasics,
      {
        title: "What to do here",
        bullets: [
          "Use All India-reported exports for the total value across all HS commodities.",
          "Use the HS2 and HS4 charts to focus on specific product categories.",
          "Select one or more export scopes to compare India's reported export patterns.",
          "Switch to % growth when you want to compare month-to-month changes instead of total value.",
        ],
      },
      chartBasics,
      linkBasics,
    ],
  },
  comparison: {
    title: "Using the US-India Comparison tab",
    intro:
      "Use this tab to compare India-reported exports to the US with US-reported imports from India for matching commodities.",
    sections: [
      hsCodeBasics,
      {
        title: "Why the two lines can differ",
        bullets: [
          "The India export line comes from India TradeStat.",
          "The US import line comes from US Census import data.",
          "Differences can come from shipment timing, freight and insurance treatment, product classification, or reporting revisions.",
          "The comparison is most useful for direction, timing, and gap analysis rather than expecting the two sources to match exactly.",
        ],
        links: dataSourceLinks,
      },
      {
        title: "What to do here",
        bullets: [
          "Use the HS2 comparison for broad commodities or All Commodities.",
          "Use the HS4 comparison when you want a more specific matched product family.",
          "Use monthly view for recent movement, Calendar Year for Jan-Dec totals, or Fiscal Year for Apr-Mar totals.",
        ],
      },
      chartBasics,
      linkBasics,
    ],
  },
  "commodity-wise": {
    title: "Using the Commodity-wise tab",
    intro:
      "Use this tab to select one product category and compare many import and export scopes on the same chart.",
    sections: [
      hsCodeBasics,
      scopeBasics,
      {
        title: "What to do here",
        bullets: [
          "Choose one HS2 commodity first. This selection controls the broad product category.",
          "Choose an HS4 commodity below when you want a more specific product family.",
          "Select multiple scopes to compare US-reported imports and India-reported exports together.",
          "In monthly view, if a month is missing for a selected HS4 series, the chart fills it as zero so all selected scopes share the same time axis.",
        ],
      },
      chartBasics,
      linkBasics,
    ],
  },
};

function buildSectorHelp(config: SectorConfigMetadata): HelpContent {
  const levels = config.levelsToRender ?? ["hs2", "hs4", "hs6"];
  const levelText = levels.map((level) => level.toUpperCase()).join(", ");
  const scopeBullets = [
    "Sector tabs are restricted to products and scopes available in that sector's source files.",
    "Use import scopes to compare US-reported imports by country and export scopes to compare India-reported exports.",
  ];

  if (config.id === "textiles") {
    scopeBullets.push(
      "In Textiles, Global imports by US uses the US Census World Total import aggregate for HS61, HS62, and HS63.",
    );
  }

  return {
    title: `Using the ${config.tabLabel} tab`,
    intro: config.description,
    sections: [
      hsCodeBasics,
      scopeBasics,
      {
        title: "Custom product basket",
        bullets: [
          "The first chart combines the product groups you choose into one basket for each selected scope.",
          "Use the product-group input to add or remove codes. Put one code per line or separate codes with commas.",
          "Use the period selector to switch between monthly values, calendar-year totals from January through December, and fiscal-year totals from April through March.",
          "The % growth unit is available for monthly values; annual views show total US dollar values.",
          "Use the side panel beside the chart to switch between the whole basket and an individual product group.",
          "This top chart has its own scope selector, period selector, and unit toggle, separate from the drill-down charts below.",
        ],
      },
      {
        title: "Drill-down charts",
        bullets: [
          `Below the summed chart, this sector includes ${levelText} charts where available.`,
          "The first available commodity is selected by default so the drill-down charts start with data where possible.",
          "Start broad with HS2, then narrow to HS4, HS6, and HS8 if the data supports those levels; changing a parent dropdown updates the lower-level choices.",
          ...scopeBullets,
        ],
      },
      chartBasics,
      linkBasics,
    ],
  };
}

export function getHelpContent(tabId: string) {
  const sectorConfig = sectorConfigs.find((config) => config.id === tabId);

  if (sectorConfig) {
    return buildSectorHelp(sectorConfig);
  }

  return (
    helpByTabId[tabId] ?? {
      title: "Using this tool",
      intro:
        "Use the tabs to compare US-reported import data, India-reported export data, and matched commodity time series.",
      sections: [hsCodeBasics, scopeBasics, chartBasics, linkBasics],
    }
  );
}
