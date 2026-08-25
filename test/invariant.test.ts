import { readFileSync } from 'node:fs';
import { openDB } from 'idb';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as api from '../src/index.js';
import { MetacomProvider } from '../src/metacom.js';
import { ArasaacProvider } from '../src/arasaac.js';
import { dumpDatabase, fileAt, findBytes } from './helpers.js';

/**
 * METACOM is licensed per person. The rule both consuming apps state in their
 * README — no METACOM file is shipped, downloaded, transmitted, or stored, and
 * nothing derived from the user's folder leaves the browser — is the reason this
 * code lives in one package instead of being written twice.
 *
 * These tests are that rule, executable.
 */
describe('the METACOM licensing invariant', () => {
  const metacom = new MetacomProvider();
  const fetchSpy = vi.fn(() => Promise.reject(new Error('the METACOM provider must not use the network')));

  beforeAll(async () => {
    vi.stubGlobal('fetch', fetchSpy);
    await metacom.useFileList([
      fileAt('METACOM_9/Essen/Apfel_rot-02.png'),
      fileAt('METACOM_9/Essen/Brot.png'),
      fileAt('METACOM_9/Gefuehle/fröhlich.png'),
    ]);
    // A full session: look something up, render it, resolve a stored reference.
    await metacom.search('Apfel');
    const url = await metacom.getImageUrl('METACOM_9/Essen/Apfel_rot-02.png');
    expect(url).toMatch(/^blob:/);
    await metacom.labelFor('METACOM_9/Essen/Brot.png');
  });

  it('never touches the network', () => {
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('has no network call anywhere in its source', () => {
    const source = readFileSync(new URL('../src/metacom.ts', import.meta.url), 'utf8');
    for (const call of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource']) {
      expect(source, `metacom.ts must not reference ${call}`).not.toContain(call);
    }
  });

  it('persists filenames and nothing that could be a pixel', async () => {
    const stored = await dumpDatabase();
    expect(findBytes(stored)).toEqual([]);

    // What it *did* keep: an index of paths and labels.
    const index = stored.metacomIndex as { entries: { path: string; label: string }[] }[];
    expect(index).toHaveLength(1);
    expect(index[0].entries.map((e) => e.label)).toContain('Apfel rot');
    for (const entry of index[0].entries) {
      expect(Object.keys(entry).sort()).toEqual(['label', 'path']);
    }
  });

  it('hands out symbols only as object URLs, never as bytes', async () => {
    // The interface offers no other way to obtain an image, so a caller can
    // render a licensed symbol but cannot serialise, upload or store one.
    const url = await metacom.getImageUrl('METACOM_9/Essen/Brot.png');
    expect(typeof url).toBe('string');
    expect(url).toMatch(/^blob:/);
  });

  it('does not expose the filename index in bulk', async () => {
    // A count, yes. The list, no — entries are reachable only through a search
    // scoped to a term the user typed.
    expect(metacom.symbolCount).toBe(3);
    expect(await metacom.search('')).toEqual([]);
    expect(await metacom.search('   ')).toEqual([]);
    expect((await metacom.search('Apfel')).length).toBeLessThan(metacom.symbolCount);
  });

  it('forgets everything on request', async () => {
    await metacom.forget();
    expect(metacom.isReady()).toBe(false);
    expect(metacom.symbolCount).toBe(0);
    const stored = await dumpDatabase();
    expect(stored.metacomIndex).toEqual([]);
    expect(stored.metacomHandles).toEqual([]);
  });
});

/**
 * The public surface is an allow-list. Anything added here is a deliberate
 * widening of what a consuming app can reach — which, for METACOM, is the whole
 * question. A new export should not slip in unnoticed.
 */
describe('the public API surface', () => {
  it('exports exactly what is intended', () => {
    expect(Object.keys(api).sort()).toEqual([
      'ARASAAC_ATTRIBUTIONS',
      'ArasaacProvider',
      // Every language a sentence can be read in. A closed union, so a host
      // cannot ask for one that has an ARASAAC endpoint but no lemmatiser.
      'LANGUAGES',
      'MetacomProvider',
      'PROVIDER_IDS',
      'arasaac',
      'attributionsFor',
      'clearAllProviderData',
      'foldGerman',
      'getProvider',
      'metacom',
      // A pure function over a status, deliberately added: which states are a
      // person's to act on is this package's answer, because it is the one
      // that knows what the states mean. Reaching it does not reach a symbol.
      'needsAttention',
      'scoreLabel',
      // One call rather than a walk over the providers, so a host switching
      // language cannot switch half of them.
      'setSymbolLanguage',
      'symbolLanguage',
    ].sort());
  });
});

/*
 * Which provider states are somebody's to act on.
 *
 * Two products read this status and drew the same conclusion differently: one
 * put a whole instruction in a panel heading, where it truncated, and one left
 * it as prose beside the descriptions. The answer belongs here; what a product
 * draws for a true is still its own.
 */
describe('needsAttention', () => {
  it('is true where the source was working and has stopped by itself', () => {
    // The browser withdrew the permission on a folder that is still stored.
    expect(api.needsAttention(
      { kind: 'needs-setup', code: 'permission-needed', message: '' })).toBe(true);
    expect(api.needsAttention(
      { kind: 'error', code: 'read-failed', message: '' })).toBe(true);
  });

  it('is false where nobody has set it up, and while it is still working on it', () => {
    // Not everybody has a METACOM licence, and nothing is owed by not having one.
    expect(api.needsAttention(
      { kind: 'needs-setup', code: 'no-folder', message: '' })).toBe(false);
    // A state that ends on its own is not somebody's to act on.
    expect(api.needsAttention(
      { kind: 'loading', code: 'indexing', message: '' })).toBe(false);
    expect(api.needsAttention({ kind: 'ready' })).toBe(false);
  });
});

/*
 * The database is shared, and the two programs in it are versioned apart.
 *
 * bildhaft and vorlaut are both served from lautstark.github.io - one origin,
 * one IndexedDB - and each pins its own copy of this package to an exact tag on
 * its own schedule. So the copies disagree about the schema routinely, and
 * IndexedDB does not negotiate: a pinned version lower than the stored one
 * fails the open outright, and the program that asked is locked out of its own
 * cache.
 *
 * That shipped on 2026-08-25. For about half an hour, opening one app and then
 * the other left the second one throwing a VersionError out of search(), which
 * this package's contract says must never throw. These are the tests that would
 * have caught it.
 *
 * The two run in this order on purpose and share the database between them, the
 * way the real ones share a browser: the first leaves a connection open, and the
 * second upgrades underneath it. That is the `blocking` handler's whole job, so
 * the ordering is part of what is under test rather than an accident of it.
 */
describe('a database two differently-versioned apps share', () => {
  const STORES = ['arasaacSearch', 'arasaacImages', 'metacomIndex', 'metacomHandles'];

  const answersNothing = () => vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(
    { ok: true, status: 200, json: () => Promise.resolve([]) } as unknown as Response)));

  /** Whatever a sibling on another release might have left behind. */
  async function leaveBehind(version: number, stores: string[]): Promise<void> {
    const db = await openDB('bildquelle', version, {
      upgrade(db) {
        for (const name of stores) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'key' });
        }
      },
    });
    db.close();
  }

  it('adds a store to a database older than the code reading it', async () => {
    await leaveBehind(1, ['arasaacSearch']);
    answersNothing();

    await expect(new ArasaacProvider().search('olderdatabase')).resolves.toEqual([]);

    const db = await openDB('bildquelle');
    for (const name of STORES) {
      expect(db.objectStoreNames.contains(name), `${name} should have been added`).toBe(true);
    }
    db.close();
  });

  it('opens one a newer sibling has already upgraded past it', async () => {
    // The reproduction. A pinned version would ask for 2 and be refused; this
    // asks for whatever is there. The connection the test above left open is
    // what `blocking` has to let go of for the upgrade to land at all.
    await leaveBehind(9, STORES);
    answersNothing();

    await expect(new ArasaacProvider().search('newersibling')).resolves.toEqual([]);
  });
});
