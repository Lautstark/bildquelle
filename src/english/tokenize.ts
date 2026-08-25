/*
 * Contractions, expanded so that the word carrying the meaning keeps its slot.
 *
 * The same trick as the German tokenizer, for a different reason. German
 * expands "im" to "in dem" so the preposition survives and the article is
 * dropped by the ordinary stopword rule. English expands "don't" to "do not"
 * so the negation survives - "not" is emphatically not a stopword - and the
 * auxiliary is dropped by the same rule.
 *
 * Every expansion below lands on either a stopword or a real concept. That is
 * the constraint on adding to it: expanding to a word that is neither leaves a
 * hole on the board where the contraction used to be, which is worse than
 * having left the contraction alone.
 */

/** Written forms that expand to something other than their parts. */
const CONTRACTIONS: Record<string, string[]> = {
  "won't": ['will', 'not'],
  "can't": ['can', 'not'],
  cannot: ['can', 'not'],
  "shan't": ['shall', 'not'],
  "ain't": ['be', 'not'],
  "let's": ['let', 'us'],
  "i'm": ['i', 'am'],
};

/*
 * The regular endings. Unambiguous, all of them, which is why they can be a
 * rule while "'s" cannot: "he's" is "he is" and "dad's" is a possessive, and
 * no suffix rule tells those apart. The closed list below does.
 */
const SUFFIXES: [string, string][] = [
  ["n't", 'not'],
  ["'ll", 'will'],
  ["'ve", 'have'],
  ["'re", 'are'],
  ["'d", 'would'],
];

/** The only words where a trailing "'s" is a verb rather than a possessive. */
const IS_CONTRACTIONS = new Set([
  'he', 'she', 'it', 'that', 'there', 'here', 'what', 'who', 'where', 'how',
]);

/** Splits on anything that is not a letter, digit or intra-word hyphen/apostrophe. */
const WORD_RE = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;

export interface Token {
  /** Surface form with original casing. */
  surface: string;
  /** Lowercased form used for lookup. */
  lower: string;
  /**
   * True if the token was capitalised in the input.
   *
   * Carried so that a Token is the same shape in both languages, and read by
   * almost nothing here: English capitalises the first word of a sentence and
   * its proper nouns, which is not the noun signal German capitalisation is.
   */
  capitalized: boolean;
  index: number;
  /** True when this token came out of a contraction, e.g. "don't" -> do + not. */
  expanded: boolean;
}

/** Curly apostrophes are what a phone types; they must not miss the tables. */
const straighten = (word: string) => word.replace(/’/g, "'");

function expand(lower: string): string[] | null {
  const direct = CONTRACTIONS[lower];
  if (direct) return direct;

  for (const [suffix, word] of SUFFIXES) {
    if (!lower.endsWith(suffix)) continue;
    const base = lower.slice(0, -suffix.length);
    if (base.length >= 1) return [base, word];
  }

  if (lower.endsWith("'s")) {
    const base = lower.slice(0, -2);
    if (IS_CONTRACTIONS.has(base)) return [base, 'is'];
  }

  return null;
}

export function tokenize(raw: string): Token[] {
  const words = raw.match(WORD_RE) ?? [];
  const out: Omit<Token, 'index'>[] = [];

  for (const word of words) {
    const parts = expand(straighten(word).toLowerCase());
    if (parts) {
      for (const part of parts) {
        out.push({ surface: part, lower: part, capitalized: false, expanded: true });
      }
    } else {
      out.push({
        surface: word,
        lower: straighten(word).toLowerCase(),
        capitalized: /^\p{Lu}/u.test(word),
        expanded: false,
      });
    }
  }

  return out.map((t, index) => ({ ...t, index }));
}
