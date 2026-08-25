/*
 * The German half: turning what somebody wrote into the words worth looking up.
 *
 * Its own entry point rather than part of the package's main one, and that is
 * about weight: the tables behind it are about 160 KB of lemmas, base words and
 * synonyms, and a consumer that only shows symbols should not carry them. It is
 * imported as `@lautstark/bildquelle/german`.
 *
 * English is the sibling entry point, `@lautstark/bildquelle/english`, and it
 * is deliberately a separate module rather than a parameter: a host that only
 * ever reads one language should not ship the other one's tables.
 */
export { normalizeInput, splitLines } from '../lang/normalize.js';
export { tokenize, type Token } from './tokenize.js';
export { lemmatize, lookupVerbLemma, type LemmaGuess } from './lemmatize.js';
export { splitCompound } from './compound.js';
export { findSeparableMerge } from './separable.js';
export {
  resolveWord, resolveText, suggest, GERMAN_STOPWORDS,
  type ResolveOptions, type ResolveOrigin, type ResolvedWord,
} from './resolve.js';
