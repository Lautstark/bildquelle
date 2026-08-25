import phrasalTable from './data/phrasal.js';
import { lemmatize } from './lemmatize.js';
import type { Token } from './tokenize.js';

const PHRASAL = phrasalTable;

export interface PhrasalMerge {
  /** Index of the verb token that absorbs the particle. */
  verbIndex: number;
  /** Index of the particle token, to be dropped. */
  particleIndex: number;
  /** The reassembled verb, e.g. "clean up". Two words, because English writes it so. */
  lemma: string;
  /** Display form: "clean up" when they were adjacent, "put … on" when not. */
  display: string;
}

/** How far past the verb its particle may sit: "put your shoes on" is four. */
const WINDOW = 4;

/**
 * Detects a phrasal verb: "clean up your room" and "put your shoes on" alike.
 *
 * The mirror of german/separable.ts, and it guards itself the same way. Most of
 * these particles are ordinary prepositions - "put it ON the table" - so a
 * merge only happens when the pair is in the table. That is a lookup rather
 * than a guess, for the same reason the German side refuses to merge a particle
 * onto a verb whose combined infinitive the lexicon has never heard of.
 *
 * Where the two differ is which end to search from. German puts the particle at
 * the end of the clause, so that side scans backwards from it. English keeps
 * the pair close, and usually adjacent, so this scans forward from each verb
 * and takes the first particle within reach - which finds "clean up" in
 * preference to anything further along the sentence.
 */
export function findPhrasalMerge(tokens: Token[]): PhrasalMerge | null {
  if (tokens.length < 2) return null;

  for (let v = 0; v < tokens.length - 1; v++) {
    const verb = tokens[v];
    if (verb.expanded) continue;

    const particles = new Set<string>();
    for (const { lemma } of lemmatize(verb.lower)) {
      for (const particle of PHRASAL[lemma.toLowerCase()] ?? []) particles.add(particle);
    }
    if (particles.size === 0) continue;

    const reach = Math.min(v + WINDOW, tokens.length - 1);
    for (let p = v + 1; p <= reach; p++) {
      const particle = tokens[p];
      if (particle.expanded || !particles.has(particle.lower)) continue;

      // The verb is reported in the form the table holds it in, so that
      // "cleaning up" and "cleaned up" both ask for "clean up".
      const stem = lemmatize(verb.lower)
        .find(({ lemma }) => (PHRASAL[lemma.toLowerCase()] ?? []).includes(particle.lower));
      return {
        verbIndex: v,
        particleIndex: p,
        lemma: `${(stem?.lemma ?? verb.lower).toLowerCase()} ${particle.lower}`,
        display: p === v + 1
          ? `${verb.surface} ${particle.surface}`
          : `${verb.surface} … ${particle.surface}`,
      };
    }
  }

  return null;
}
