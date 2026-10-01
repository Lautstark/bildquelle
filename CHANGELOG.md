## [2.4.1](https://github.com/Lautstark/bildquelle/compare/v2.4.0...v2.4.1) (2026-10-01)

### Bug Fixes

* **arasaac:** a cache that fails is an empty cache, not a thrown search ([17a8388](https://github.com/Lautstark/bildquelle/commit/17a8388fe7524b7dee81005ad03cfdc44481f194))
* **arasaac:** one URL per picture, and a bound on how many stay alive ([b7d4fd0](https://github.com/Lautstark/bildquelle/commit/b7d4fd0c20c081c9c59d9c4f32096583c955de95))
* **metacom:** a folder that fails to read says so instead of loading forever ([281eaea](https://github.com/Lautstark/bildquelle/commit/281eaeafc43bd9d2a80756809fdd16e950182bba))
* **metacom:** a new folder awaiting permission drops the old one's index ([471ade9](https://github.com/Lautstark/bildquelle/commit/471ade9cba5118b6884ae60bdbf469a89cede72f))
* **metacom:** no picture URL outlives the folder it was read from ([316d86a](https://github.com/Lautstark/bildquelle/commit/316d86aae13d362f7a9858a2885f65e67fb09894)), closes [#revokeAll](https://github.com/Lautstark/bildquelle/issues/revokeAll)
* **panel:** a failed act is drawn as a warning, not thrown into void ([56eaf7c](https://github.com/Lautstark/bildquelle/commit/56eaf7c57b62df8c7b578caf1b3464c317168d95))
* **panel:** choosing a folder announces it once it is picked, not before ([2ec1f86](https://github.com/Lautstark/bildquelle/commit/2ec1f86adaf389c9c63e265bacf2001f09b6018e))
* **panel:** keep keyboard focus on the button across a repaint ([03fb196](https://github.com/Lautstark/bildquelle/commit/03fb1962cdc4e862fbc2c83bc35e24da1a6bbba2))
* **text:** fold decomposed umlauts like typed ones ([353fdbd](https://github.com/Lautstark/bildquelle/commit/353fdbd2bce780c895c7d5829c0b1bd6cc13dc31))

## [2.4.0](https://github.com/Lautstark/bildquelle/compare/v2.3.2...v2.4.0) (2026-09-17)

### Features

* **search:** a between slot, for a picker with rows under its field ([d4034ff](https://github.com/Lautstark/bildquelle/commit/d4034ff679e5e3c44576f555fea6d2ce2aa2c34a))

## [2.3.2](https://github.com/Lautstark/bildquelle/compare/v2.3.1...v2.3.2) (2026-09-17)

### Bug Fixes

* let the Svelte panels take the provider a consumer is holding ([bb82119](https://github.com/Lautstark/bildquelle/commit/bb82119d59795d8fbf2fa583d3daccc44458b00e)), closes [#private](https://github.com/Lautstark/bildquelle/issues/private) [#source](https://github.com/Lautstark/bildquelle/issues/source) [#entries](https://github.com/Lautstark/bildquelle/issues/entries) [#byPath](https://github.com/Lautstark/bildquelle/issues/byPath) [#categories](https://github.com/Lautstark/bildquelle/issues/categories)

## [2.3.1](https://github.com/Lautstark/bildquelle/compare/v2.3.0...v2.3.1) (2026-09-17)

### Performance Improvements

* **metacom:** open a folder once, not once per picture ([d53d875](https://github.com/Lautstark/bildquelle/commit/d53d875a0cb732f196cf75f13f2c730ff5b919bb))

## [2.3.0](https://github.com/Lautstark/bildquelle/compare/v2.2.0...v2.3.0) (2026-09-17)

### Features

* the METACOM panel and the symbol search, as Svelte components ([36de2c2](https://github.com/Lautstark/bildquelle/commit/36de2c21853d9f437236ed60cfa3b05105a3a5f3))
