import irregularTable from './data/irregular.js';
import type { LemmaGuess } from '../lang/shared.js';

export type { LemmaGuess } from '../lang/shared.js';

/*
 * English inflects by rule far more often than German does, so this is mostly
 * rules with a table for the tail - the opposite balance to german/lemmatize.ts,
 * which is mostly table.
 *
 * There is no capitalisation signal to use, either. German splits its lexicon
 * in two because "Bad" is a room and "bad" is a verb stem; English capitalises
 * the start of a sentence and its proper nouns, which tells you nothing about
 * part of speech. One table, and the rules do not care about case.
 */
const IRREGULAR = irregularTable;

/**
 * Undoes the consonant doubled before a suffix: runn -> run, stopp -> stop.
 *
 * Emitted as an extra guess rather than a replacement, and it lands late
 * because the guesses are ordered longest-first. That matters for the words it
 * gets wrong - "pass" would become "pas" if this ran on a bare noun - since a
 * shorter wrong guess is only reached after the longer right one has been
 * tried against the collection and answered.
 */
function undouble(stem: string): string | null {
  return stem.length > 3 && /([bcdfgklmnprstvz])\1$/.test(stem)
    ? stem.slice(0, -1) : null;
}

/**
 * Rule-based guesses for a word, unranked. The caller tries each against the
 * symbol collection and takes the first that resolves, so being wrong here
 * costs a lookup rather than an answer.
 */
function ruleGuesses(lower: string): string[] {
  const out = new Set<string>();
  const add = (word: string) => {
    if (word.length >= 2 && word !== lower) out.add(word);
  };
  /*
   * The forms a stem might really be, once a suffix has been taken off it.
   *
   * A doubled consonant replaces the other two guesses rather than joining
   * them, and that is not tidying. "running" strips to "runn", and "runn" and
   * "runne" are not English words - but they are longer than "run", so ordered
   * longest-first they sat in front of it, and MAX_LEMMA_TRIES cut the ladder
   * off before the only real answer was ever asked for. Emitting a guess is
   * not free: there are three slots, and a word that cannot exist should not
   * hold one.
   */
  const spread = (stem: string) => {
    const un = undouble(stem);
    if (un) {
      add(un);
      return;
    }
    add(stem);
    // "making" -> mak -> make; the silent e is dropped before a vowel suffix.
    add(stem + 'e');
  };

  // A possessive is not an inflection of the thing owned: dad's -> dad.
  const base = lower.replace(/'s$|'$/, '');
  add(base);

  /* Plurals and the third person, which share their endings. `plural` records
   * that one of the specific rules fired, so the catch-all -s below does not
   * also fire and put "glasse" in front of "glass". */
  let plural = false;
  if (base.endsWith('ies') && base.length > 4) { add(base.slice(0, -3) + 'y'); plural = true; }
  if (/(?:s|x|z|ch|sh)es$/.test(base)) { add(base.slice(0, -2)); plural = true; }
  if (base.endsWith('ves') && base.length > 4) {
    add(base.slice(0, -3) + 'f');
    add(base.slice(0, -3) + 'fe');
    plural = true;
  }
  if (!plural && base.endsWith('s') && !base.endsWith('ss') && base.length > 3) {
    add(base.slice(0, -1));
  }

  if (base.endsWith('ing') && base.length > 5) spread(base.slice(0, -3));

  if (base.endsWith('ied') && base.length > 4) add(base.slice(0, -3) + 'y');
  if (base.endsWith('ed') && base.length > 4) {
    spread(base.slice(0, -2));
    // "hoped" loses only the d, because the e was already the verb's.
    add(base.slice(0, -1));
  }

  // Comparatives, superlatives, and the -er that makes a noun of a verb
  // ("teacher" -> "teach"), which is the same strip.
  if (base.endsWith('iest') && base.length > 5) add(base.slice(0, -4) + 'y');
  if (base.endsWith('ier') && base.length > 4) add(base.slice(0, -3) + 'y');
  if (base.endsWith('est') && base.length > 5) spread(base.slice(0, -3));
  if (base.endsWith('er') && base.length > 4) spread(base.slice(0, -2));

  if (base.endsWith('ily') && base.length > 4) add(base.slice(0, -3) + 'y');
  if (base.endsWith('ly') && base.length > 4) add(base.slice(0, -2));

  out.delete(lower);
  return [...out];
}

/**
 * Lemma candidates for a token, best first. A table hit always wins; rule
 * guesses follow, ordered longest-first so that the least aggressive stripping
 * is tried before the most.
 *
 * The second entry is always the word as it was written. lang/shared.ts is
 * what makes that the first thing actually searched for - see the note there,
 * and "left" for why it matters in English.
 */
export function lemmatize(lower: string): LemmaGuess[] {
  const out: LemmaGuess[] = [];
  const seen = new Set<string>();

  const push = (lemma: string, confidence: number) => {
    const key = lemma.toLowerCase();
    if (!lemma || seen.has(key)) return;
    seen.add(key);
    out.push({ lemma, confidence });
  };

  const direct = IRREGULAR[lower] ?? null;
  if (direct) push(direct, 1);

  push(lower, direct ? 0.8 : 0.7);

  const guesses = ruleGuesses(lower).sort((a, b) => b.length - a.length);
  for (const guess of guesses) {
    const known = IRREGULAR[guess] ?? null;
    push(known ?? guess, known ? 0.6 : 0.35);
  }

  return out;
}
