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

describe('adopting a different folder', () => {
  /*
   * Picking a new folder replaces the index, and the pictures behind the old
   * one are gone with it. Object URLs are keyed by the path they were made
   * from, so any that survive keep answering with the previous folder's
   * artwork — for METACOM that means a symbol whose file is no longer there
   * still shows, which is exactly the case a licensed source must not have.
   */
  it('does not serve the previous folder’s image after a new one is picked', async () => {
    const metacom = new MetacomProvider();
    await metacom.useFileList([fileAt('Rendering_A/ja.png', 'first-folder')]);

    const before = await metacom.getImageUrl('Rendering_A/ja.png');
    expect(before).toMatch(/^blob:/);

    // The same word, a different rendering, under a different path.
    await metacom.useFileList([fileAt('Rendering_B/ja.png', 'second-folder')]);

    // The old path is not in the new index and must not resolve at all.
    expect(await metacom.getImageUrl('Rendering_A/ja.png')).toBeNull();
    // And the URL handed out earlier must have been revoked with it.
    await expect(fetch(before!)).rejects.toThrow();
  });
});

describe('parallel renderings', () => {
  /*
   * METACOM ships the same symbols several times over: with and without a
   * frame, with and without the word printed on the picture. The folders sit
   * side by side and hold identical file names, so every rendering of a word
   * scores identically and the one that wins a search is whichever the index
   * happened to list first. Which is to say: arbitrary, and mixed.
   */
  const metacom = new MetacomProvider();

  beforeAll(async () => {
    await metacom.useFileList([
      fileAt('METACOM_9/PNG_mit_Text/Essen/Apfel.png'),
      fileAt('METACOM_9/PNG_mit_Text/Essen/Banane.png'),
      fileAt('METACOM_9/PNG_ohne_Text/Essen/Apfel.png'),
      fileAt('METACOM_9/PNG_ohne_Text/Essen/Banane.png'),
      // Only in one rendering. Must stay findable whatever is preferred.
      fileAt('METACOM_9/PNG_mit_Text/Essen/Kiwi.png'),
    ]);
  });

  it('names the folders that tell identical file names apart', () => {
    // Not "Essen" and not "METACOM_9": those are common to every copy of a
    // name, so they say nothing about which rendering you are looking at.
    expect(metacom.renderings()).toEqual([
      { segment: 'PNG_mit_Text', count: 2 },
      { segment: 'PNG_ohne_Text', count: 2 },
    ]);
  });

  it('puts the preferred rendering first without hiding the others', async () => {
    metacom.preferRendering('PNG_ohne_Text');
    const hits = await metacom.search('Apfel');
    expect(hits[0].id).toBe('METACOM_9/PNG_ohne_Text/Essen/Apfel.png');
    expect(hits.map((h) => h.id)).toContain('METACOM_9/PNG_mit_Text/Essen/Apfel.png');

    metacom.preferRendering('PNG_mit_Text');
    expect((await metacom.search('Apfel'))[0].id)
      .toBe('METACOM_9/PNG_mit_Text/Essen/Apfel.png');

    metacom.preferRendering(null);
  });

  it('never lets a preference outrank a better match', async () => {
    metacom.preferRendering('PNG_ohne_Text');
    // Kiwi exists only in the other rendering. A preference orders equals; it
    // must not push a worse match above the word actually asked for.
    expect((await metacom.search('Kiwi'))[0].id)
      .toBe('METACOM_9/PNG_mit_Text/Essen/Kiwi.png');
    metacom.preferRendering(null);
  });
});

