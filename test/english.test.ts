import { describe, expect, it } from 'vitest';
import {
  resolveText, suggest, tokenize, lemmatize, findPhrasalMerge, ENGLISH_STOPWORDS,
} from '../src/english/index.js';
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

describe('the English pipeline', () => {
  it('finds a lemma the collection holds behind an inflected word', async () => {
    const [word] = await resolveText('apples', { provider: collection(['apple']) });
    expect(word!.origin).toBe('lemma');
    expect(word!.concept).toBe('apple');
  });

  it('undoes the doubled consonant before a suffix', async () => {
    const [word] = await resolveText('running', { provider: collection(['run']) });
    expect(word!.concept).toBe('run');
  });

  it('knows the irregulars a day is made of', async () => {
    expect(lemmatize('children')[0]!.lemma).toBe('child');
    expect(lemmatize('teeth')[0]!.lemma).toBe('tooth');
    expect(lemmatize('ate')[0]!.lemma).toBe('eat');
  });

  it('looks a word up before the lemma the table groups it under', async () => {
    /*
     * The English half of the "nein" case that lang/shared.ts documents. "left"
     * is the past of "leave" and is also the direction, and the direction is
     * what somebody typing it into a picker means. The ladder takes the first
     * rung that answers, so a collection holding both has to answer "left".
     */
    expect(lemmatize('left')[0]!.lemma).toBe('leave');

    const [word] = await resolveText('left', {
      provider: collection(['left', 'leave']), stopwords: [],
    });
    expect(word!.concept).toBe('left');
    expect(word!.origin).toBe('raw');
  });

  it('folds a phrasal verb together instead of making two words of it', async () => {
    const words = await resolveText('clean up your room', {
      provider: collection(['clean up', 'room']),
    });
    const verb = words.find((w) => w.origin === 'phrasal');
    expect(verb?.concept).toBe('clean up');
    // The particle is not a word of its own.
    expect(words.some((w) => w.sourceToken.toLowerCase() === 'up')).toBe(false);
  });

  it('folds one that the object was written inside of', async () => {
    const merge = findPhrasalMerge(tokenize('put your shoes on'));
    expect(merge?.lemma).toBe('put on');
    expect(merge?.display).toBe('put … on');
  });

  it('reports a phrasal verb under the form the table holds', async () => {
    const words = await resolveText('cleaning up', { provider: collection(['clean up']) });
    expect(words[0]!.concept).toBe('clean up');
  });

  it('falls back to the plain verb when the collection has no pair', async () => {
    // A collection with a picture for "clean" should not look empty just
    // because it has no separate picture for "clean up".
    const words = await resolveText('clean up', { provider: collection(['clean']) });
    expect(words.map((w) => w.concept)).toEqual(['clean']);
    expect(words[0]!.origin).toBe('raw');
  });

  it('keeps the negation out of a contraction and drops the auxiliary', async () => {
    const words = await resolveText("I don't want it", {
      provider: collection(['i', 'not', 'want', 'it']),
    });
    const concepts = words.map((w) => w.concept);
    expect(concepts).toContain('not');
    expect(concepts).toContain('want');
    // "do" is a stopword; the negation it was carrying is not.
    expect(concepts).not.toContain('do');
  });

  it('keeps both halves of a modal contraction', async () => {
    // "can" is modality, not an auxiliary to be thrown away: "I can" is a
    // sentence somebody means.
    const words = await resolveText("I can't sleep", {
      provider: collection(['i', 'can', 'not', 'sleep']),
    });
    expect(words.map((w) => w.concept)).toEqual(['i', 'can', 'not', 'sleep']);
  });

  it('reads the apostrophe a phone types', async () => {
    expect(tokenize('don’t').map((t) => t.lower)).toEqual(['do', 'not']);
  });

  it('takes the possessive off the thing owned', async () => {
    const [word] = await resolveText("dad's", { provider: collection(['dad']) });
    expect(word!.concept).toBe('dad');
  });

  it('keeps the words a board is actually made of', () => {
    const stop = new Set(ENGLISH_STOPWORDS);
    // Pronouns, prepositions and negation are the most-pressed keys there are.
    for (const word of ['i', 'you', 'me', 'my', 'we', 'in', 'on', 'under',
                        'to', 'not', 'no', 'can', 'must', 'want', 'more']) {
      expect(stop.has(word), `${word} must not be a stopword`).toBe(false);
    }
    for (const word of ['the', 'a', 'is', 'are', 'was', 'will']) {
      expect(stop.has(word), `${word} should be a stopword`).toBe(true);
    }
  });

  it('says it has nothing rather than dropping the word', async () => {
    const words = await resolveText('xylophone', { provider: collection([]) });
    expect(words).toHaveLength(1);
    expect(words[0]!.origin).toBe('unmatched');
    expect(words[0]!.candidates).toEqual([]);
  });

  it('flattens a sentence into one ranked list for a picker', async () => {
    const hits = await suggest('I want an apple', {
      provider: collection(['i', 'want', 'apple']),
    });
    expect(hits.map((c) => c.id)).toEqual(['sym:i', 'sym:want', 'sym:apple']);
  });
});
