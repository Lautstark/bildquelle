import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Candidate, LanguageCode } from './types.js';

/**
 * Browser-local storage for both providers, in a database this package owns.
 *
 * It is deliberately not a port the host supplies. Handing the host a place to
 * write would put the METACOM rule (see README) back in every consuming app,
 * which is the duplication this package exists to remove. Everything persisted
 * here is written by code in this repository, so "what can be stored" is a
 * question with one answer, in one file.
 *
 * The two accessors below are separate because their permissions differ:
 * `arasaacCache` may hold image bytes, `metacomStore` may not — and cannot,
 * because no method here offers it a way to.
 */

/** One indexed METACOM file: its path and words derived from the filename. Never pixels. */
export interface MetacomEntry {
  /** Path relative to the chosen root, used as the symbol id. */
  path: string;
  /** Filename without extension, cleaned up for display, and what search
   *  matches against. Folding and splitting it into words is scoreLabel's job
   *  and is done per query; a copy of the words used to live here and be
   *  scored as though each were a label of its own, which made every compound
   *  an exact match for any word in it. */
  label: string;
}

interface BildquelleDB extends DBSchema {
  /**
   * ARASAAC search results, cached so repeated lookups cost no network.
   *
   * The key carries the language: `de:apfel`, `en:apple`. It has to, because
   * the same spelling is a different question in each - ARASAAC's German
   * endpoint answers "water" with a water-transport sign, and a cache keyed
   * on the bare word would have served that to an English reader for a month.
   * Composed in one place, by `searchKey` below, rather than by each caller.
   */
  arasaacSearch: { key: string; value: { query: string; candidates: Candidate[]; ts: number } };
  /** ARASAAC image blobs, cached so a session works offline once fetched. */
  arasaacImages: { key: string; value: { id: string; blob: Blob; ts: number } };
  /**
   * METACOM filename index, so a cold start need not re-walk ~10k files. Derived
   * from the user's own licensed folder, and it stays on this machine, in this
   * browser. Note the value type: entries, never bytes.
   */
  metacomIndex: {
    key: string;
    value: { key: string; rootName: string; entries: MetacomEntry[]; ts: number };
  };
  /** A persisted FileSystemDirectoryHandle: permission to read, not any content. */
  metacomHandles: { key: string; value: { key: string; handle: unknown } };
}

const DB_NAME = 'bildquelle';

/**
 * Every store this package keeps, and the key each one is written under.
 *
 * A list rather than four calls inside an upgrade, because it is now consulted
 * twice: once to create a database that does not exist, and once to ask an
 * existing one whether it is missing anything.
 */
const STORES = [
  ['arasaacSearch', 'query'],
  ['arasaacImages', 'id'],
  ['metacomIndex', 'key'],
  ['metacomHandles', 'key'],
] as const;

let dbPromise: Promise<IDBPDatabase<BildquelleDB>> | null = null;

const create = (db: IDBPDatabase<BildquelleDB>): void => {
  for (const [name, keyPath] of STORES) {
    if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
  }
};

const lacking = (db: IDBPDatabase<BildquelleDB>): boolean =>
  STORES.some(([name]) => !db.objectStoreNames.contains(name));

/*
 * Opened without a version number, deliberately, and this is the whole of what
 * that buys.
 *
 * This database is shared. bildhaft and vorlaut are both served from
 * lautstark.github.io, which makes them one origin, which makes this one
 * database with two programs in it - and each of them pins its own copy of this
 * package to an exact tag, on its own schedule. So the two copies can disagree
 * about the version, and IndexedDB does not negotiate: asking for a version
 * lower than the stored one fails outright, and the program that asked is
 * locked out of its own cache entirely.
 *
 * That is not hypothetical. It shipped. A schema bump went out in one app on
 * 2026-08-25 and for about half an hour anybody who opened that app and then
 * the other one found the second one unable to read anything - its search()
 * threw, which this package's own contract says it must never do.
 *
 * Taking whatever is there cannot fail that way. An older copy meeting a newer
 * database finds every store it knows about and works, because the rule below
 * is that schemas only ever gain stores. A newer copy meeting an older database
 * adds what it needs, one version above whatever it found.
 *
 * The rule this rests on, and the reason RELEASING.md now says so: **changes
 * here must be additive.** Renaming a store or changing a keyPath breaks every
 * sibling that has not been redeployed yet, and no amount of care at the open
 * can soften that. Version-keying the data - `de:apfel` rather than `apfel` -
 * is how the last such change was made without touching the schema at all, and
 * is the pattern to copy.
 */
async function open(): Promise<IDBPDatabase<BildquelleDB>> {
  const found = await openDB<BildquelleDB>(DB_NAME, undefined, {
    // Fires only when there was no database at all; it arrives at version 1.
    upgrade: create,
    blocking: () => { void close(); },
    terminated: () => { dbPromise = null; },
  });

  if (!lacking(found)) return found;

  // Something we need is not here, so this is an older database than the code
  // reading it. One version above whatever it turned out to be, rather than a
  // constant, because the constant is exactly what could not be trusted.
  const version = found.version + 1;
  found.close();
  return openDB<BildquelleDB>(DB_NAME, version, {
    upgrade: create,
    blocking: () => { void close(); },
    terminated: () => { dbPromise = null; },
  });
}

