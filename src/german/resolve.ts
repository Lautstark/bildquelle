/*
 * A German sentence, turned into the words worth looking up, and each of those
 * looked up against a symbol collection.
 *
 * This was bildhaft's, in its core/match.ts, and it stayed there for as long as
 * bildhaft was the only product that read sentences. vorlaut reads them too - a
 * key says "Ich habe Durst" and the collection holds "durstig" - and the
 * alternative to moving this was writing a second German lemmatiser, which is
 * how two products come to disagree about what a word means.
 *
 * What did NOT come along is the half that was bildhaft's own: building slots,
 * giving them ids, remembering which candidate somebody picked per provider.
 * That is an application's business. The seam between the two is `prefer`
 * below.
 *
 * Deliberately shallow: a lexical pipeline, not a parser. Coverage on simple
 * concrete language is the goal, and the tail is corrected by hand - which is
 * exactly what `prefer` lets a host feed back in.
 *
 * The English pipeline is english/resolve.ts. What the two must agree on is in
 * lang/shared.ts; what differs is the ladder, and it differs a lot.
 */
import type { Candidate } from '../types.js';
import {
  climb, flattenCandidates, MAX_LEMMA_TRIES, orderedLadder,
  type CommonOrigin, type ResolvedWordOf, type ResolveOptions,
} from '../lang/shared.js';
import { tokenize, type Token } from './tokenize.js';
import { lemmatize } from './lemmatize.js';
import { findSeparableMerge } from './separable.js';
import { splitCompound } from './compound.js';
import synonymTable from './data/synonyms.js';
import stopwordTable from './data/stopwords.js';

const SYNONYMS = synonymTable;

/** The function words a telegraphic board leaves out. A host may pass its own. */
export const GERMAN_STOPWORDS: readonly string[] = stopwordTable;

export type { ResolveOptions } from '../lang/shared.js';

/** Which rung of the ladder answered. German's own set - see CommonOrigin. */
export type ResolveOrigin = CommonOrigin | 'compound' | 'synonym' | 'separable';
export type ResolvedWord = ResolvedWordOf<ResolveOrigin>;

/**
 * One word against one collection, trying harder each time it comes up empty.
 *
 * The order is the point, and it is the order German punishes you in: the
 * word itself, then its lemma, then the compound it probably is, then a
 * synonym. The first rung that comes back with anything wins, so the order is
 * not a preference - it decides the answer. A word that survives all four comes
 * back `unmatched` with no candidates rather than being dropped - a board must
 * be able to show that it has nothing for a word, or the word silently
 * disappears from a sentence somebody is relying on.
 */
export async function resolveWord(
  token: Token, o: ResolveOptions,
): Promise<ResolvedWord[]> {
  const preferred = o.prefer?.(token.lower);
  if (preferred) {
    return [{ sourceToken: token.surface, concept: token.lower,
              origin: 'override', candidates: preferred }];
  }

  const guesses = lemmatize(token.lower, token.capitalized);
  const hit = await climb(orderedLadder(token.lower, guesses.map((g) => g.lemma)), o.provider);
  if (hit) {
    return [{ sourceToken: token.surface, concept: hit.lemma,
              origin: hit.lemma === token.lower ? 'raw' : 'lemma',
              candidates: hit.candidates }];
  }

  const best = guesses[0]?.lemma.toLowerCase() ?? token.lower;
  for (const form of new Set([best, token.lower])) {
    const parts = splitCompound(form);
    if (!parts) continue;
    const resolved = await Promise.all(parts.map(async (part) => ({
      part, candidates: await o.provider.search(part.word),
    })));
    // Only accept the split if it actually bought symbols: "Handtuch" split
    // into two words that match nothing is worse than one word that matches
    // nothing, because it is now two holes on the board instead of one.
    if (resolved.some((r) => r.candidates.length > 0)) {
      return resolved.map(({ part, candidates }) => ({
        sourceToken: part.word,
        concept: part.word.toLowerCase(),
        origin: candidates.length > 0 ? ('compound' as const) : ('unmatched' as const),
        candidates,
      }));
    }
  }

  for (const { lemma } of guesses.slice(0, MAX_LEMMA_TRIES)) {
    for (const synonym of SYNONYMS[lemma.toLowerCase()] ?? []) {
      const candidates = await o.provider.search(synonym);
      if (candidates.length > 0) {
        return [{ sourceToken: token.surface, concept: lemma,
                  origin: 'synonym', candidates }];
      }
    }
  }

  return [{ sourceToken: token.surface, concept: guesses[0]?.lemma ?? token.lower,
            origin: 'unmatched', candidates: [] }];
}

/**
 * A whole sentence, in the order it was written.
 *
 * Stopwords get no entry at all - AAC output is telegraphic - and the particle
 * of a separable verb is folded into its verb rather than standing on its own:
 * "räum bitte auf" is one concept, and the "auf" is not a second one.
 */
export async function resolveText(
  raw: string, o: ResolveOptions,
): Promise<ResolvedWord[]> {
  const tokens = tokenize(raw);
  const merge = findSeparableMerge(tokens);
  const stop = new Set(o.stopwords ?? GERMAN_STOPWORDS);

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
      out.push({
        sourceToken: merge.display, concept: merge.lemma,
        origin: candidates.length > 0 ? 'separable' : 'unmatched', candidates,
      });
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
