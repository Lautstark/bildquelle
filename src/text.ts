/** Fold umlauts and ß, for forgiving comparison against symbol labels and filenames. */
export function foldGerman(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
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
