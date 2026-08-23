/** Fold umlauts and ß, for forgiving comparison against symbol labels and filenames. */
export function foldGerman(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    // Punctuation is not part of a word, and a query carrying it matched
    // nothing at all: scoreLabel compares strings, so "hallo!" against the
    // label "hallo" is not equal, does not start with it, is not one of its
    // words and is not contained in it - 5 points, under every threshold. A
    // caller typing the text of a sentence hits this on the first full stop,
    // and the failure looks like an empty collection rather than a query that
    // needs cleaning. Folding is what this function is for: it exists so a
    // human's spelling and a filename can be compared forgivingly.
    //
    // Stripped rather than turned into spaces: "u.s.w." should fold to "usw",
    // not to three one-letter words. Interior hyphens and slashes survive,
    // because scoreLabel splits words on them and METACOM's filenames use
    // them to mean something.
    .replace(/[^\p{L}\p{N}\s\-/_]+/gu, '')
    .trim();
}

/**
 * How well a label answers a query, 5 (weak) to 100 (exact). Shared by both
 * providers so that switching sources does not reshuffle results for no reason.
 */
export function scoreLabel(query: string, label: string): number {
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  if (l === q) return 100;
  if (l.startsWith(q + ' ') || l.startsWith(q + '-')) return 70;
  if (l.startsWith(q)) return 55;
  const words = l.split(/[\s\-_/]+/);
  if (words.includes(q)) return 60;
  if (words.some((w) => w.startsWith(q))) return 40;
  if (l.includes(q)) return 25;
  return 5;
}
