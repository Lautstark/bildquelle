import basewordTable from './data/basewords.js';

const BASEWORDS = basewordTable as Record<string, string>;

/** Fugenelemente — the linking morphemes German glues compounds together with. */
const LINKERS = ['', 's', 'es', 'n', 'en', 'er', 'e'];

const MIN_PART = 3;
const MAX_PARTS = 3;

export interface CompoundPart {
  /** Display form of the part, e.g. "Apfel". */
  word: string;
  /** The slice of the original compound this part covers. */
  raw: string;
}

interface Split {
  parts: CompoundPart[];
  /** Lower is better: prefers fewer, longer parts. */
  cost: number;
}

function search(word: string, depth: number): Split | null {
  if (word.length === 0) return { parts: [], cost: 0 };
  if (depth >= MAX_PARTS) return null;

  let best: Split | null = null;

  // Longest-first so "Apfelsaft" prefers Apfel+Saft over shorter accidental prefixes.
  for (let len = word.length; len >= MIN_PART; len--) {
    const head = word.slice(0, len);
    const display = BASEWORDS[head];
    if (!display) continue;

    for (const linker of LINKERS) {
      const rest = word.slice(len);
      if (linker && !rest.startsWith(linker)) continue;
      const tail = rest.slice(linker.length);

      // A trailing fragment shorter than MIN_PART is not a word; reject the split.
      if (tail.length > 0 && tail.length < MIN_PART) continue;

      const sub = search(tail, depth + 1);
      if (!sub) continue;

      const part: CompoundPart = { word: display, raw: head };
      const cost = sub.cost + 1 + linker.length * 0.1;
      if (!best || cost < best.cost) best = { parts: [part, ...sub.parts], cost };
      break; // shortest viable linker for this head length is enough
    }
  }

  return best;
}

/**
 * Splits a German compound into known base words: Apfelsaft -> Apfel + Saft,
 * Zahnbürste -> Zahn + Bürste, Spielplatz -> Spiel + Platz.
 *
 * Returns null when the word is not a compound of known parts — including the
 * degenerate "split" into a single word, which is not a split at all.
 */
export function splitCompound(lower: string): CompoundPart[] | null {
  if (lower.length < MIN_PART * 2) return null;
  const result = search(lower, 0);
  if (!result || result.parts.length < 2) return null;
  return result.parts;
}
