import { beforeAll, describe, expect, it } from 'vitest';
import { MetacomProvider } from '../src/metacom.js';
import { metacomStore, type MetacomEntry } from '../src/storage.js';
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

describe('an index a previous version wrote', () => {
  /*
   * The index is cached so a cold start does not re-walk ~10k files, and it
   * outlives the version that wrote it. Entries used to carry a third field,
   * `terms` - the label pre-split into words - and dropping it would be a
   * cheap mistake to make: nothing versions the stored shape, so if #adopt
   * ever grew a check that an old entry failed, the index would be thrown
   * away and rebuilt. For METACOM that is not a cheap reindex. Rebuilding
   * reads the user's own folder, and a folder whose permission has lapsed
   * asks for it again - a click nobody can explain the reason for.
   *
   * So the shape has to stay loose in exactly this direction: a field that is
   * gone is carried and ignored, never rejected.
   */
  type LegacyEntry = MetacomEntry & { terms: string[] };

  const legacy: LegacyEntry[] = [
    { path: 'METACOM_9/GW/nicht.png', label: 'nicht', terms: ['nicht'] },
    { path: 'METACOM_9/GW/nicht_binär.png', label: 'nicht binär', terms: ['nicht', 'binaer'] },
    { path: 'METACOM_9/GW/Hund_nicht_festhalten.png',
      label: 'Hund nicht festhalten', terms: ['hund', 'nicht', 'festhalten'] },
  ];

  it('is adopted as it stands, not thrown away and rebuilt', async () => {
    // Structured-cloneable, like the real thing: the browser persists the
    // handle itself. No queryPermission, which reads as a standing grant.
    await metacomStore.writeHandle({ name: 'METACOM_9' });
    await metacomStore.writeIndex('METACOM_9', legacy as MetacomEntry[]);

    const metacom = new MetacomProvider();
    expect(await metacom.restore()).toBe(true);
    expect(metacom.isReady()).toBe(true);
    // Three, not zero: had the stored index been rejected, restore would have
    // fallen through to walking the folder - which this handle cannot do.
    expect(metacom.symbolCount).toBe(3);

    // And it ranks on the label alone. The dead field is carried and ignored;
    // it does not put the compounds back at 100.
    expect((await metacom.search('nicht')).map((h) => [h.score, h.label])).toEqual([
      [100, 'nicht'],
      [70, 'nicht binär'],
      [60, 'Hund nicht festhalten'],
    ]);
  });
});

