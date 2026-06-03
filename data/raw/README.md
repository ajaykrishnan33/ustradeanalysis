# Raw Data Sources

Raw inputs cover the 2024-2026 period. US import files come from [USA Trade Online](https://usatrade.census.gov/), and India export workbooks come from [TradeStat](https://tradestat.commerce.gov.in/).

## US Census Imports

`us-census/imports/hs2` and `us-census/imports/hs4` contain US Census CSV exports with US-reported import values by source country at HS2 and HS4 commodity levels.

Sector import folders contain focused US Census CSV exports:

- `us-census/imports/auto-parts`: HS84, HS85, and HS87 auto-parts-related imports; preprocessing extracts HS2, HS4, and HS6 rows and skips 10-digit HTS rows.
- `us-census/imports/seafood`: HS03 and HS16 seafood and prepared seafood imports; preprocessing extracts HS2, HS4, HS6, and HS8 datasets.
- `us-census/imports/electronics`: HS85 electronics imports; preprocessing extracts HS2, HS4, HS6, and HS8 datasets.
- `us-census/imports/textiles`: HS61, HS62, and HS63 textiles and apparel imports from selected countries plus the World Total aggregate; preprocessing extracts HS2, HS4, HS6, and HS8 datasets.
- `us-census/imports/gems-and-jewellery`: HS71 gems and jewellery imports; preprocessing extracts HS2, HS4, HS6, and HS8 datasets.

## India TradeStat Exports

`tradestat/exports` contains TradeStat XLSX workbooks for India-reported exports, organized by HS level and destination scope: Indian exports to the US and global exports.

`tradestat/exports/hs8` contains HS8 export workbooks used to build HS6 aggregates and HS8 India export datasets for sector-level views, including seafood, electronics, textiles, and gems and jewellery.
