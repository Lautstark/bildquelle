/*
 * The English half: turning what somebody wrote into the words worth looking up.
 *
 * Its own entry point, `@lautstark/bildquelle/english`, for the same reason
 * German has one: a consumer that only shows symbols should carry neither
 * language's tables, and a consumer that reads one language should not carry
 * the other's. Hosts that offer a choice import whichever is asked for, at the
 * moment it is asked for.
 *
 * Smaller than its German sibling by a long way - about 200 lines of tables
 * against 8,000 - and english/resolve.ts says which rungs are missing and
 * which of those are missing on purpose.
 */
export { normalizeInput, splitLines } from '../lang/normalize.js';
export { tokenize, type Token } from './tokenize.js';
export { lemmatize, type LemmaGuess } from './lemmatize.js';
export { findPhrasalMerge, type PhrasalMerge } from './phrasal.js';
export {
  resolveWord, resolveText, suggest, ENGLISH_STOPWORDS,
  type ResolveOptions, type ResolveOrigin, type ResolvedWord,
} from './resolve.js';
