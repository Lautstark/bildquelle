import separablePrefixes from './data/separable.js';
import { lookupVerbLemma, lemmatize } from './lemmatize.js';
import type { Token } from './tokenize.js';

const PREFIXES = new Set(separablePrefixes);

export interface SeparableMerge {
  /** Index of the verb token that absorbs the particle. */
  verbIndex: number;
  /** Index of the trailing particle token, to be dropped. */
  particleIndex: number;
  /** The reassembled infinitive, e.g. "aufräumen". */
  lemma: string;
  /** Display form, e.g. "räum … auf". */
  display: string;
}

/**
 * Detects a split separable verb: "räum bitte auf" -> aufräumen.
 *
 * The disambiguation that matters is that most separable particles are also
 * ordinary prepositions ("auf dem Stuhl"). We only merge when the reassembled
 * infinitive is a word the lexicon actually knows, which rules out the
 * prepositional readings without needing a parser.
 */
export function findSeparableMerge(tokens: Token[]): SeparableMerge | null {
  if (tokens.length < 2) return null;

  // The particle sits at the end of the clause in German main clauses.
  for (let p = tokens.length - 1; p >= 1; p--) {
    const particle = tokens[p];
    if (particle.expanded || !PREFIXES.has(particle.lower)) continue;

    for (let v = 0; v < p; v++) {
      const verb = tokens[v];
      // Capitalisation marks nouns in German — but not at position 0, which is
      // exactly where the imperative lives ("Räum bitte auf", "Zieh die Schuhe an").
      if (verb.capitalized && v > 0) continue;

      for (const { lemma } of lemmatize(verb.lower)) {
        const joined = (particle.lower + lemma).toLowerCase();
        const known = lookupVerbLemma(joined);
        if (known) {
          return {
            verbIndex: v,
            particleIndex: p,
            lemma: known,
            display: `${verb.surface} … ${particle.surface}`,
          };
        }
      }
    }
    // Only the last eligible particle is considered; stop after the first.
    break;
  }

  return null;
}
