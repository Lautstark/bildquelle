import { describe, expect, it, vi } from 'vitest';
import { MetacomProvider } from '../src/metacom.js';
import { metacomStore } from '../src/storage.js';

/**
 * How often a folder is opened.
 *
 * Reading a picture means walking to it: one `getDirectoryHandle` per segment
 * of its path, and in a real METACOM collection — 68,000 files — each of those
 * measured around 30ms in the browser. The walk began at the root for every
 * single picture, so a picker showing two dozen suggestions opened the same
 * four folders two dozen times. Measured in the household it was reported
 * from: 76 openings, 2.3 seconds, for one press.
 *
 * So this is a test about a count rather than about an answer. The pictures
 * came back correctly the whole time.
 */
function collection(paths: string[]) {
  let opened = 0;

  const at = (prefix: string, name: string) => (prefix ? `${prefix}/${name}` : name);

  const folder = (prefix: string): FileSystemDirectoryHandle => ({
    kind: 'directory',
    name: prefix.split('/').pop() ?? 'root',
    async getDirectoryHandle(name: string) {
      opened += 1;
      const inside = at(prefix, name);
      if (!paths.some((path) => path.startsWith(`${inside}/`))) throw new Error('no such folder');
      return folder(inside);
    },
    async getFileHandle(name: string) {
      const path = at(prefix, name);
      if (!paths.includes(path)) throw new Error('no such file');
      return {
        kind: 'file',
        name,
        getFile: async () => new File(['png-bytes'], name, { type: 'image/png' }),
      };
    },
    async *entries() {
      const here = paths
        .filter((path) => path.startsWith(prefix ? `${prefix}/` : ''))
        .map((path) => path.slice(prefix ? prefix.length + 1 : 0).split('/')[0]!);
      for (const name of new Set(here)) {
        const inside = at(prefix, name);
        yield [name, paths.includes(inside)
          ? { kind: 'file', name }
          : folder(inside)] as const;
      }
    },
  } as unknown as FileSystemDirectoryHandle);

  return { root: folder(''), opened: () => opened, reset: () => { opened = 0; } };
}

describe('reading a picture out of a folder', () => {
  const paths = [
    'METACOM_9/PNG_ohne_Rahmen/Verben/angeln.png',
    'METACOM_9/PNG_ohne_Rahmen/Verben/wuerfeln.png',
    'METACOM_9/PNG_ohne_Rahmen/Verben/trinken.png',
    'METACOM_9/PNG_ohne_Rahmen/Nomen/apfel.png',
  ];

  it('opens each folder once, however many pictures are read out of it', async () => {
    const shelf = collection(paths);
    vi.spyOn(metacomStore, 'writeHandle').mockResolvedValue(undefined);

    const metacom = new MetacomProvider();
    await metacom.useDirectoryHandle(shelf.root);
    expect(metacom.symbolCount).toBe(4);

    // The indexing walk is not what this is about.
    shelf.reset();

    for (const path of paths) expect(await metacom.getImageUrl(path)).toMatch(/^blob:/);

    /* Three folders hold these four pictures — METACOM_9, PNG_ohne_Rahmen and
       the two under it. Walking per picture opened eleven; opening each once
       is four. */
    expect(shelf.opened()).toBe(4);
  });

  it('opens them once even when every picture is asked for at the same time', async () => {
    const shelf = collection(paths);
    vi.spyOn(metacomStore, 'writeHandle').mockResolvedValue(undefined);

    const metacom = new MetacomProvider();
    await metacom.useDirectoryHandle(shelf.root);
    shelf.reset();

    /* Which is how a picker asks: two dozen tiles mount together and every one
       of them resolves its own picture. Remembering the finished handle is not
       enough for that — they all miss before any of them has finished — so
       what is kept is the opening itself. */
    await Promise.all(paths.map((path) => metacom.getImageUrl(path)));

    expect(shelf.opened()).toBe(4);
  });
});
