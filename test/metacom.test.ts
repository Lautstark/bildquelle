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

  it('answers the id behind a bare name, exactly or not at all', () => {
    // The reverse of what a stored reference records: vorlaut keeps
    // "metacom:Apfel_rot-02" so a board survives the collection moving, and
    // resolution has to find the file again from the stem alone.
    expect(metacom.idForName('Apfel_rot-02')).toBe('METACOM_9/Essen/Apfel_rot-02.png');
    expect(metacom.idForName('fröhlich-sein')).toBe('METACOM_9/Gefuehle/fröhlich-sein.png');
    // Not ranked, not folded, not forgiving: a near miss is a miss. The wrong
    // licensed artwork is worse than a placeholder.
    expect(metacom.idForName('Apfel_rot')).toBeNull();
    expect(metacom.idForName('apfel_rot-02')).toBeNull();
    expect(metacom.idForName('')).toBeNull();
  });

  it('answers a folder-qualified name from any root, falling back to the stem', async () => {
    // METACOM ships parallel rendering folders holding identical file names,
    // so a stem cannot say which rendering was picked. A consumer may store
    // the path under the collection root instead; matching ignores the root
    // because the folders belong to the distribution while the root only
    // names one copy of it.
    const pair = new MetacomProvider();
    await pair.useFileList([
      fileAt('METACOM_9/PNG_mit_Rahmen/ja.png'),
      fileAt('METACOM_9/PNG_ohne_Rahmen/ja.png'),
    ]);
    expect(pair.idForName('PNG_mit_Rahmen/ja')).toBe('METACOM_9/PNG_mit_Rahmen/ja.png');
    expect(pair.idForName('PNG_ohne_Rahmen/ja')).toBe('METACOM_9/PNG_ohne_Rahmen/ja.png');
    // The bare stem keeps its first-hit answer, for every document written
    // before folders could be said.
    expect(pair.idForName('ja')).toBe('METACOM_9/PNG_mit_Rahmen/ja.png');
    // A folder this copy does not have degrades to the stem - the right
    // symbol in another rendering beats a placeholder ...
    expect(pair.idForName('JPG_farbig/ja')).toBe('METACOM_9/PNG_mit_Rahmen/ja.png');
    // ... but a stem that is nowhere is still a miss.
    expect(pair.idForName('PNG_mit_Rahmen/nein')).toBeNull();
  });

  it('finds a qualified name across the index shapes the sources produce', async () => {
    // A picked directory handle indexes paths without the root; a file list
    // indexes them with it. A name written against either shape must find the
    // same picture in the other, so equality counts as a match and a miss
    // sheds its leftmost segment and tries again.
    const rootless = new MetacomProvider();
    await rootless.useFileList([
      fileAt('PNG_mit_Rahmen/ja.png'),
      fileAt('PNG_ohne_Rahmen/ja.png'),
    ]);
    // The whole indexed path, extension stripped: the equality half.
    expect(rootless.idForName('PNG_ohne_Rahmen/ja')).toBe('PNG_ohne_Rahmen/ja.png');
    // A name that carries a root this index never had: shed it, then match.
    expect(rootless.idForName('METACOM_9/PNG_ohne_Rahmen/ja')).toBe('PNG_ohne_Rahmen/ja.png');
    // Shedding stops at the most specific hit, not the first stem.
    expect(rootless.idForName('anderswo/PNG_ohne_Rahmen/ja')).toBe('PNG_ohne_Rahmen/ja.png');
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
