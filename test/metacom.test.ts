import { beforeAll, describe, expect, it } from 'vitest';
import { MetacomProvider } from '../src/metacom.js';
import { fileAt } from './helpers.js';

describe('MetacomProvider', () => {
  const metacom = new MetacomProvider();

  beforeAll(async () => {
    await metacom.useFileList([
      fileAt('METACOM_9/Essen/Apfel_rot-02.png'),
      fileAt('METACOM_9/Essen/Apfelsaft.png'),
      fileAt('METACOM_9/Gefuehle/fröhlich-sein.png'),
      fileAt('METACOM_9/liesmich.txt'), // not an image; must be ignored
    ]);
  });

  it('starts out asking to be set up', () => {
    expect(new MetacomProvider().status()).toEqual({
      kind: 'needs-setup',
      code: 'no-folder',
      message: 'Noch kein METACOM-Ordner ausgewählt.',
    });
  });

  it('indexes only image files, and reports the folder it read', () => {
    expect(metacom.isReady()).toBe(true);
    expect(metacom.symbolCount).toBe(3);
    expect(metacom.rootName).toBe('METACOM_9');
  });

  it('turns a filename into a readable label', async () => {
    // "Apfel_rot-02.png" -> "Apfel rot": separators become spaces, the variant
    // number goes. Filenames are the only metadata METACOM gives us.
    expect(await metacom.labelFor('METACOM_9/Essen/Apfel_rot-02.png')).toBe('Apfel rot');
    expect(await metacom.labelFor('METACOM_9/Gefuehle/fröhlich-sein.png')).toBe('fröhlich sein');
  });

  it('ranks the closer filename first', async () => {
    const hits = await metacom.search('Apfel');
    expect(hits.map((c) => c.label)).toEqual(['Apfel rot', 'Apfelsaft']);
    expect(hits[0].id).toBe('METACOM_9/Essen/Apfel_rot-02.png');
  });

  it('matches across umlauts, in both directions', async () => {
    expect((await metacom.search('froehlich')).map((c) => c.label)).toEqual(['fröhlich sein']);
    expect((await metacom.search('fröhlich')).map((c) => c.label)).toEqual(['fröhlich sein']);
  });

  it('gives a host something to translate, not only a sentence to print', async () => {
    // vorlaut ships in German and in English, from a table of its own, so the
    // German default here cannot be the only thing a status carries.
    const fresh = new MetacomProvider();
    const status = fresh.status();
    expect(status.kind).toBe('needs-setup');
    expect(status.kind === 'needs-setup' && status.code).toBe('no-folder');

    await fresh.useFileList([fileAt('METACOM_9/liesmich.txt')]);
    const empty = fresh.status();
    expect(empty.kind).toBe('error');
    expect(empty.kind === 'error' && empty.code).toBe('no-images');
  });

  it('returns nothing rather than throwing for an unknown word', async () => {
    expect(await metacom.search('Zeppelin')).toEqual([]);
    expect(await metacom.labelFor('METACOM_9/does/not/exist.png')).toBeNull();
    expect(await metacom.getImageUrl('METACOM_9/does/not/exist.png')).toBeNull();
  });

  it('tells subscribers when its readiness changes', async () => {
    let calls = 0;
    const unsubscribe = metacom.subscribe(() => { calls += 1; });
    await metacom.forget();
    expect(calls).toBeGreaterThan(0);
    unsubscribe();
  });
});
