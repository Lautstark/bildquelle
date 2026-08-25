/*
 * The half of "a sentence, turned into the words worth looking up" that is not
 * about any one language.
 *
 * It exists because there are two pipelines now. German came first, English was
 * written after it, and the cheap way to write the second one is to read the
 * first and re-derive its decisions - which is exactly how the ladder ordering
 * rule below, the one that took a bug to find, gets re-derived wrongly. So the
 * rule lives here once and both languages call it.
 *
 * What is deliberately NOT here is the ladder itself. German tries a compound
 * split and a synonym table; English merges phrasal verbs and has neither. A
 * shared resolveText() taking a bag of optional strategies would be a way of
 * pretending those are the same shape, and they are not.
 */
import type { Candidate, SymbolProvider } from '../types.js';

/**
 * The rungs every language has. `override` means `prefer` answered.
 *
 * Each language widens this with its own and exports the result as its own
 * `ResolveOrigin` - German adds `compound`, `synonym` and `separable`, English
 * adds `phrasal`. One shared union holding all of them would have been less
 * code and would have quietly widened what German promises: a host that
 * narrows this to a type of its own - bildhaft's SlotOrigin does exactly that -
 * stops compiling the day another language gains a rung it can never be
 * handed. Which happened, and is why this is the shape it is.
 */
export type CommonOrigin = 'override' | 'raw' | 'lemma' | 'unmatched';

/** One word of the input and what the collection had to say about it. */
export interface ResolvedWordOf<Origin extends string = CommonOrigin> {
  /** The word as it was written, for showing back to whoever wrote it. */
  sourceToken: string;
  /** The word actually looked up, once folded, lemmatised or split. */
  concept: string;
  origin: Origin;
  /** Ranked, best first. Empty is a real answer: nothing matched. */
  candidates: Candidate[];
}

export interface ResolveOptions {
  provider: SymbolProvider;
  /**
   * Answered before the language ladder runs, and its answer wins.
   *
   * This is where a host's own dictionary plugs in - bildhaft's personal
   * overrides are exactly this - without this package having to know that such
   * a thing exists. Return null to fall through. The key is the lowercased
   * lemma or word being tried.
   */
  prefer?: (key: string) => Candidate[] | null;
  /** Defaults to the pipeline's own list. Pass an empty list to keep every word. */
  stopwords?: Iterable<string>;
}

/** A lemma a language thinks a word might reduce to. */
export interface LemmaGuess {
  lemma: string;
  /** 1 = dictionary hit, lower = rule-derived guess. */
  confidence: number;
}

/** How many lemma guesses to spend a lookup on before trying the next strategy. */
export const MAX_LEMMA_TRIES = 3;

/**
 * The lemmas to try, in the order they must be tried in.
 *
 * The word as it was written leads. That is not a preference, it decides the
 * answer - the first rung that returns anything wins - and it is here rather
 * than inlined in each language because German is where it went wrong and
 * English is where it would have gone wrong next.
 *
 * "nein" is the case that found it. The German lexicon groups the negation
 * words, so "nein" lemmatises to "nicht" at confidence 1 - reasonable for
 * reading a sentence, wrong for looking one word up. "nicht" prefixes half a
 * METACOM collection, so a picker searching for "nein" was shown "nicht binär"
 * and "hund nicht festhalten", while the file called "nein" in the same folder
 * was never asked for. A lemma is a guess about the word; the word is not.
 *
 * English has the same shape of trap with a different lexicon behind it -
 * "left" lemmatises to "leave", and somebody typing "left" usually means the
 * direction.
 *
 * The identity form is promoted out of the guesses rather than prepended raw,
 * so a dictionary keeps the spelling it holds: German "Apfel" is looked up and
 * reported as "Apfel", not as the lowercased token it was matched by.
 */
export function orderedLadder(lower: string, lemmas: string[]): string[] {
  const tries = lemmas.slice(0, MAX_LEMMA_TRIES);
  const identity = tries.find((lemma) => lemma.toLowerCase() === lower);
  return [identity ?? lower, ...tries.filter((lemma) => lemma.toLowerCase() !== lower)];
}

/** The first rung that the collection answers for, or null if none does. */
export async function climb(
  ladder: string[], provider: SymbolProvider,
): Promise<{ lemma: string; candidates: Candidate[] } | null> {
  for (const lemma of ladder) {
    const candidates = await provider.search(lemma);
    if (candidates.length > 0) return { lemma, candidates };
  }
  return null;
}

/**
 * Every candidate a resolved text produced, best first, without the per-word
 * shape. For a search box rather than a board: vorlaut's picker asks "what
 * symbols suit this key's text" and does not care which word each came from.
 * Duplicate ids collapse, keeping the highest score they were found with.
 */
export function flattenCandidates(words: ResolvedWordOf<string>[]): Candidate[] {
  const best = new Map<string, Candidate>();
  for (const word of words) {
    for (const candidate of word.candidates) {
      const held = best.get(candidate.id);
      if (!held || candidate.score > held.score) best.set(candidate.id, candidate);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}