/* An old tab holding an earlier version open would otherwise leave a sibling's
 * openDB pending forever, which presents to the user as symbols stuck on their
 * spinner. */
async function close(): Promise<void> {
  const held = dbPromise;
  dbPromise = null;
  try {
    (await held)?.close();
  } catch {
    // It never opened; there is nothing to hand back.
  }
}

function getDB(): Promise<IDBPDatabase<BildquelleDB>> {
  if (!dbPromise) {
    dbPromise = open().catch((err) => {
      // Let the next call try again rather than caching a rejected promise.
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/* -------------------------------------------------------------- arasaac --- */

/** ARASAAC pictograms are public CC BY-NC-SA artwork, so caching bytes is fine. */
/*
 * Rows written before the key carried a language are keyed on the bare word,
 * and nothing will ever ask for them again: every lookup now composes
 * `de:apfel`. A schema bump used to clear them, and taking the version pinning
 * out took that with it.
 *
 * They are left. The set is fixed and small - search results, never image bytes
 * - and it cannot grow, because no code path writes a bare key any more. They
 * are not even wholly dead: findLabel's second pass reads every row, and a
 * label for a pictogram id is right in any language. `clearAllProviderData()`
 * removes them along with everything else. Sweeping them would mean a scan on
 * every page load to reclaim a few kilobytes once.
 */
const searchKey = (lang: LanguageCode, query: string) => `${lang}:${query}`;

export const arasaacCache = {
  async readSearch(lang: LanguageCode, query: string) {
    return (await getDB()).get('arasaacSearch', searchKey(lang, query));
  },

  async writeSearch(
    lang: LanguageCode, query: string, candidates: Candidate[],
  ): Promise<void> {
    await (await getDB()).put(
      'arasaacSearch', { query: searchKey(lang, query), candidates, ts: Date.now() });
  },

  /**
   * Scans cached result sets for a symbol id, for references restored from
   * storage.
   *
   * The reader's own language is scanned first and everything else after, and
   * the fallback is the point: a board saved in German and opened in English
   * holds ids whose only cached label is a German one. A German word under an
   * English symbol is worse than nothing to look at and better than nothing to
   * act on - it still names the right picture. Returning null instead would
   * leave the key blank.
   */
  async findLabel(id: string, lang?: LanguageCode): Promise<string | null> {
    const db = await getDB();
    const passes = lang
      ? [IDBKeyRange.bound(`${lang}:`, `${lang}:\uffff`), undefined]
      : [undefined];
    for (const range of passes) {
      let cursor = await db.transaction('arasaacSearch').store.openCursor(range);
      while (cursor) {
        const hit = cursor.value.candidates.find((c) => c.id === id);
        if (hit) return hit.label;
        cursor = await cursor.continue();
      }
    }
    return null;
  },

  async readImage(id: string): Promise<Blob | null> {
    return (await (await getDB()).get('arasaacImages', id))?.blob ?? null;
  },

  async writeImage(id: string, blob: Blob): Promise<void> {
    await (await getDB()).put('arasaacImages', { id, blob, ts: Date.now() });
  },

  async clear(): Promise<void> {
    const db = await getDB();
    await Promise.all([db.clear('arasaacSearch'), db.clear('arasaacImages')]);
  },
};

/* -------------------------------------------------------------- metacom --- */

const INDEX_KEY = 'metacom';
const HANDLE_KEY = 'metacomDir';

/**
 * Everything the METACOM provider is permitted to persist.
 *
 * Read the list: an index of filenames, and a directory handle. There is no
 * method here that takes a Blob, an ArrayBuffer or a data URL, so no future edit
 * to the provider can cache a licensed image by accident — it would have to add
 * a store to this file first, which is a change no reviewer can miss.
 */
export const metacomStore = {
  async readIndex() {
    return (await getDB()).get('metacomIndex', INDEX_KEY);
  },

  async writeIndex(rootName: string, entries: MetacomEntry[]): Promise<void> {
    await (await getDB()).put('metacomIndex', { key: INDEX_KEY, rootName, entries, ts: Date.now() });
  },

  async readHandle(): Promise<unknown> {
    return (await (await getDB()).get('metacomHandles', HANDLE_KEY))?.handle ?? null;
  },

  async writeHandle(handle: unknown): Promise<void> {
    await (await getDB()).put('metacomHandles', { key: HANDLE_KEY, handle });
  },

  async clear(): Promise<void> {
    const db = await getDB();
    await Promise.all([
      db.delete('metacomIndex', INDEX_KEY),
      db.delete('metacomHandles', HANDLE_KEY),
    ]);
  },
};
