import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Candidate } from './types.js';

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
  /** Filename without extension, cleaned up for display. */
  label: string;
  /** Lowercased, umlaut-folded label tokens for matching. */
  terms: string[];
}

interface BildquelleDB extends DBSchema {
  /** ARASAAC search results, cached so repeated lookups cost no network. */
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
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<BildquelleDB>> | null = null;

function getDB(): Promise<IDBPDatabase<BildquelleDB>> {
  if (!dbPromise) {
    const opened = openDB<BildquelleDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('arasaacSearch', { keyPath: 'query' });
        db.createObjectStore('arasaacImages', { keyPath: 'id' });
        db.createObjectStore('metacomIndex', { keyPath: 'key' });
        db.createObjectStore('metacomHandles', { keyPath: 'key' });
      },
      /* An old tab holding version n-1 open would otherwise leave openDB pending
       * forever, which presents to the user as symbols stuck on their spinner. */
      blocking() {
        opened.then((db) => db.close()).catch(() => undefined);
        dbPromise = null;
      },
      terminated() {
        dbPromise = null;
      },
    });

    dbPromise = opened.catch((err) => {
      // Let the next call try again rather than caching a rejected promise.
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/* -------------------------------------------------------------- arasaac --- */

/** ARASAAC pictograms are public CC BY-NC-SA artwork, so caching bytes is fine. */
export const arasaacCache = {
  async readSearch(query: string) {
    return (await getDB()).get('arasaacSearch', query);
  },

  async writeSearch(query: string, candidates: Candidate[]): Promise<void> {
    await (await getDB()).put('arasaacSearch', { query, candidates, ts: Date.now() });
  },

  /** Scans cached result sets for a symbol id, for references restored from storage. */
  async findLabel(id: string): Promise<string | null> {
    const db = await getDB();
    let cursor = await db.transaction('arasaacSearch').store.openCursor();
    while (cursor) {
      const hit = cursor.value.candidates.find((c) => c.id === id);
      if (hit) return hit.label;
      cursor = await cursor.continue();
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
