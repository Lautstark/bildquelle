# bildquelle

Symbol search for German AAC tools. Two sources behind one interface:

- **ARASAAC** — the public REST API, works for anyone, no setup.
- **METACOM** — the user's *own licensed folder*, read from their disk.

Browser-only. There is no server in this package and there is no place to put one.

Extracted from [bildhaft](https://github.com/Lautstark/bildhaft) so that
[vorlaut](https://github.com/Lautstark/vorlaut) does not have to write it a second
time. The point of sharing it is not the line count — it is the licensing rule
below, which belongs in one audited place.

---

## Symbols and licensing

> **This repository contains no symbols.** Neither ARASAAC nor METACOM artwork is
> checked in here, and none is shipped with the package.

### ARASAAC — attribution is mandatory

About 13,000 pictograms with German labels, fetched from
[arasaac.org](https://arasaac.org) at runtime and cached in the browser.

ARASAAC is licensed **CC BY-NC-SA**. Attribution is a condition of that licence,
not a courtesy. It must appear wherever the pictograms do — on screen *and* on
anything printed or exported:

> Piktogramme: ARASAAC (arasaac.org), CC BY-NC-SA.
> Autor: Sergio Palao. Urheber: Regierung von Aragón (Spanien).

The text ships as `ARASAAC_ATTRIBUTION` and as `arasaac.attribution`, so no
consumer has to retype it. For output that mixes sources — a vorlaut board with
both ARASAAC and METACOM keys on it — `attributionsFor(ids)` returns the notices
actually owed.

Non-commercial: material produced with ARASAAC symbols may not be exploited
commercially.

### METACOM — the rule this package exists for

METACOM is a **commercial symbol set, licensed per person.**

- This package ships **no** METACOM file and downloads none.
- It transmits **no** METACOM file — anywhere.
- The user points it at **their own licensed folder** on their own disk. Reading,
  indexing, matching and rendering all happen locally in the browser.
- Nothing *derived* from those files leaves the browser either — not even a
  filename index.

Without the user's own METACOM licence the feature simply does not work. That is
deliberate.

### What goes over the wire

Stated precisely, because a package cannot borrow its host's privacy notice —
whoever installs this inherits the behaviour without inheriting the README.

| Provider | Requests it makes | What those requests carry |
| --- | --- | --- |
| ARASAAC | `GET api.arasaac.org/v1/pictograms/de/search/<term>` per lookup, `GET static.arasaac.org/pictograms/<id>/…` per image | The search term, and by implication which pictograms were shown. No identifiers, no account, no API key, no analytics, no cookies set by us. ARASAAC sees the browser's IP address, as any site would. |
| METACOM | none, ever | — |

Both are cached in IndexedDB. That is a privacy property before it is a
performance one: a word is sent once and then answered locally for 30 days, so a
family working through the same picture book over several weeks produces one
request per word rather than one every time a board is opened. Images likewise —
fetched once, then served from disk. After 30 days a search is made again.

That first row is worth stating rather than rounding down to "nothing leaves
your machine". A search term here is a word from a sentence somebody wrote for a
particular child, and it goes to a third party. Nothing else does — not the
sentence, not the board, not a single byte of METACOM — but that word does.

A consumer that must make no third-party request at all has two options: do not
offer the ARASAAC provider, or warm its cache ahead of time and stay offline
afterwards. METACOM-only operation is fully local by construction.

### What holds the rule up

Documentation is the weakest form of enforcement, so the rule is also built into
the shape of the code:

| Mechanism | Where |
| --- | --- |
| A symbol is only ever handed out as a **URL**, never as bytes. `getImageUrl` returns an object URL, valid in that document alone — renderable, not serialisable. | `types.ts` |
| The METACOM provider **never calls the network.** There is no `fetch` in the file, and a test fails the build if one appears. | `metacom.ts`, `test/invariant.test.ts` |
| Storage is **split by permission.** `arasaacCache` may hold image bytes; `metacomStore` may not, and offers no method that would take them. Caching a licensed image by accident would require adding a store first. | `storage.ts` |
| The filename index is **not reachable in bulk.** Consumers get `symbolCount`, and entries only through a `search` scoped to a term the user typed. | `metacom.ts` |
| The public surface is an **allow-list**, asserted in a test. A new export is a deliberate act, not an oversight. | `test/invariant.test.ts` |

`ProviderId` is a closed union for the same reason: a pluggable third-party
provider would be a hole in exactly the place where the rules live.

The one thing that *does* cross the boundary is search results — ids, which for
METACOM are relative paths. A consumer needs them to remember which symbol the
user picked. Keep them local: persisting a symbol *reference* is fine and is what
both apps do, but such a reference is still derived from a licensed folder, so it
must not be uploaded or shared as-is.

---

## Install

Consumed straight from GitHub — there is no registry publish. Ask for a semver
range, not a commit:

```
npm install github:Lautstark/bildquelle#semver:^1.0.0
```

npm resolves that against the `v*` tags in this repo, so `npm update` moves you
within the major and a breaking release has to be opted into. Pinning a raw
`#<commit-sha>` still works and is what to reach for when bisecting, but it
opts out of that protection — the SHA says nothing about whether the API moved.

Releases are cut with `npm version`; see [RELEASING.md](RELEASING.md).

`prepare` compiles `dist/` at install time, so nothing built is checked in. Two
consequences worth knowing before you install:

- The build runs on *your* machine, so `typescript` and `esbuild` are fetched
  into your tree even though they are this package's devDependencies.
- Installing with `--ignore-scripts` does not fail. It leaves you `src/` and no
  `dist/` at all, reports success, and the first `import` is what breaks. Recent
  npm also warns that `prepare` is "not yet covered by allowScripts" — it still
  runs today, but a consumer that hardens its install is the failure case to
  expect here, and it will not look like an install problem when it lands.

### Without a bundler

A host that serves plain ES modules — no npm, no Vite — cannot resolve the bare
`idb` and `jszip` imports in `dist/`. For that case the package also builds
`dist/browser/`, which is self-contained: one 25 kB module with `idb` inlined,
and JSZip left as a lazily imported chunk so the 148 kB only loads if someone
takes the ZIP route.

Vendor that directory and point an import map at it, keeping the bare specifier
so the map can simply be deleted once a bundler arrives:

```html
<script type="importmap">
  { "imports": { "@lautstark/bildquelle": "/vendor/bildquelle/index.js" } }
</script>
```

`dist/browser/` carries third-party code, so it inherits those licences too:
[idb](https://github.com/jakearchibald/idb) is ISC and
[JSZip](https://stuk.github.io/jszip/) is MIT.

## Use

```ts
import { attributionsFor, getProvider, metacom, MetacomProvider } from '@lautstark/bildquelle';

// ARASAAC works immediately.
const hits = await getProvider('arasaac').search('Apfel');
const url = await getProvider('arasaac').getImageUrl(hits[0].id);

// METACOM needs the user's own folder first.
if (MetacomProvider.supportsPersistentPicker) {
  await metacom.pickDirectory();          // Chromium: remembered across visits
} else {
  await metacom.useFileList(input.files);  // Firefox/Safari: this session only
}

// Whatever ends up on screen or on paper, render what the licences require.
const notices = attributionsFor(['arasaac', 'metacom']);
```

`search` takes whatever the host is looking up — a lemma from a parsed sentence
in bildhaft, a word typed into a key's search box in vorlaut. Providers treat it
as a plain string.

Providers are stateful singletons on purpose: they share resolved object URLs, an
in-memory index and, for METACOM, a folder permission that must not be
re-requested per component.

## API

| Export | What it is |
| --- | --- |
| `getProvider(id)`, `arasaac`, `metacom`, `PROVIDER_IDS` | The registry, and the one instance of each provider. |
| `SymbolProvider` | `status`, `isReady`, `search(query)`, `getImageUrl(id)`, `labelFor(id)`, `attribution`. |
| `ArasaacProvider`, `ARASAAC_ATTRIBUTIONS` | The class, and the licence notice as text, per language. |
| `LanguageCode`, `LANGUAGES`, `setSymbolLanguage(lang)`, `symbolLanguage()` | Which language sentences are read in and ARASAAC is searched in. See below. |
| `MetacomProvider` | Adds `pickDirectory`, `useDirectoryHandle`, `useFileList`, `useZip`, `restore`, `requestPermission`, `rebuildIndex`, `forget`, `subscribe`, `rootName`, `symbolCount`, and the static `supportsPersistentPicker`. |
| `attributionsFor(ids)` | The licence notices owed by a set of providers, deduplicated. |
| `clearAllProviderData()` | Drops everything stored: caches, index, folder handle. For a host's "delete all my data". |
| `scoreLabel`, `foldGerman` | The matching helpers both providers use, exported for hosts that rank their own results the same way. |

`search` never throws — it returns `[]` and reflects the trouble in `status()`.

A status carries a `code` as well as a `message`. Branch on the code; the
message is a default in the provider's own language, and it is not a shared
package's business to decide the wording for a host that ships in more than
one language.

| `kind` | `code` |
| --- | --- |
| `needs-setup` | `no-folder`, `permission-needed` |
| `loading` | `reading-folder`, `unpacking-zip`, `indexing` |
| `error` | `no-images`, `read-failed`, `network` |

## Language

Two languages, `de` and `en`, and the choice reaches three separate things:

```ts
import { setSymbolLanguage, getProvider } from '@lautstark/bildquelle';

setSymbolLanguage('en');
await getProvider('arasaac').search('water');       // ARASAAC's English endpoint

const { resolveText } = await import('@lautstark/bildquelle/english');
```

- **The endpoint.** ARASAAC keeps its keywords per language and the language is
  part of the path. This was hardcoded to `de` until v1.6.0, and it failed
  quietly rather than loudly: `/de/search/water` answers `200` with a
  water-transport sign, because ARASAAC matches on tags and synsets too. An
  English reader was not shown "no results" — they were shown the wrong picture.
- **The pipeline.** `@lautstark/bildquelle/german` and
  `@lautstark/bildquelle/english` are separate entry points, so a host carries
  only the tables for the language it reads. They are not the same pipeline with
  different data: German splits compounds and reassembles separable verbs,
  English merges phrasal verbs and does neither. What the two must agree on
  lives in `src/lang/`.
- **The licence notice.** `attribution` follows the provider's language, because
  CC BY-NC-SA is shown verbatim to whoever is reading.

The cache is keyed by language, so the two never answer for each other and
switching back and forth costs no extra requests.

### English is the shallower of the two

Not a translation of the German pipeline — a smaller one. German ships about
8,000 lines of generated tables; English ships a rule-based lemmatiser and about
200 lines of irregulars. English regular inflection really is rules, so that
covers more than the ratio suggests, but one rung is missing outright: there is
**no synonym table**, so an English collection holding only "bicycle" will not
answer a search for "bike". That is a gap rather than a decision, and the
sequence for closing it is to measure coverage on real input first.

### METACOM is German whatever this is set to

METACOM is a German product, and a symbol's id *is* the filename in the user's
own licensed folder. A collection of `trinken.png` and `aufräumen.png` matches
German words no matter what `setSymbolLanguage` was told, so `setSymbolLanguage`
does not touch it. A host offering English should say so where METACOM is
chosen: in English, ARASAAC is the source that works.

### Browser support for METACOM

| Browser | Folder selection | Remembers the choice |
| --- | --- | --- |
| Chrome / Edge | `showDirectoryPicker()` | yes, one-time |
| Firefox / Safari | `<input webkitdirectory>` | no, until reload |
| all | ZIP file, unpacked in-browser | no |

### What lands in IndexedDB

A database named `bildquelle`, alongside whatever the host keeps in its own.

**It is shared between every consumer on the same origin.** bildhaft and vorlaut
are both served from `lautstark.github.io`, so there is one database with two
programs in it, each pinning its own version of this package. The open therefore
takes whatever version it finds rather than a version of its own, and schema
changes here are additive-only — see RELEASING.md, which has the outage that
taught us.

| Store | Contents |
| --- | --- |
| `arasaacSearch` | Cached result lists, 30-day freshness, served stale when offline. Also what keeps repeat lookups off the network — see [What goes over the wire](#what-goes-over-the-wire). |
| `arasaacImages` | Cached pictogram blobs — public CC BY-NC-SA artwork. |
| `metacomIndex` | Paths, labels and search terms. **No image data.** |
| `metacomHandles` | The directory handle: permission to read, not any content. |

## Develop

```
npm install
npm run typecheck
npm test
npm run build
```

The tests run against a real in-memory IndexedDB rather than a mock, so the
invariant tests can inspect what actually got written.

## Licence

MIT — see [LICENSE](LICENSE). The licence covers this code. It says nothing about
the symbols, which are governed by ARASAAC's CC BY-NC-SA and by the user's own
METACOM licence respectively.
