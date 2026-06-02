import type { Dataset, SectorLevel } from "./types";

export type SectorDatasetsByLevel = Partial<Record<SectorLevel, Dataset[]>>;

export type SectorConfigMetadata = {
  id: string;
  tabLabel: string;
  title: string;
  description: string;
  levelsToRender?: SectorLevel[];
  hs2Codes?: string[];
  hs4Codes?: string[];
  hs6Codes?: string[];
  hs8Codes?: string[];
  defaultHs6SumCodes: string[];
};

export type SectorConfig = SectorConfigMetadata & {
  datasetsByLevel: SectorDatasetsByLevel;
  exportDatasetsByLevel?: SectorDatasetsByLevel;
};

export const autoPartsSectorConfig: SectorConfigMetadata = {
  id: "auto-parts",
  tabLabel: "Auto-parts",
  title: "Auto-parts",
  description:
    "Compare US-reported imports for HS84, HS85, and HS87 commodities across the countries available in the deep auto-parts source file.",
  levelsToRender: ["hs2", "hs4", "hs6"],
  hs2Codes: ["84", "85", "87"],
  defaultHs6SumCodes: [
    "840991",
    "840999",
    "841330",
    "841520",
    "848210",
    "848220",
    "848230",
    "848240",
    "848250",
    "848280",
    "848310",
    "848320",
    "848330",
    "848340",
    "848350",
    "848360",
    "848390",
    "850131",
    "850132",
    "850133",
    "850140",
    "850151",
    "850152",
    "850153",
    "850300",
    "850710",
    "850760",
    "851110",
    "851130",
    "851140",
    "851150",
    "851190",
    "853650",
    "853669",
    "853690",
    "854430",
    "870810",
    "870830",
    "870840",
    "870850",
    "870860",
    "870870",
    "870880",
    "870891",
    "870892",
    "870893",
    "870894",
    "870895",
    "870899",
  ],
};

export const seafoodSectorConfig: SectorConfigMetadata = {
  id: "seafood",
  tabLabel: "Seafood",
  title: "Seafood",
  description:
    "Compare seafood and prepared seafood imports into the US with India-reported export scopes for HS03 and HS16 commodities.",
  levelsToRender: ["hs2", "hs4", "hs6", "hs8"],
  defaultHs6SumCodes: ["030617", "160521", "160529"],
};

export const electronicsSectorConfig: SectorConfigMetadata = {
  id: "electronics",
  tabLabel: "Electronics",
  title: "Electronics",
  description:
    "Compare US-reported electronics imports with India-reported export scopes for HS85 commodities.",
  levelsToRender: ["hs2", "hs4", "hs6", "hs8"],
  defaultHs6SumCodes: ["851713", "850760", "852491", "853400", "854231", "851779"],
};

export const textilesSectorConfig: SectorConfigMetadata = {
  id: "textiles",
  tabLabel: "Textiles",
  title: "Textiles",
  description:
    "Compare US-reported textiles and apparel imports with India-reported export scopes for HS61, HS62, and HS63 commodities.",
  levelsToRender: ["hs2", "hs4", "hs6", "hs8"],
  defaultHs6SumCodes: [
    "630231",
    "630260",
    "630492",
    "630291",
    "610910",
    "610510",
    "620342",
    "620462",
    "620520",
    "620630",
    "611020",
    "630790",
    "630232",
  ],
};

export const gemsAndJewellerySectorConfig: SectorConfigMetadata = {
  id: "gems-and-jewellery",
  tabLabel: "Gems & Jewellery",
  title: "Gems & Jewellery",
  description:
    "Compare US-reported gems and jewellery imports with India-reported export scopes for HS71 commodities.",
  levelsToRender: ["hs2", "hs4", "hs6", "hs8"],
  defaultHs6SumCodes: [
    "711319",
    "711311",
    "710239",
    "710391",
    "711620",
    "711790",
    "711420",
    "710399",
    "711590",
  ],
};

export const sectorConfigs = [
  autoPartsSectorConfig,
  seafoodSectorConfig,
  electronicsSectorConfig,
  textilesSectorConfig,
  gemsAndJewellerySectorConfig,
];
