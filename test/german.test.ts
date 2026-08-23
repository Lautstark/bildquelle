import { describe, expect, it } from 'vitest';
import {
  resolveText, resolveWord, suggest, tokenize, lemmatize, splitCompound,
  GERMAN_STOPWORDS,
} from '../src/german/index.js';
import { foldGerman, scoreLabel } from '../src/text.js';
import type { Candidate, SymbolProvider } from '../src/types.js';

/** A collection that holds exactly the words it is given, and nothing else. */
function collection(words: string[]): SymbolProvider {
  const held = new Set(words.map((w) => w.toLowerCase()));
  return {
    id: 'arasaac',
    search: async (q: string): Promise<Candidate[]> =>
      held.has(q.toLowerCase()) ? [{ id: `sym:${q.toLowerCase()}`, label: q, score: 100 }] : [],
  } as unknown as SymbolProvider;
}

describe('the German pipeline, moved here from bildhaft', () => {
  it('finds a lemma the collection holds behind an inflected word', async () => {
    const [word] = await resolveText('Äpfel', { provider: collection(['apfel']) });
    expect(word!.origin).toBe('lemma');
    expect(word!.candidates).toHaveLength(1);
  });

  it('folds a separable verb back together instead of making two words of it', async () => {
    const words = await resolveText('Räum bitte auf', { provider: collection(['aufräumen']) });
    const verb = words.find((w) => w.origin === 'separable');
    expect(verb?.concept).toBe('aufräumen');
    // The particle is not a word of its own.
    expect(words.some((w) => w.sourceToken.toLowerCase() === 'auf')).toBe(false);
  });

  it('splits a compound only when the split actually buys symbols', async () => {
    // Both halves have to be base words the table knows - the splitter is a
    // lookup, not a guess, which is why "Handtuch" stays whole and "Fußball"
    // does not.
    const bought = await resolveText('Fußball', { provider: collection(['fuß', 'ball']) });
    expect(bought.map((w) => w.concept)).toEqual(['fuß', 'ball']);

    // Nothing on the other side, so it stays one unmatched word rather than
    // becoming two holes on a board.
    const not = await resolveText('Fußball', { provider: collection([]) });
    expect(not).toHaveLength(1);
    expect(not[0]!.origin).toBe('unmatched');
  });

  it('looks a word up before the lemma the lexicon groups it under', async () => {
    /*
     * The seed groups the negation words, so "nein" lemmatises to "nicht" at
     * confidence 1 - fine for reading a sentence, wrong for looking one word
     * up. The ladder takes the first rung that answers, so the confident lemma
     * used to decide the search and the word somebody typed was never asked
     * for. A collection holding both has to answer with "nein".
     */
    expect(lemmatize('nein', false)[0]!.lemma).toBe('nicht');

    const [word] = await resolveText('nein', {
      provider: collection(['nein', 'nicht']), stopwords: [],
    });
    expect(word!.concept).toBe('nein');
    expect(word!.origin).toBe('raw');
  });

  it('shows the word, not everything the lemma prefixes', async () => {
    /*
     * The same failure with a collection that ranks rather than matching
     * exactly, which is what a real one does and what made this visible: a
     * METACOM folder holds one "nein" and a great many files starting "nicht",
     * and the picker filled with "nicht binär" and "hund nicht festhalten".
     * An exact match scores 100 and a prefix 70, so the ranking was never the
     * problem - "nein" was simply never looked up.
     */
    const files = ['nein', 'nicht binär', 'nicht gut', 'hund nicht festhalten'];
    const ranking = {
      id: 'metacom',
      search: async (q: string): Promise<Candidate[]> => files
        .map((label) => ({ id: label, label, score: scoreLabel(foldGerman(q), foldGerman(label)) }))
        .filter((c) => c.score >= 25)
        .sort((a, b) => b.score - a.score),
    } as unknown as SymbolProvider;

    const hits = await suggest('nein', { provider: ranking, stopwords: [] });
    expect(hits[0]!.label).toBe('nein');
  });

  it('reaches for a synonym once the lemma has come up empty', async () => {
    const [word] = await resolveText('Fahrrad', { provider: collection(['rad']) });
    expect(word!.origin).toBe('synonym');
  });

  it('never drops a word it cannot match', async () => {
    const words = await resolveText('Xylophonquatsch', { provider: collection([]) });
    expect(words).toHaveLength(1);
    expect(words[0]!.candidates).toEqual([]);
  });

  it('leaves function words out, and keeps the ones AAC needs', async () => {
    const words = await resolveText('Ich will das Brot', { provider: collection(['ich', 'wollen', 'brot']) });
    // "das" is furniture; "ich" is a symbol somebody points at.
    expect(words.map((w) => w.sourceToken)).not.toContain('das');
    expect(words.map((w) => w.sourceToken)).toContain('Ich');
    expect(GERMAN_STOPWORDS).toContain('das');
    expect(GERMAN_STOPWORDS).not.toContain('ich');
  });

  it('lets a host answer first, which is what a personal dictionary is', async () => {
    const mine: Candidate[] = [{ id: 'mine', label: 'my own', score: 1000 }];
    const words = await resolveText('Apfel', {
      provider: collection(['apfel']),
      prefer: (key) => (key === 'apfel' ? mine : null),
    });
    expect(words[0]!.origin).toBe('override');
    expect(words[0]!.candidates[0]!.id).toBe('mine');
  });

  it('suggest() flattens a sentence to one ranked list, best score per symbol', async () => {
    const hits = await suggest('Ich will Brot', { provider: collection(['ich', 'brot']) });
    expect(hits.map((c) => c.id)).toEqual(expect.arrayContaining(['sym:ich', 'sym:brot']));
    expect(new Set(hits.map((c) => c.id)).size).toBe(hits.length);
  });

  it('still answers when the query arrives with punctuation', async () => {
    // The other half of the fix in 1.3.1: the tokenizer drops it before the
    // provider is ever asked, so both halves of this now hold.
    const words = await resolveText('Brot!', { provider: collection(['brot']) });
    expect(words[0]!.candidates).toHaveLength(1);
  });

  it('exposes the primitives, so a host can do its own thing with them', () => {
    expect(tokenize('Ein Haus').map((t) => t.lower)).toEqual(['ein', 'haus']);
    // A noun's lemma keeps its capital, because German writes it that way and
    // the collection's labels do too.
    expect(lemmatize('äpfel').map((g) => g.lemma)).toContain('Apfel');
    expect(splitCompound('fußball')).not.toBeNull();
  });
});

describe('resolveWord', () => {
  it('takes one token, for a host that did its own tokenising', async () => {
    const [token] = tokenize('Apfel');
    const out = await resolveWord(token!, { provider: collection(['apfel']) });
    expect(out[0]!.concept).toBe('Apfel');
  });
});
