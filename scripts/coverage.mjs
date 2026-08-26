/**
 * How much of a real sentence each language actually finds symbols for.
 *
 * The question this exists to answer is not "does the lemmatiser work" - the
 * unit tests answer that - but "if somebody types a picture-book line into
 * bildhaft or vorlaut, how many of the words come back with a picture." That is
 * the number that decides whether a language is worth putting an interface in
 * front of, and it is the one number nobody had for English.
 *
 * It measures the pipeline AND the collection together, deliberately. A word
 * can go unmatched because the lemmatiser guessed badly or because ARASAAC
 * simply has no pictogram for it, and from the family's side those are the same
 * failure: an empty square. The unmatched list at the bottom is what tells the
 * two apart by eye, and it is the actionable half - a synonym table is built
 * out of exactly those words.
 *
 * "Found something" is reported separately from "found the right thing", and
 * the gap between those two columns is the whole reason this script is not
 * just a percentage. ARASAAC matches on tags and synsets as well as on
 * keywords, so it answers far more often than it agrees: asking its German
 * endpoint for "water" returns a water-transport sign, with a 200 and a
 * pictogram, and a script counting non-empty answers would score that as a
 * success. It is the failure that started all of this. So each hit is also
 * scored against the word that was asked for - the same scoreLabel both
 * providers rank with - and anything that matches no part of the query is
 * counted as loose rather than as a find.
 *
 * German is not the target, it is the control. A bare English percentage means
 * nothing on its own; English measured against the language that has had the
 * tables, the corpus and the hand-correction is a number that can be argued
 * with. The two corpora are line-for-line translations for the same reason.
 *
 *   node scripts/coverage.mjs              both languages
 *   node scripts/coverage.mjs --language en
 *   node scripts/coverage.mjs --refresh    ignore the cache and ask again
 *
 * Answers are cached in scripts/.coverage-cache.json, which is not committed.
 * ARASAAC is a free service run by a regional government; this asks it for a
 * few hundred words once and then stops asking. Re-running is free.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { scoreLabel } from '../dist/text.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = resolve(HERE, '.coverage-cache.json');
const LANGUAGES = ['de', 'en'];

const args = process.argv.slice(2);
const only = args.includes('--language') ? args[args.indexOf('--language') + 1] : null;
const refresh = args.includes('--refresh');

const cache = !refresh && existsSync(CACHE_PATH)
  ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {};
let asked = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ARASAAC, as a SymbolProvider, over the network.
 *
 * Not the real provider: that one caches into IndexedDB, which does not exist
 * out here. The ranking is skipped too - this counts whether anything came
 * back, and the order of what came back is not part of the question.
 */
function collection(lang) {
  return {
    id: 'arasaac',
    async search(query) {
      const key = `${lang}:${query.toLowerCase().trim()}`;
      if (key in cache) return cache[key];

      const url = `https://api.arasaac.org/v1/pictograms/${lang}/search/`
        + encodeURIComponent(query);
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      // A 404 is ARASAAC's "no results", not a failure.
      if (res.status === 404) {
        cache[key] = [];
      } else if (!res.ok) {
        throw new Error(`ARASAAC answered ${res.status} for ${key}`);
      } else {
        const json = await res.json();
        cache[key] = (Array.isArray(json) ? json : []).map((p) => ({
          id: String(p._id),
          label: p.keywords?.[0]?.keyword ?? String(p._id),
          score: 100,
        }));
      }
      asked += 1;
      await sleep(60);
      return cache[key];
    },
  };
}

const corpus = (lang) =>
  readFileSync(resolve(HERE, `corpus.${lang}.txt`), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

async function pipelineFor(lang) {
  return lang === 'de'
    ? import('../dist/german/index.js')
    : import('../dist/english/index.js');
}

async function measure(lang) {
  const { resolveText } = await pipelineFor(lang);
  const provider = collection(lang);
  const lines = corpus(lang);

  const byOrigin = new Map();
  const unmatched = [];
  const loose = [];
  let words = 0;
  let found = 0;
  let solid = 0;

  for (const line of lines) {
    for (const word of await resolveText(line, { provider })) {
      words += 1;
      byOrigin.set(word.origin, (byOrigin.get(word.origin) ?? 0) + 1);

      if (word.candidates.length === 0) {
        unmatched.push(word.sourceToken.toLowerCase());
        continue;
      }
      found += 1;

      /* Does any of what came back actually answer the word asked for?
       * 55 is scoreLabel's "the label starts with the query"; below that is a
       * substring buried somewhere, or nothing textual at all and the match
       * came from a tag. */
      const best = Math.max(...word.candidates.map((c) => scoreLabel(word.concept, c.label)));
      if (best >= 55) solid += 1;
      else loose.push(`${word.sourceToken.toLowerCase()} -> ${word.candidates[0].label}`);
    }
  }

  return { lang, lines: lines.length, words, found, solid, byOrigin, unmatched, loose };
}

function report(r) {
  const pct = ((r.solid / r.words) * 100).toFixed(1);
  const anyPct = ((r.found / r.words) * 100).toFixed(1);
  console.log(`\n=== ${r.lang} ${'='.repeat(56)}`);
  console.log(`  ${r.lines} sentences, ${r.words} words worth looking up`);
  console.log(`  ${r.found} got an answer at all      ->  ${anyPct}%`);
  console.log(`  ${r.solid} got one that matches word ->  ${pct}%   <- the real number`);
  console.log('\n  which rung answered:');
  for (const [origin, n] of [...r.byOrigin].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(origin).padEnd(10)} ${String(n).padStart(4)}`);
  }
  if (r.loose.length) {
    console.log(`\n  answered, but with something that does not match the word `
      + `(${r.loose.length}):`);
    for (const one of r.loose.slice(0, 20)) console.log(`    ${one}`);
    if (r.loose.length > 20) console.log(`    ... and ${r.loose.length - 20} more`);
  }
  if (r.unmatched.length) {
    const counted = new Map();
    for (const w of r.unmatched) counted.set(w, (counted.get(w) ?? 0) + 1);
    const list = [...counted].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    console.log(`\n  nothing found for ${list.length} distinct word(s):`);
    console.log('    ' + list.map(([w, n]) => (n > 1 ? `${w} (${n})` : w)).join(', '));
  }
  return pct;
}

const wanted = only ? [only] : LANGUAGES;
const results = [];
for (const lang of wanted) results.push(await measure(lang));

writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 0));

const pcts = results.map(report);
if (results.length === 2) {
  const [a, b] = results;
  const gap = (b.solid / b.words - a.solid / a.words) * 100;
  console.log(`\n${'='.repeat(62)}`);
  console.log(`  ${a.lang} ${pcts[0]}%  vs  ${b.lang} ${pcts[1]}%   (matching-word rate)`
    + `   (${gap >= 0 ? '+' : ''}${gap.toFixed(1)} points)`);
}
console.log(`\n  ${asked} word(s) asked of ARASAAC this run; the rest came from cache.\n`);
