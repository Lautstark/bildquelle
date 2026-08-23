/** Punctuation that never carries meaning for us. Keeps letters, digits, hyphens. */
const PUNCT = /[.,!?;:„“”"'`´()\[\]{}…»«–—*_/\\]/g;

/**
 * The lookup key for sentence reuse: lowercased, trimmed, punctuation-stripped,
 * whitespace-collapsed. Two sentences that differ only in punctuation or casing
 * are the same line as far as "you've translated this before" is concerned.
 */
export function normalizeInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(PUNCT, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * One entry, several rows. A row is one printed strip and a strip is one
 * sentence, so each line the user typed becomes its own row rather than being
 * folded into a single very long strip.
 */
export function splitLines(raw: string): string[] {
  return raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}
