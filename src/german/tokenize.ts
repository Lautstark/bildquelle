/**
 * Preposition+article contractions. Expanding these means the preposition keeps
 * its slot (spatial concepts matter a lot in AAC) while the article is dropped
 * by the normal stopword rule.
 */
const CONTRACTIONS: Record<string, string[]> = {
  am: ['an', 'dem'], im: ['in', 'dem'], zum: ['zu', 'dem'], zur: ['zu', 'der'],
  beim: ['bei', 'dem'], vom: ['von', 'dem'], ins: ['in', 'das'], ans: ['an', 'das'],
  aufs: ['auf', 'das'], durchs: ['durch', 'das'], fürs: ['für', 'das'], ums: ['um', 'das'],
  hinterm: ['hinter', 'dem'], überm: ['über', 'dem'], unterm: ['unter', 'dem'],
  vorm: ['vor', 'dem'], hinters: ['hinter', 'das'], übers: ['über', 'das'],
  unters: ['unter', 'das'], vors: ['vor', 'das'], aufm: ['auf', 'dem'],
};

/** Splits on anything that is not a letter, digit or intra-word hyphen/apostrophe. */
const WORD_RE = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;

export interface Token {
  /** Surface form with original casing — capitalisation is a noun signal in German. */
  surface: string;
  /** Lowercased form used for lookup. */
  lower: string;
  /** True if the token was capitalised in the input. */
  capitalized: boolean;
  index: number;
  /** True when this token came out of a contraction, e.g. "im" -> in + dem. */
  expanded: boolean;
}

export function tokenize(raw: string): Token[] {
  const words = raw.match(WORD_RE) ?? [];
  const out: Omit<Token, 'index'>[] = [];

  for (const word of words) {
    const parts = CONTRACTIONS[word.toLowerCase()];
    if (parts) {
      for (const part of parts) {
        out.push({ surface: part, lower: part, capitalized: false, expanded: true });
      }
    } else {
      out.push({
        surface: word,
        lower: word.toLowerCase(),
        capitalized: /^\p{Lu}/u.test(word),
        expanded: false,
      });
    }
  }

  return out.map((t, index) => ({ ...t, index }));
}