describe('a word that other words are built out of', () => {
  /*
   * Reported from vorlaut's picker: typing "nicht" with METACOM chosen fills
   * the grid with "nicht binär", "nicht mögen" and "Hund nicht festhalten",
   * and the plain word is nowhere to be seen.
   *
   * The ladder in scoreLabel is not what let that happen - on the ladder the
   * exact word is 100 and "nicht binär" is 70, and the sort is score first, so
   * a compound cannot climb over the word it is built out of. What let it
   * happen is that search() did not put the compounds on that ladder.
   *
   * makeEntry splits a label into `terms` - "nicht binär" becomes ["nicht",
   * "binaer"] - and search() scored each of those with scoreLabel, which
   * answers the question "how well does this LABEL answer the query". Handed a
   * single word it can only say 100, because the word is the whole of what it
   * was given. So every label with "nicht" anywhere among its words came back
   * exact, and the answer to "nicht" was two dozen rows all scoring 100 with
   * nothing to choose between them but the length tie-break that exists to
   * order parallel renderings.
   *
   * Two things follow from that, and this file is here to hold both. A word
   * that is one of a label's words is a 60, not a 100 - the label ladder
   * already says so, and already computes it. And a collection that has no
   * exact match must be able to say so: once the compounds stop claiming to be
   * exact, the top score is the difference between "here is your word" and
   * "here is the nearest thing I have".
   */
  const rendered = (names: string[]) =>
    ['PNG_mit_Rahmen', 'PNG_ohne_Rahmen'].flatMap((rendering) =>
      names.map((name) => fileAt(`METACOM_9/Grundwortschatz/${rendering}/${name}.png`)));

  const COMPOUNDS = ['nicht_binär', 'nicht_mögen', 'Hund_nicht_festhalten', 'nichts'];

  it('scores a compound as the compound it is, not as the word inside it', async () => {
    const metacom = new MetacomProvider();
    await metacom.useFileList(rendered(['nicht', ...COMPOUNDS]));

    const byLabel = new Map(
      (await metacom.search('nicht')).map((hit) => [hit.label, hit.score]));

    expect(byLabel.get('nicht')).toBe(100);          // the word itself
    expect(byLabel.get('nicht binär')).toBe(70);     // the word, then more
    expect(byLabel.get('nicht mögen')).toBe(70);
    expect(byLabel.get('Hund nicht festhalten')).toBe(60); // one of its words
    expect(byLabel.get('nichts')).toBe(55);          // a word that starts the same
  });

  it('gives the word asked for the whole of the top score, in every rendering', async () => {
    const metacom = new MetacomProvider();
    await metacom.useFileList(rendered(['nicht', ...COMPOUNDS]));

    const hits = await metacom.search('nicht');
    // Both renderings of the plain word, and nothing else, are exact. The
    // compounds used to sit here too, kept below it only by label length.
    expect(hits.filter((h) => h.score === 100).map((h) => h.id)).toEqual([
      'METACOM_9/Grundwortschatz/PNG_mit_Rahmen/nicht.png',
      'METACOM_9/Grundwortschatz/PNG_ohne_Rahmen/nicht.png',
    ]);
  });

  it('has a top score left to tell an exact hit from the nearest thing it has', async () => {
    /*
     * The other half of the report, and the one ranking cannot fix: a copy of
     * METACOM that files its negation under "nein" and uses "nicht" only as a
     * prefix has no plain "nicht" to rank at all. The search still answers - a
     * near miss beats an empty grid - and this is what the inflation cost. When
     * everything came back 100 the two collections below were indistinguishable
     * from the outside, and a picker had no way to caption the difference.
     *
     * What this does NOT do is hand vorlaut the signal. Candidate.score is
     * documented as meaningful only for ordering within one provider, and
     * ARASAAC's numbers carry a bonus and a rank penalty, so nothing outside
     * this file may read 100 as "exact". This asserts that METACOM's own ladder
     * still has the distinction in it - which is the thing that has to be true
     * before any of it can be offered.
     */
    const metacom = new MetacomProvider();
    await metacom.useFileList(rendered(['nein', ...COMPOUNDS]));

    const hits = await metacom.search('nicht');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.score < 100)).toBe(true);
    expect(hits[0].score).toBe(70);

    // And when it does hold the word, the same question answers the other way.
    const held = new MetacomProvider();
    await held.useFileList(rendered(['nicht', ...COMPOUNDS]));
    expect((await held.search('nicht'))[0].score).toBe(100);
  });

  it('keeps the same rows: a compound scores lower, it does not drop out', async () => {
    /*
     * The property that makes this safe to land in a package two apps share.
     * Every entry a term could reach, the label reaches too: a term equal to
     * the query is one of the label's words (60), a term starting with it is a
     * word starting with it (40), a term containing it means the label
     * contains it (25). All three clear the threshold, so scoring the label
     * alone re-ranks the answer without changing who is in it.
     */
    const metacom = new MetacomProvider();
    await metacom.useFileList(rendered(['nicht', ...COMPOUNDS, 'vernichten', 'Apfel']));

    const labels = (await metacom.search('nicht')).map((h) => h.label);
    expect(new Set(labels)).toEqual(new Set([
      'nicht', 'nicht binär', 'nicht mögen', 'Hund nicht festhalten', 'nichts',
      'vernichten', // a bare substring, admitted at 25 and ranked last
    ]));
    expect(labels.at(-1)).toBe('vernichten');
  });
});
