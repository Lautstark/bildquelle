/**
 * German lexicon coverage: how much of a corpus the generated tables know.
 *
 * The narrow companion to coverage.mjs, and the two answer different questions.
 * coverage.mjs asks whether a word comes back with a *picture*, which mixes the
 * pipeline together with what ARASAAC happens to draw. This one asks only what
 * editing lexicon-seeds.mjs can change: for each content word, does the lexicon
 * know the form outright, or does the lemmatiser fall back on suffix guessing?
 * It touches no network, so the number moves when and only when the seeds do.
 *
 * It runs the real pipeline rather than a copy of it - tokenize, lemmatize,
 * splitCompound, findSeparableMerge, all imported from dist/ - so the figure
 * cannot drift away from what a consumer actually gets. `confidence === 1` is
 * lemmatize's own word for a dictionary hit; everything below it is a guess.
 *
 *   npm run build && node scripts/lexicon-coverage.mjs [--verbose]
 *
 * The corpus is deliberately the material people really type: daily routines,
 * therapy phrases and lines from picture books. It was also used to choose the
 * vocabulary, so the number is a floor, not a score - judge a change by writing
 * fresh sentences that did not inform it. `--verbose` lists the misses, which is
 * how you decide what to seed next.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  tokenize, lemmatize, splitCompound, findSeparableMerge, GERMAN_STOPWORDS,
} from '../dist/german/index.js';
import nounTable from '../dist/german/data/lemmas-noun.js';
import otherTable from '../dist/german/data/lemmas-other.js';
import basewordTable from '../dist/german/data/basewords.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const STOPWORDS = new Set(GERMAN_STOPWORDS);

const corpus = readFileSync(resolve(HERE, 'corpus.de.txt'), 'utf8')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

let content = 0;
let hit = 0;
const misses = new Map();
const rescued = new Map();

for (const sentence of corpus) {
  const tokens = tokenize(sentence);

  /* A split separable verb is one word in two places: "räum … auf" is
   * aufräumen, which the lexicon does know. Counting the particle as its own
   * miss would punish the tables for a form they hold. */
  const merge = findSeparableMerge(tokens);

  for (const token of tokens) {
    if (STOPWORDS.has(token.lower)) continue;
    if (merge && token.index === merge.particleIndex) continue;
    content++;

    if (merge && token.index === merge.verbIndex) { hit++; continue; }
    if (lemmatize(token.lower, token.capitalized)[0]?.confidence === 1) { hit++; continue; }

    // Compounds are built, not listed; a split into known parts is a real hit.
    const parts = splitCompound(token.lower);
    if (parts) {
      rescued.set(token.surface, parts.map((p) => p.word).join(' + '));
      hit++;
      continue;
    }
    misses.set(token.surface, (misses.get(token.surface) ?? 0) + 1);
  }
}

const pct = (n) => ((n / content) * 100).toFixed(1);
const forms = Object.keys(nounTable).length + Object.keys(otherTable).length;
console.log(`corpus        ${corpus.length} sentences`);
console.log(`content words ${content}`);
console.log(`known         ${hit}  (${pct(hit)}%)`);
console.log(`unknown       ${content - hit}  (${pct(content - hit)}%)`);
console.log(`lexicon       ${forms} forms / ${Object.keys(basewordTable).length} base words`);

if (process.argv.includes('--verbose')) {
  if (rescued.size) {
    console.log(`\nrescued by compound splitting (${rescued.size}):`);
    for (const [w, s] of rescued) console.log(`  ${w} -> ${s}`);
  }
  console.log(`\nunknown words (${misses.size} distinct), most frequent first:`);
  for (const [w, n] of [...misses].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(2)}  ${w}`);
  }
}