describe('the negation symbol, in the collection METACOM actually ships', () => {
  /*
   * Reported from vorlaut's picker, and the half of the report that survived
   * the fix above it: typing "nicht" with METACOM chosen still buries the
   * negation symbol under nine unrelated ones.
   *
   * The collection has no file called `nicht`. Its negation symbol is
   * `nichtkein` - "nicht/kein", the German pair, written without the slash
   * because a slash cannot go in a filename - and it lives in `Kleine_Worte`,
   * the function-word category, in all four rendering folders.
   *
   * What outranked it was punctuation. `nicht_binaer` reaches the label "nicht
   * binaer", which scoreLabel reads as the query followed by more (70).
   * `nichtkein` has no separator to find, so the best it can reach is a bare
   * prefix (55) - below every spelling of "nicht binaer", and below "nichte"
   * and "nichts" on the length tie-break as well. Some of METACOM's compounds
   * are written with a separator and some are not, and the ladder was ranking
   * on that difference.
   *
   * The stems below are the real neighbourhood, named one at a time on
   * purpose: the fix puts the separator back where it is missing, and the
   * thing it must never do is put one inside a word that only happens to start
   * the same way. `nichte` is a niece.
   */
  const RENDERINGS = [
    ['JPG_mit_Rahmen', 'jpg'],
    ['JPG_ohne_Rahmen', 'jpg'],
    ['PNG_mit_Rahmen', 'png'],
    ['PNG_ohne_Rahmen', 'png'],
  ] as const;

  /** Every stem in this copy of METACOM whose filename begins "nicht". */
  const STEMS = [
    'nicht_binaer', 'nicht_binaer2', 'nicht_binaer3', 'nicht_binaer4',
    'nicht_binaer_SW', 'nicht_binaer2_SW', 'nicht_binaer3_SW', 'nicht_binaer4_SW',
    'nichtbinaer',   // the same compound run together, which vorlaut's picker names
    'nichte',        // a niece
    'nichtkauen',    // "nicht kauen"
    'nichtkein',     // "nicht/kein" - the one somebody searching "nicht" wants
    'nichtkomisch',  // "nicht komisch"
    'nichtok', 'nichtok2', 'nichtok3', 'nichtok_SW', 'nichtok_dh',
    'nichts',        // "nothing"
  ];

  const collection = (stems: string[]) =>
    RENDERINGS.flatMap(([folder, ext]) =>
      stems.map((stem) =>
        fileAt(`METACOM_Symbole/Symbole_1/${folder}/Kleine_Worte/${stem}.${ext}`)));

  const search = async (term: string) => {
    const metacom = new MetacomProvider();
    await metacom.useFileList(collection(STEMS));
    return metacom.search(term);
  };

  /**
   * The same neighbourhood in one rendering rather than four, so that every
   * stem is visible: the real collection answers "nicht" with 72 rows and
   * search() hands back 24, which is the shape of the complaint but no way to
   * assert what each stem scored.
   */
  const scores = async (term: string) => {
    const metacom = new MetacomProvider();
    await metacom.useFileList(
      STEMS.map((stem) =>
        fileAt(`METACOM_Symbole/Symbole_1/PNG_mit_Rahmen/Kleine_Worte/${stem}.png`)));
    return new Map((await metacom.search(term)).map((hit) => [hit.label, hit.score]));
  };

  it('puts the negation symbol first when somebody searches for negation', async () => {
    const hits = await search('nicht');
    expect(hits[0].label).toBe('nichtkein');
    expect(hits[0].id)
      .toBe('METACOM_Symbole/Symbole_1/JPG_mit_Rahmen/Kleine_Worte/nichtkein.jpg');
  });

  it('leaves the words that only start the same way exactly where they were', async () => {
    /*
     * Named one at a time, because this is the property the fix is dangerous
     * without. Each of these is a word in its own right that happens to begin
     * with "nicht" - a niece, "nothing", and three compounds - and each keeps
     * the bare-prefix score the ladder always gave it.
     *
     * That 55 is a contract, not an implementation detail. vorlaut reads it as
     * a grade and captions an answer whose best hit is below a whole word:
     * "this collection has no picture of its own for nicht". An earlier
     * version of this fix promoted anything with a word-sized tail, which took
     * that caption away for the one search it was written for. Only a pair of
     * negation words is rewritten now, and none of these is one.
     */
    const byLabel = await scores('nicht');

    expect(byLabel.get('nichte')).toBe(55);        // a niece, not a negation
    expect(byLabel.get('nichts')).toBe(55);        // "nothing"
    expect(byLabel.get('nichtok')).toBe(55);
    expect(byLabel.get('nichtok SW')).toBe(55);
    expect(byLabel.get('nichtok dh')).toBe(55);
    expect(byLabel.get('nichtkauen')).toBe(55);    // a compound, not a pair
    expect(byLabel.get('nichtkomisch')).toBe(55);
    // The one vorlaut's near-miss caption is written against. Separator or no
    // separator, "nicht binaer" is a different word; run together it must stay
    // below the whole-word rung, or the caption goes quiet for the search it
    // exists for.
    expect(byLabel.get('nichtbinaer')).toBe(55);

    // Only the pair moves, and only onto the rung the separated spellings
    // were already on.
    expect(byLabel.get('nichtkein')).toBe(70);
    expect(byLabel.get('nicht binaer')).toBe(70);
  });

  it('still finds the niece, and the word after her', async () => {
    // The search this must not break. "nichte" is her own word and her own
    // file, so she is an exact match and nothing outranks her.
    const niece = await search('nichte');
    expect(niece[0].label).toBe('nichte');
    expect(niece[0].score).toBe(100);

    const nothing = await search('nichts');
    expect(nothing[0].label).toBe('nichts');
    expect(nothing[0].score).toBe(100);
  });

  it('still finds what "nicht binär" found before', async () => {
    const hits = await search('nicht binär');
    expect(hits[0].label).toBe('nicht binaer');
    expect(hits[0].score).toBe(100);
    // The plain spelling, ahead of the SW ones; the negation pair is nowhere
    // near it, because this query is not asking for negation.
    expect(hits.map((h) => h.label)).not.toContain('nichtkein');
  });

  it('reorders the answer without changing who is in it', async () => {
    /*
     * The property that makes this safe to land in a package two apps share.
     * Every label the rewrite touches already began with the query, so it
     * already scored 55 and was already in the answer; putting a separator
     * into it can only move it. Asserted against the whole neighbourhood
     * rather than a sample, and with the cap lifted off by searching a
     * collection of one rendering.
     */
    expect(new Set((await scores('nicht')).keys())).toEqual(new Set([
      'nicht binaer', 'nicht binaer SW', 'nicht binaer2 SW', 'nicht binaer3 SW',
      'nicht binaer4 SW', 'nichte', 'nichtkauen', 'nichtkein', 'nichtkomisch',
      'nichtok', 'nichtok SW', 'nichtok dh', 'nichts', 'nichtbinaer',
    ]));
  });

  it('reads the pair from either side', async () => {
    // Both halves are checked, so the split is not a fact about the query. A
    // search for "kein" reaches the same symbol, which as a bare substring of
    // "nichtkein" it could only do at 25.
    const byLabel = await scores('kein');
    expect(byLabel.get('nichtkein')).toBe(60);
  });

  it('does not put a separator inside a German compound', async () => {
    /*
     * The guard that keeps the rewrite from rewriting German. "Apfelsaft" is
     * not a way of writing "Apfel" - German writes a compound together
     * precisely to say it is something else - so while the collection holds an
     * Apfel of its own, "Apfel rot" outranks it exactly as it always did.
     */
    const essen = new MetacomProvider();
    await essen.useFileList([
      fileAt('METACOM_9/Essen/Apfel.png'),
      fileAt('METACOM_9/Essen/Apfel_rot.png'),
      fileAt('METACOM_9/Essen/Apfelsaft.png'),
      fileAt('METACOM_9/Essen/Apfelbaum.png'),
    ]);
    const hits = await essen.search('Apfel');
    expect(hits.slice(0, 2).map((h) => [h.score, h.label])).toEqual([
      [100, 'Apfel'],
      [70, 'Apfel rot'],
    ]);
    // The compounds stay on the rung below, whatever order they tie in.
    expect(hits.slice(2).map((h) => h.score)).toEqual([55, 55]);
  });
});
