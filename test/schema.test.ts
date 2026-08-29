import { openDB } from 'idb';
import { describe, expect, it, vi } from 'vitest';
import { metacomStore } from '../src/storage.js';

/**
 * The rule the versionless open rests on: **schema changes here are additive.**
 *
 * `src/storage.ts` opens this database without a version number, and that is a
 * decision rather than an oversight — bildhaft and vorlaut are one origin, so
 * there is one `bildquelle` database with two programs in it, each pinning its
 * own tag on its own schedule. A pinned version lower than the stored one fails
 * the open outright, which shipped on 2026-08-25 and locked one app out of its
 * own cache for half an hour. Taking whatever is there cannot fail that way.
 *
 * What it costs is that the open can no longer *fix* anything. It finds the
 * stores it knows about and works, which is only safe while every change is one
 * an older sibling can survive. RELEASING.md states that rule twice and
 * `invariant.test.ts` covers the two version directions — but nothing until now
 * held the rule itself, and it is the half that fails silently: renaming a store
 * or changing a `keyPath` breaks every sibling that has not been redeployed, and
 * no test in this repository would have gone red, because this repository's own
 * copy agrees with itself.
 *
 * These two are that rule, executable, from both sides. They run in this order
 * and share the database, the way the real ones share a browser.
 */
describe('the schema only ever gains stores', () => {
  const OURS = ['arasaacImages', 'arasaacSearch', 'metacomHandles', 'metacomIndex'];

  /*
   * The first side: what a fresh database comes out as.
   *
   * Written out here rather than imported from `STORES` in storage.ts, which
   * would only assert that the file agrees with itself. The point of a
   * hard-coded list is that editing storage.ts is not enough to make it pass —
   * a rename or a changed keyPath goes red here, and the fix is to read
   * RELEASING.md and decide whether the change is really worth a coordinated
   * two-repo deploy. Adding a store is one line in each place and is the whole
   * of what this list means to permit.
   */
  it('creates exactly the stores this release knows about, keyed as stated', async () => {
    // Any call through the package is enough to make the database exist.
    await metacomStore.readIndex();

    const db = await openDB('bildquelle');
    expect(Array.from(db.objectStoreNames).sort()).toEqual(OURS);

    // The keyPath is the half a rename would not touch and a sibling cannot
    // survive: a store read under a different key answers nothing, and the app
    // that changed it is the only one that notices.
    const tx = db.transaction(OURS as never);
    expect(Object.fromEntries(
      OURS.map((name) => [name, tx.objectStore(name as never).keyPath]),
    )).toEqual({
      arasaacSearch: 'query',
      arasaacImages: 'id',
      metacomIndex: 'key',
      metacomHandles: 'key',
    });
    await tx.done;
    db.close();
  });

  /*
   * The other side, and the one a reader of storage.ts alone would not think to
   * check: a store this code has never heard of belongs to a sibling that has
   * heard of it, and the open must leave it exactly where it found it.
   *
   * The database is seeded to look like a sibling's: one store of theirs that we
   * know nothing about, and one of ours missing. The missing one is what forces
   * `create()` to run at all — a database that already holds everything we need
   * is returned untouched, so a version of this test without it would pass
   * against code that dropped every unrecognised store.
   *
   * `resetModules` is the other half. `storage.ts` caches its connection in a
   * module-level promise, so without a fresh copy of the module the seeding
   * below happens underneath a database that is already open and the open path
   * is never walked a second time.
   */
  it('leaves a store it does not recognise alone', async () => {
    const reading = await openDB('bildquelle');
    const current = reading.version;
    // Closed before the upgrade below, or it blocks it: a connection left open
    // here is a test hanging for the life of the runner rather than a failure.
    reading.close();

    const seeded = await openDB('bildquelle', current + 1, {
      upgrade(db) {
        // Whatever a sibling on a later release added, and something of ours it
        // is too old to have.
        db.createObjectStore('somethingLater', { keyPath: 'key' })
          .put({ key: 'theirs', value: 'not ours to drop' });
        db.deleteObjectStore('metacomIndex' as never);
      },
    });
    seeded.close();

    vi.resetModules();
    const fresh = await import('../src/storage.js');

    // A full round trip through this package's own open path, which has to
    // notice metacomIndex is gone and add it back.
    await fresh.metacomStore.writeIndex('METACOM_9', []);
    expect((await fresh.metacomStore.readIndex())?.rootName).toBe('METACOM_9');

    const db = await openDB('bildquelle');
    expect(db.objectStoreNames.contains('somethingLater' as never)).toBe(true);
    expect(await db.get('somethingLater' as never, 'theirs' as never))
      .toEqual({ key: 'theirs', value: 'not ours to drop' });
    db.close();
  });
});
