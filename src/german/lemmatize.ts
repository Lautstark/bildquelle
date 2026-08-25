import nounTable from './data/lemmas-noun.js';
import otherTable from './data/lemmas-other.js';

/*
 * The lexicon is split by part of speech so that German capitalisation can do the
 * disambiguating it is there to do: "Bad" is a room, "bad" is the stem of "baden";
 * "Morgen" is a time of day, "morgen" means tomorrow. A capitalised token consults
 * the noun table first, a lowercase one consults everything else first.
 */
const NOUNS = nounTable as Record<string, string>;
const OTHERS = otherTable as Record<string, string>;

export type { LemmaGuess } from '../lang/shared.js';
import type { LemmaGuess } from '../lang/shared.js';

const UMLAUT_BACK: Record<string, string> = { ä: 'a', ö: 'o', ü: 'u' };

/** Reverses plural umlauting: Äpfel -> Apfel, Bäume -> Baume (then -e stripped). */
function deumlaut(word: string): string[] {
  const out = new Set<string>();
  for (let i = 0; i < word.length; i++) {
    const back = UMLAUT_BACK[word[i]];
    if (back) out.add(word.slice(0, i) + back + word.slice(i + 1));
  }
  // "äu" pluralises from "au" — handle the digraph explicitly.
  if (word.includes('äu')) out.add(word.replace('äu', 'au'));
  return [...out];
}

const NOUN_SUFFIXES = ['nen', 'en', 'er', 'se', 'e', 'n', 's'];
const VERB_SUFFIXES = ['test', 'tet', 'ten', 'te', 'est', 'st', 'et', 'en', 't', 'e'];

/**
 * Rule-based fallback for words the dictionary does not know. Generates ranked
 * guesses rather than committing to one — the caller tries each against the
 * symbol index and takes the first that resolves.
 */
function ruleGuesses(lower: string): string[] {
  const out = new Set<string>();
  const bases = [lower, ...deumlaut(lower)];

  for (const base of bases) {
    if (base !== lower) out.add(base);

    // Past participle: gemacht -> machen, gelaufen -> laufen
    const ptc = base.match(/^ge(.+?)(t|en)$/);
    if (ptc && ptc[1].length >= 3) {
      out.add(ptc[1] + 'en');
      out.add(ptc[1]);
    }

    for (const suf of NOUN_SUFFIXES) {
      if (base.endsWith(suf) && base.length - suf.length >= 3) out.add(base.slice(0, -suf.length));
    }

    for (const suf of VERB_SUFFIXES) {
      if (base.endsWith(suf) && base.length - suf.length >= 3) {
        const stem = base.slice(0, -suf.length);
        out.add(stem + 'en');
        out.add(stem);
      }
    }
  }

  out.delete(lower);
  return [...out];
}

/** Dictionary lookup honouring the capitalisation signal. */
function lookup(form: string, capitalized: boolean): string | null {
  const [first, second] = capitalized ? [NOUNS, OTHERS] : [OTHERS, NOUNS];
  return first[form] ?? second[form] ?? null;
}

/**
 * Returns lemma candidates for a token, best first. A dictionary hit always wins;
 * rule guesses follow, ordered longest-first (less aggressive stripping first).
 */
export function lemmatize(lower: string, capitalized = false): LemmaGuess[] {
  const out: LemmaGuess[] = [];
  const seen = new Set<string>();

  const push = (lemma: string, confidence: number) => {
    const key = lemma.toLowerCase();
    if (!lemma || seen.has(key)) return;
    seen.add(key);
    out.push({ lemma, confidence });
  };

  const direct = lookup(lower, capitalized);
  if (direct) push(direct, 1);

  // The surface form itself is always worth trying against the symbol index.
  push(lower, direct ? 0.8 : 0.7);

  const guesses = ruleGuesses(lower).sort((a, b) => b.length - a.length);
  for (const guess of guesses) {
    const known = lookup(guess, capitalized);
    push(known ?? guess, known ? 0.6 : 0.35);
  }

  return out;
}

/**
 * Verb-first lookup, used when reassembling separable verbs — "aufräumen" is only
 * ever a verb, so the noun table must not get a say.
 */
export function lookupVerbLemma(form: string): string | null {
  return OTHERS[form] ?? null;
}
