# Raw Data Sources

`us-census/imports/hs2` and `us-census/imports/hs4` contain US Census import CSV exports with US-reported import values by source country at HS2 and HS4 commodity levels.

`us-census/imports/auto-parts` contains US Census import CSV exports for HS84, HS85, and HS87 auto-parts-related imports; the preprocessing script extracts HS2, HS4, and HS6 rows and skips 10-digit HTS rows.

`us-census/imports/seafood` contains US Census import CSV exports for seafood and prepared seafood imports, currently covering HS03 and HS16; the sector preprocessing extracts HS2, HS4, HS6, and HS8 datasets for the Seafood tab.

`us-census/imports/electronics` contains US Census import CSV exports for electronics imports, currently covering HS85; the sector preprocessing extracts HS2, HS4, HS6, and HS8 datasets for the Electronics tab.

`us-census/imports/textiles` contains US Census import CSV exports for textiles and apparel imports, currently covering HS61, HS62, and HS63; the sector preprocessing extracts HS2, HS4, HS6, and HS8 datasets for the Textiles tab from selected source countries and the World Total aggregate.

`us-census/imports/gems-and-jewellery` contains US Census import CSV exports for gems and jewellery imports, currently covering HS71; the sector preprocessing extracts HS2, HS4, HS6, and HS8 datasets for the Gems & Jewellery tab.

`tradestat/exports` contains TradeStat XLSX workbooks for India-reported exports, organized by HS level and destination scope: Indian exports to the US and global exports.

`tradestat/exports/hs8` contains TradeStat HS8 export workbooks used to build HS6 aggregates and HS8 India export datasets for sector-level views such as Seafood.
