/**
 * Expands the compact seed lists in lexicon-seeds.mjs into the German lemma,
 * base-word and synonym tables under src/german/data/.
 *
 * Run with `node scripts/build-lexicon.mjs`; the output is committed, so the
 * package build has no codegen step and a consumer never runs this.
 *
 * It lived in bildhaft until the German pipeline moved here, and it followed
 * the tables it writes: a generator two repositories away from its output is a
 * generator that stops being run. It emits TypeScript rather than the JSON it
 * used to, for the reason each generated file's own header gives.
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WEAK_VERBS, STRONG_VERBS, SEPARABLE_PREFIXES, NOUNS, ADJECTIVES,
  KEPT_FUNCTION_WORDS, STOPWORDS, SYNONYM_GROUPS,
} from './lexicon-seeds.mjs';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/german/data');

/*
 * Two tables, split by part of speech, because German capitalisation is a reliable
 * disambiguator and collapsing them loses it. "Bad" is a room, "bad" is the stem of
 * "baden"; "Morgen" is a time of day, "morgen" is tomorrow. One merged table would
 * have to pick a winner for each and would be wrong half the time.
 */
const nouns = new Map();
const others = new Map();

const addTo = (table) => (form, lemma) => {
  const f = String(form).toLowerCase().trim();
  if (!f) return;
  // First writer wins: seeds are ordered most-specific first.
  if (!table.has(f)) table.set(f, lemma);
};
const addNoun = addTo(nouns);
const add = addTo(others);

/* ------------------------------------------------------------------ verbs */

const stemOf = (inf) =>
  /(?:eln|ern)$/.test(inf) ? inf.slice(0, -1) : inf.endsWith('en') ? inf.slice(0, -2) : inf.slice(0, -1);

/**
 * German inserts a linking -e- after a stem ending in d/t (arbeitest, badest),
 * and after a nasal only when an obstruent precedes it (atmest, rechnest,
 * öffnest, ordnest).
 *
 * It does NOT after a liquid or another nasal — lernst, turnst, rennst, kämmst,
 * filmst, umarmst — nor after a lengthening h, which is silent: wohnst, föhnst.
 * Digraphs are collapsed first so "ch" counts as the single obstruent it is,
 * which is what separates rechnest (correct) from wohnest (not a word).
 */
const needsE = (stem) => {
  if (/[dt]$/.test(stem)) return true;
  const collapsed = stem
    .replace(/sch/g, 'S')
    .replace(/ch/g, 'C')
    .replace(/ph/g, 'F')
    .replace(/th/g, 'T')
    .replace(/([aeiouäöü])h/g, '$1'); // lengthening h is not a consonant here
  return /[^aeiouäöülrmn][mn]$/.test(collapsed);
};

function conjugateWeak(inf) {
  const stem = stemOf(inf);
  const e = needsE(stem) ? 'e' : '';
  return [
    stem, stem + 'e',
    stem + e + 'st', stem + e + 't', stem + 'en',
    stem + e + 'te', stem + e + 'test', stem + e + 'ten', stem + e + 'tet',
  ];
}

const prefixOf = (verb) => {
  const hit = SEPARABLE_PREFIXES
    .filter((p) => verb.startsWith(p) && verb.length - p.length >= 4)
    .sort((a, b) => b.length - a.length)[0];
  return hit ?? null;
};

for (const inf of WEAK_VERBS) {
  add(inf, inf);
  const pre = prefixOf(inf);
  if (pre) {
    // Separable: "aufräumen" -> aufräume/aufräumst… plus participle "aufgeräumt".
    const base = inf.slice(pre.length);
    const stem = stemOf(base);
    const e = needsE(stem) ? 'e' : '';
    for (const f of conjugateWeak(base)) add(pre + f, inf);
    add(pre + 'ge' + stem + e + 't', inf);
  } else {
    const stem = stemOf(inf);
    const e = needsE(stem) ? 'e' : '';
    for (const f of conjugateWeak(inf)) add(f, inf);
    add('ge' + stem + e + 't', inf);
  }
}

for (const [inf, forms] of Object.entries(STRONG_VERBS)) {
  const clean = inf.trim();
  if (!clean) continue;
  add(clean, clean);
  for (const f of forms) add(f, clean);
}

/* ------------------------------------------------------------------ nouns */

const basewords = new Map(); // lowercase -> display form, used for compound splitting

for (const [singular, ...forms] of NOUNS) {
  addNoun(singular, singular);
  for (const form of forms) {
    addNoun(form, singular);
    /*
     * Dative plural. German appends -n to a plural that does not already end in
     * -n or -s: Kinder -> Kindern, Bäume -> Bäumen, Buntstifte -> Buntstiften.
     * Regular enough to generate; listing it by hand would double the seed file.
     */
    if (!/[ns]$/i.test(form)) addNoun(form + 'n', singular);
  }
  basewords.set(singular.toLowerCase(), singular);
  // Plurals are base words too, so compounds like Bauchschmerzen can be split.
  for (const form of forms) basewords.set(form.toLowerCase(), form);
}

/* ------------------------------------------------------------- adjectives */

