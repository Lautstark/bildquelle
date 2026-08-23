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
 */
import type { Candidate, SymbolProvider } from '../types.js';
import { tokenize, type Token } from './tokenize.js';
import { lemmatize } from './lemmatize.js';
import { findSeparableMerge } from './separable.js';
import { splitCompound } from './compound.js';
import synonymTable from './data/synonyms.js';
import stopwordTable from './data/stopwords.js';

const SYNONYMS = synonymTable;

/** The function words a telegraphic board leaves out. A host may pass its own. */
export const GERMAN_STOPWORDS: readonly string[] = stopwordTable;

/** How many lemma guesses to spend a lookup on before trying the next strategy. */
const MAX_LEMMA_TRIES = 3;

/** Which rung of the ladder answered. `override` means `prefer` did. */
export type ResolveOrigin =
  | 'override' | 'raw' | 'lemma' | 'compound' | 'synonym' | 'separable' | 'unmatched';

/** One word of the input and what the collection had to say about it. */
export interface ResolvedWord {
  /** The word as it was written, for showing back to whoever wrote it. */
  sourceToken: string;
  /** The word actually looked up, once folded, lemmatised or split. */
  concept: string;
  origin: ResolveOrigin;
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
  /** Defaults to GERMAN_STOPWORDS. Pass an empty list to keep every word. */
  stopwords?: Iterable<string>;
}

/**
 * One word against one collection, trying harder each time it comes up empty.
 *
 * The order is the point, and it is the order German punishes you in: the
 * word itself, then its lemma, then the compound it probably is, then a
 * synonym. The first rung that comes back with anything wins, so the order is
 * not a preference - it decides the answer. A word that survives all four comes back `unmatched` with no
 * candidates rather than being dropped - a board must be able to show that it
 * has nothing for a word, or the word silently disappears from a sentence
 * somebody is relying on.
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

  /*
   * The word as it was written leads the ladder. The order above says it does
   * and this is what makes it true: the loop used to walk the lemma guesses in
   * confidence order, and a dictionary entry outranks the surface form there,
   * so a table rewriting one word to another decided the search.
   *
   * "nein" is the case that found it. The lexicon groups the negation words,
   * so "nein" lemmatises to "nicht" at confidence 1 - reasonable for reading a
   * sentence, wrong for looking one word up - and the first rung that returned
   * anything won. "nicht" prefixes half a METACOM collection, so a picker
   * searching for "nein" was shown "nicht binär", "nicht gut" and "hund nicht
   * festhalten", while the file called "nein" in the same folder was never
   * asked for. A lemma is a guess about the word; the word is not.
   *
   * Promoted out of the guesses rather than prepended raw, so a noun keeps the
   * form the dictionary spells it in: "Apfel" is looked up and reported as
   * "Apfel", not as the lowercased token it was matched by. Only when no guess
   * is the word itself does the bare token lead.
   */
  const tries = guesses.slice(0, MAX_LEMMA_TRIES).map((g) => g.lemma);
  const identity = tries.find((lemma) => lemma.toLowerCase() === token.lower);
  const ladder = [identity ?? token.lower,
                  ...tries.filter((lemma) => lemma.toLowerCase() !== token.lower)];

  for (const lemma of ladder) {
    const candidates = await o.provider.search(lemma);
    if (candidates.length > 0) {
      return [{ sourceToken: token.surface, concept: lemma,
                origin: lemma === token.lower ? 'raw' : 'lemma', candidates }];
    }
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

/**
 * Every candidate the text produced, best first, without the per-word shape.
 *
 * For a search box rather than a board: vorlaut's picker asks "what symbols
 * suit this key's text" and does not care which word each came from. Duplicate
 * ids collapse, keeping the highest score they were found with.
 */
export async function suggest(raw: string, o: ResolveOptions): Promise<Candidate[]> {
  const words = await resolveText(raw, o);
  const best = new Map<string, Candidate>();
  for (const word of words) {
    for (const candidate of word.candidates) {
      const held = best.get(candidate.id);
      if (!held || candidate.score > held.score) best.set(candidate.id, candidate);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}
