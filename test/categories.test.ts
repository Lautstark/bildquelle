import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ArasaacProvider } from '../src/arasaac.js';
import { MetacomProvider } from '../src/metacom.js';
import { fileAt } from './helpers.js';

/**
 * What a source says a symbol is about, beyond its label — the material a host
 * can turn into a suggested tag instead of asking somebody to type three
 * hundred of them.
 *
 * The two providers answer from completely different places, and the risk is
 * different in each. ARASAAC hands over a fixed vocabulary and a keyword type,
 * so the danger is stating a word class the numbers do not support. METACOM
 * hands over nothing at all and the folders have to be read, so the danger is
 * reporting the name of the box as though it were a category.
 */

interface Pictogram {
  _id: number;
  keywords: { keyword: string; type?: number }[];
  categories?: string[];
}

const jsonResponse = (body: Pictogram[]) =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as unknown as Response;

describe('what ARASAAC says a symbol is', () => {
  it('carries the categories through, and the word class of the keyword the label came from', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse([
      { _id: 2462, keywords: [{ keyword: 'Apfel', type: 2 }], categories: ['fruit', 'core vocabulary-feeding'] },
      { _id: 6009, keywords: [{ keyword: 'essen', type: 3 }], categories: ['feeding'] },
    ]))));

    const [apple, eat] = await new ArasaacProvider().search('facts-carried');
    expect(apple?.categories).toEqual(['fruit', 'core vocabulary-feeding']);
    expect(apple?.wordClass).toBe('noun');
    expect(eat?.wordClass).toBe('verb');
  });

  it('says nothing rather than guessing at a type it cannot read', async () => {
    /*
     * Type 4 is the one that looks like "adjective" and answers with „heute".
     * A word class stated wrongly is worse than one left out: the host has no
     * way to tell, and a board sorted by it is sorted by a mistake.
     */
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse([
      { _id: 1, keywords: [{ keyword: 'heute', type: 4 }] },
      { _id: 2, keywords: [{ keyword: 'ich', type: 1 }] },
      { _id: 3, keywords: [{ keyword: 'still' }] },
    ]))));

    const found = await new ArasaacProvider().search('facts-unreadable');
    expect(found.map((one) => one.wordClass)).toEqual([undefined, undefined, undefined]);
  });

  it('leaves an absent category absent rather than an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse([
      { _id: 9, keywords: [{ keyword: 'Sache', type: 2 }], categories: [] },
    ]))));

    const [one] = await new ArasaacProvider().search('facts-absent');
    // A host asking `categories?.length` gets the same answer either way; one
    // asking `'categories' in candidate` does not, and stored rows differ.
    expect(one).not.toHaveProperty('categories');
  });
});

describe('what METACOM’s folders say a symbol is', () => {
  const metacom = new MetacomProvider();

  beforeAll(async () => {
    await metacom.useFileList([
      fileAt('METACOM_9/PNG_mit_Text/Essen/Apfel.png'),
      fileAt('METACOM_9/PNG_ohne_Text/Essen/Apfel.png'),
      fileAt('METACOM_9/PNG_mit_Text/Gefuehle/froehlich.png'),
      fileAt('METACOM_9/PNG_ohne_Text/Gefuehle/froehlich.png'),
    ]);
  });

  it('reports the folder a symbol sits in', async () => {
    const [apple] = await metacom.search('Apfel');
    expect(apple?.categories).toEqual(['Essen']);
  });

  it('does not report the collection everything is under, nor the rendering', async () => {
    const found = await metacom.search('froehlich');
    for (const one of found) {
      // METACOM_9 is true of every file, so it sorts nothing; PNG_mit_Text says
      // which copy this is, not what it is a picture of.
      expect(one.categories).toEqual(['Gefuehle']);
    }
  });

  it('says nothing when the folders say nothing', async () => {
    const flat = new MetacomProvider();
    await flat.useFileList([fileAt('Apfel.png'), fileAt('Banane.png')]);
    const [apple] = await flat.search('Apfel');
    expect(apple).not.toHaveProperty('categories');
  });
});