const IRREGULAR_COMPARATIVE = {
  'gut': ['besser', 'beste', 'besten', 'am besten'],
  'viel': ['mehr', 'meiste', 'meisten'],
  'hoch': ['höher', 'höchste', 'höchsten', 'hohe', 'hohen', 'hoher', 'hohes'],
  'groß': ['größer', 'größte', 'größten'],
  'alt': ['älter', 'älteste'],
  'jung': ['jünger', 'jüngste'],
  'lang': ['länger', 'längste'],
  'kurz': ['kürzer', 'kürzeste'],
  'warm': ['wärmer', 'wärmste'],
  'kalt': ['kälter', 'kälteste'],
  'stark': ['stärker', 'stärkste'],
  'schwach': ['schwächer', 'schwächste'],
  'nah': ['näher', 'nächste'],
};

for (const adj of ADJECTIVES) {
  add(adj, adj);
  for (const suf of ['e', 'er', 'es', 'en', 'em', 'ste', 'sten', 'ster', 'stes']) add(adj + suf, adj);
  for (const f of IRREGULAR_COMPARATIVE[adj] ?? []) add(f, adj);
  basewords.set(adj.toLowerCase(), adj);
}

/* -------------------------------------------------- kept function words */

for (const [lemma, forms] of Object.entries(KEPT_FUNCTION_WORDS)) {
  add(lemma, lemma);
  for (const f of forms) add(f, lemma);
}

/* ---------------------------------------------------- verbs as basewords */

for (const inf of [...WEAK_VERBS, ...Object.keys(STRONG_VERBS)]) {
  const clean = inf.trim();
  if (clean) basewords.set(clean.toLowerCase(), clean);
}
// Bare verb stems make compound splitting work for e.g. "Spielplatz" -> Spiel + Platz.
for (const [singular] of NOUNS) basewords.set(singular.toLowerCase(), singular);

/* --------------------------------------------------------------- synonyms */

const synonyms = {};
for (const group of SYNONYM_GROUPS) {
  for (const word of group) {
    const key = word.toLowerCase();
    const rest = group.filter((w) => w !== word);
    synonyms[key] = [...new Set([...(synonyms[key] ?? []), ...rest])];
  }
}

/* ----------------------------------------------------------------- output */

/*
 * The paragraphs every generated table carries. They answer the two questions a
 * reader of an 8,000-line data file asks - why is this TypeScript, and why is it
 * typed this loosely - and the answers are the same for all six, so they are
 * written once here rather than six times by hand.
 */
const WHY_TS = `A TypeScript module rather than the .json it used to be: Node's ESM loader
demands an import attribute for JSON and bundlers do not, and a library
consumed by both should not make its consumers care about the difference.

Typed rather than inferred, and deliberately not \`as const\`: the literal
type of four and a half thousand entries is a declaration file nobody can
open, and every reader of these tables wants the wide type anyway.`;

const banner = (what) => '/* Generated by scripts/build-lexicon.mjs from the seed lists in\n'
  + ' * scripts/lexicon-seeds.mjs. Edit those and re-run; do not edit this.\n *\n'
  + [what, WHY_TS].join('\n\n').split('\n').map((l) => (l ? ` * ${l}` : ' *')).join('\n')
  + ' */\n';

/*
 * One entry per line and no indentation. Prettified JSON would indent six
 * thousand lines by a space that carries nothing, and a single line would make
 * every diff the whole file; this way a changed entry is one changed line.
 */
const literal = (data) => JSON.stringify(data, null, 1).replace(/^ +/gm, '');

const write = (name, type, what, data) => {
  const source = `${banner(what)}const table: ${type} = ${literal(data)};\n\nexport default table;\n`;
  writeFileSync(resolve(OUT, `${name}.ts`), source, 'utf8');
  const n = Array.isArray(data) ? data.length : Object.keys(data).length;
  console.log(`${(name + '.ts').padEnd(20)} ${String(n).padStart(6)} entries`);
};

const sorted = (map) => Object.fromEntries([...map].sort(([a], [b]) => a.localeCompare(b, 'de')));

write('lemmas-noun', 'Record<string, string>',
  'Inflected noun form -> lemma. Nouns are their own table because German\n'
  + 'capitalises them, and that is a signal the other table has no use for.',
  sorted(nouns));

write('lemmas-other', 'Record<string, string>',
  'Inflected form -> lemma, for everything that is not a noun.',
  sorted(others));

write('basewords', 'Record<string, string>',
  'Base word -> the form it is stored under. What a compound may be\n'
  + 'split into; the longest match wins.',
  Object.fromEntries([...basewords].sort(([a], [b]) => a.localeCompare(b, 'de'))));

write('synonyms', 'Record<string, string[]>',
  'Lemma -> words to try when the lemma itself found nothing.',
  synonyms);

write('stopwords', 'string[]',
  'Function words a telegraphic board leaves out.',
  [...new Set(STOPWORDS)].sort((a, b) => a.localeCompare(b, 'de')));

write('separable', 'string[]',
  "The prefixes a separable verb's particle can be.",
  [...new Set(SEPARABLE_PREFIXES)].sort((a, b) => b.length - a.length));
