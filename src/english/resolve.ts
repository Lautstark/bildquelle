/*
 * An English sentence, turned into the words worth looking up, and each of
 * those looked up against a symbol collection.
 *
 * The sibling of german/resolve.ts, and deliberately a shorter ladder. Read
 * this before assuming it is the German one with the tables swapped:
 *
 * - No compound splitting. German writes "Apfelsaft" as one word and has to
 *   take it apart to find anything; English writes "apple juice" as two, and
 *   the tokenizer has already done the taking apart. The rung would have
 *   nothing to do.
 * - No synonym table, and this one is a gap rather than a decision. German has
 *   about 750 lines of synonyms behind its fourth rung, so a German board finds
 *   "Velo" when the collection only holds "Fahrrad". English finds nothing in
 *   that position yet. It is the first thing to add once somebody has measured
 *   where English coverage actually falls over, and the measuring should come
 *   first: a synonym list written from an armchair is a list of the words the
 *   author would have typed.
 * - A phrasal merge instead of a separable one. Same problem, opposite
 *   direction - see phrasal.ts.
 *
 * So: the word itself, then its lemma, then nothing. Honest, and better than
 * the alternative it replaces, which was asking ARASAAC's German endpoint for
 * "water" and being handed a water-transport sign.
 */
import type { Candidate } from '../types.js';
import {
  climb, flattenCandidates, orderedLadder,
  type CommonOrigin, type ResolvedWordOf, type ResolveOptions,
} from '../lang/shared.js';
import { tokenize, type Token } from './tokenize.js';
import { lemmatize } from './lemmatize.js';
import { findPhrasalMerge } from './phrasal.js';
import stopwordTable from './data/stopwords.js';

/** The function words a telegraphic board leaves out. A host may pass its own. */
export const ENGLISH_STOPWORDS: readonly string[] = stopwordTable;

export type { ResolveOptions } from '../lang/shared.js';

/** Which rung of the ladder answered. English's own set - see CommonOrigin. */
export type ResolveOrigin = CommonOrigin | 'phrasal';
export type ResolvedWord = ResolvedWordOf<ResolveOrigin>;

/**
 * One word against one collection, trying harder each time it comes up empty.
 *
 * A word that survives every rung comes back `unmatched` with no candidates
 * rather than being dropped - a board must be able to show that it has nothing
 * for a word, or the word silently disappears from a sentence somebody is
 * relying on.
 */
export async function resolveWord(
  token: Token, o: ResolveOptions,
): Promise<ResolvedWord[]> {
  const preferred = o.prefer?.(token.lower);
  if (preferred) {
    return [{ sourceToken: token.surface, concept: token.lower,
              origin: 'override', candidates: preferred }];
  }

  const guesses = lemmatize(token.lower);
  const hit = await climb(orderedLadder(token.lower, guesses.map((g) => g.lemma)), o.provider);
  if (hit) {
    return [{ sourceToken: token.surface, concept: hit.lemma,
              origin: hit.lemma === token.lower ? 'raw' : 'lemma',
              candidates: hit.candidates }];
  }

  return [{ sourceToken: token.surface, concept: guesses[0]?.lemma ?? token.lower,
            origin: 'unmatched', candidates: [] }];
}

/**
 * A whole sentence, in the order it was written.
 *
 * Stopwords get no entry at all - AAC output is telegraphic - and the particle
 * of a phrasal verb is folded into its verb rather than standing on its own:
 * "clean up your room" asks for one concept, and the "up" is not a second one.
 */
export async function resolveText(
  raw: string, o: ResolveOptions,
): Promise<ResolvedWord[]> {
  const tokens = tokenize(raw);
  const merge = findPhrasalMerge(tokens);
  const stop = new Set(o.stopwords ?? ENGLISH_STOPWORDS);

  const out: ResolvedWord[] = [];
  for (const token of tokens) {
    if (merge && token.index === merge.particleIndex) continue;

    if (merge && token.index === merge.verbIndex) {
      const preferred = o.prefer?.(merge.lemma.toLowerCase());
      if (preferred) {
        out.push({ sourceToken: merge.display, concept: merge.lemma,
                   origin: 'override', candidates: preferred });
        continue;
      }
      const candidates = await o.provider.search(merge.lemma);
      /*
       * A phrasal verb the collection has nothing for falls back to the plain
       * verb, which German does not do and does not need to. "aufräumen" is one
       * word and a collection either has it or does not; "clean up" is two, and
       * a collection with a picture for "clean" should not be made to look
       * empty because it has no separate picture for the pair.
       */
      if (candidates.length > 0) {
        out.push({ sourceToken: merge.display, concept: merge.lemma,
                   origin: 'phrasal', candidates });
        continue;
      }
      out.push(...(await resolveWord(token, o)));
      continue;
    }

    if (stop.has(token.lower)) continue;
    out.push(...(await resolveWord(token, o)));
  }
  return out;
}

/** Every candidate the text produced, best first, without the per-word shape. */
export async function suggest(raw: string, o: ResolveOptions): Promise<Candidate[]> {
  return flattenCandidates(await resolveText(raw, o));
}
