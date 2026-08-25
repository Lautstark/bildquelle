import type JSZipType from 'jszip';
import { metacomStore, type MetacomEntry } from './storage.js';
import { foldGerman, scoreLabel } from './text.js';
import type { Candidate, ProviderListener, ProviderStatus, SymbolProvider } from './types.js';

const IMAGE_EXT = /\.(png|jpe?g|svg|webp|gif|bmp)$/i;

/** Object URLs are cheap to recreate; cap the live set so long sessions do not leak. */
const MAX_LIVE_URLS = 400;

/**
 * The German negation words, folded, as a closed set.
 *
 * METACOM's negation symbol is filed as `nichtkein`, and the printed symbol
 * reads "nicht/kein" - a slash-pair, run together because a slash cannot go in
 * a filename. A slash-pair is not a compound: it joins two words that mean the
 * same thing in that position, where a compound names a third thing built out
 * of the first two. That difference is the whole of what `pairApart` below is
 * allowed to act on, and nothing in the string says which one you are looking
 * at - only the words do.
 *
 * This is the negation group and only the negation group. German's lexicon
 * groups them - `german/data/lemmas-other.ts` maps every "kein" form and
 * "nein" onto "nicht" - and that table is the general statement of the rule,
 * but it is 104 KB and this entry point deliberately carries none of it (the
 * German pipeline is its own module for exactly that reason). So the one group
 * METACOM actually ships as a pair is written out here instead, and another
 * kind of pair would need the lexicon rather than another line in this list.
 */
const NEGATIONS = new Set([
  'nicht', 'kein', 'keine', 'keinem', 'keinen', 'keiner', 'keines', 'nein',
]);

type Source =
  | { kind: 'none' }
  | { kind: 'handle'; handle: FileSystemDirectoryHandle }
  | { kind: 'files'; files: Map<string, File> }
  | { kind: 'zip'; zip: JSZipType };

/**
 * METACOM is commercial and licensed per person. The hard rule this class exists
 * to enforce:
 *
 *   No METACOM image byte is ever uploaded, transmitted, or written to any server.
 *
 * Concretely: images are read from the user's own disk on demand and handed to
 * <img> as short-lived object URLs. Image bytes are NEVER written to storage —
 * only the filename index is cached, so a cold start does not have to re-walk
 * ~10k files. Nothing derived from these files leaves the browser.
 *
 * Two things hold that up beyond good intentions. This class never calls `fetch`
 * or any other network API — there is no code path from a licensed file to the
 * wire. And `storage.ts` gives it nowhere to put bytes even if one were added.
 */
export class MetacomProvider implements SymbolProvider {
  readonly id = 'metacom' as const;
  readonly name = 'METACOM';
  /** The user's own licensed copy; no attribution obligation on our side. */
  readonly attribution = null;

  #source: Source = { kind: 'none' };
  #entries: MetacomEntry[] = [];
  #byPath = new Map<string, MetacomEntry>();
  #objectUrls = new Map<string, string>();
  #rootName = '';
  #preferred: string | null = null;
  #status: ProviderStatus =
    { kind: 'needs-setup', code: 'no-folder', message: 'Noch kein METACOM-Ordner ausgewählt.' };
  #listeners = new Set<ProviderListener>();

  subscribe(listener: ProviderListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(): void {
    for (const l of this.#listeners) l();
  }

  #setStatus(status: ProviderStatus): void {
    this.#status = status;
    this.#emit();
  }

  status(): ProviderStatus {
    return this.#status;
  }

  isReady(): boolean {
    return this.#status.kind === 'ready' && this.#entries.length > 0;
  }

  get rootName(): string {
    return this.#rootName;
  }

  /**
   * How many image files were indexed. A count, not the index: the list of
   * filenames is derived from the user's licensed folder and stays inside this
   * package. Callers reach individual entries only through `search`, scoped to a
   * term the user typed.
   */
  get symbolCount(): number {
    return this.#entries.length;
  }

  /** True when the browser can persist the folder choice across visits. */
  static get supportsPersistentPicker(): boolean {
    return typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
  }

  /* ------------------------------------------------------------ restore --- */

  /**
   * Re-attaches to a previously chosen folder on startup. Chromium keeps the
   * handle valid across visits but may still require a permission click, so a
   * failure here is normal and simply falls back to "needs setup".
   */
  async restore(): Promise<boolean> {
    const stored = await metacomStore.readHandle();
    if (!stored) return false;

    const handle = stored as FileSystemDirectoryHandle;
    if (!(await this.#ensureReadPermission(handle))) return false;

    this.#source = { kind: 'handle', handle };
    const index = await metacomStore.readIndex();
    if (index && index.entries.length > 0) {
      this.#adopt(index.entries, index.rootName);
      return true;
    }
    await this.#buildIndexFromHandle(handle);
    return this.isReady();
  }

  /** Called when a restored handle needs the user to re-confirm permission. */
  async requestPermission(): Promise<boolean> {
    const stored = await metacomStore.readHandle();
    if (!stored) return false;
    const handle = stored as FileSystemDirectoryHandle & {
      requestPermission?: (d: { mode: string }) => Promise<PermissionState>;
    };
    try {
      const state = (await handle.requestPermission?.({ mode: 'read' })) ?? 'granted';
      if (state !== 'granted') return false;
    } catch {
      return false;
    }
    this.#source = { kind: 'handle', handle };
    return this.restore();
  }

  /* -------------------------------------------------------------- pick ---- */

  /** Chromium path: one-time pick, remembered across visits. */
  async pickDirectory(): Promise<void> {
    const picker = (globalThis as {
      showDirectoryPicker?: (o?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker;
    if (!picker) throw new Error('Dieser Browser unterstützt die Ordnerauswahl nicht.');

    await this.useDirectoryHandle(await picker({ mode: 'read' }));
  }

  /**
   * Adopts a directory handle the host already holds — a handle carried over from
   * an older storage location, or one obtained by the host's own picker. The
   * capability granted is identical to `pickDirectory`: permission to read the
   * user's folder, in this browser, for as long as the browser honours it.
   */
  async useDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    this.#source = { kind: 'handle', handle };
    // Only the handle is stored — a capability to read, not any file content.
    await metacomStore.writeHandle(handle);
    // A handle straight from the picker is granted; one carried over from
    // elsewhere may need the user to confirm again, which needs a click.
    if (!(await this.#ensureReadPermission(handle))) return;
    await this.#buildIndexFromHandle(handle);
  }

  /**
   * Chromium keeps a handle valid across visits but may still want the user to
   * re-confirm, and that confirmation needs a gesture we do not have here. So a
   * refusal is not an error: it asks for a click and waits.
   */
  async #ensureReadPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
    const scoped = handle as FileSystemDirectoryHandle & {
      queryPermission?: (d: { mode: string }) => Promise<PermissionState>;
    };
    try {
      if (((await scoped.queryPermission?.({ mode: 'read' })) ?? 'granted') === 'granted') return true;
    } catch {
      return false;
    }
    this.#setStatus({
      kind: 'needs-setup',
      code: 'permission-needed',
      message: 'Zugriff auf den METACOM-Ordner muss erneut bestätigt werden.',
    });
    return false;
  }

  /** Firefox/Safari path: <input type="file" webkitdirectory>. Session-only. */
  async useFileList(fileList: FileList | File[]): Promise<void> {
    this.#setStatus({ kind: 'loading', code: 'reading-folder', message: 'Ordner wird gelesen …' });
    const files = new Map<string, File>();
    const entries: MetacomEntry[] = [];

    for (const file of Array.from(fileList)) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      if (!IMAGE_EXT.test(rel)) continue;
      files.set(rel, file);
      entries.push(makeEntry(rel));
    }

    const root = entries.length > 0 ? firstSegment(entries[0].path) : 'METACOM';
    this.#source = { kind: 'files', files };
    await metacomStore.writeIndex(root, entries);
    this.#adopt(entries, root);
  }

  /** Last-resort path: a zip of the user's own symbol folder, unpacked in-browser. */
  async useZip(file: File): Promise<void> {
    this.#setStatus({ kind: 'loading', code: 'unpacking-zip', message: 'ZIP wird entpackt …' });
    // Loaded on demand: JSZip is large and only this fallback path needs it.
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(file);
    const entries: MetacomEntry[] = [];

    zip.forEach((path, entry) => {
      if (entry.dir || !IMAGE_EXT.test(path)) return;
      entries.push(makeEntry(path));
    });

    this.#source = { kind: 'zip', zip };
    const root = file.name.replace(/\.zip$/i, '');
    await metacomStore.writeIndex(root, entries);
    this.#adopt(entries, root);
  }

  /** Forgets the folder, the index and every live URL. */
  async forget(): Promise<void> {
    this.#revokeAll();
    this.#source = { kind: 'none' };
    this.#entries = [];
    this.#byPath.clear();
    this.#rootName = '';
    await metacomStore.clear();
    this.#setStatus(
      { kind: 'needs-setup', code: 'no-folder', message: 'Noch kein METACOM-Ordner ausgewählt.' },
    );
  }

  /** Re-walks the folder, for when the user has added symbols since the last index. */
  async rebuildIndex(): Promise<void> {
    if (this.#source.kind === 'handle') await this.#buildIndexFromHandle(this.#source.handle);
  }

  /* ------------------------------------------------------------- index ---- */

  async #buildIndexFromHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    this.#setStatus({ kind: 'loading', code: 'indexing', message: 'Symbole werden indiziert …' });
    const entries: MetacomEntry[] = [];
    try {
      await walk(handle, '', entries);
    } catch (err) {
      this.#setStatus({
        kind: 'error',
        code: 'read-failed',
        message: err instanceof Error ? err.message : 'Ordner konnte nicht gelesen werden.',
      });
      return;
    }
    // Filenames only. This index stays on this machine, in this browser.
    await metacomStore.writeIndex(handle.name, entries);
    this.#adopt(entries, handle.name);
  }

  #adopt(entries: MetacomEntry[], rootName: string): void {
    /*
     * The live object URLs belong to the folder being replaced. They are keyed
     * by path, so any that outlive the swap keep answering with the previous
     * folder's artwork — a file that is no longer there still shows a picture,
     * and picking a different rendering of the same word appears to do nothing.
     * Nothing else drops them: the map is trimmed only when it grows past its
     * limit, which can take an entire session.
     */
    this.#revokeAll();
    this.#entries = entries;
    this.#byPath = new Map(entries.map((e) => [e.path, e]));
    this.#rootName = rootName;
    this.#setStatus(
      entries.length > 0
        ? { kind: 'ready' }
        : {
            kind: 'error',
            code: 'no-images',
            message: 'In diesem Ordner wurden keine Bilddateien gefunden.',
          },
    );
  }

  /* ------------------------------------------------------------ search ---- */

  async search(query: string): Promise<Candidate[]> {
    const term = query.trim();
    if (!term || this.#entries.length === 0) return [];
    const folded = foldGerman(term);

    /*
     * The folded label, and only the folded label.
     *
     * There used to be a second pass here, scoring each of the entry's `terms`
     * - the label's own words, "nicht binär" held as ["nicht", "binaer"] - and
     * keeping whichever came out higher. That pass is what a picker searching
     * "nicht" ran into. scoreLabel answers "how well does this LABEL answer the
     * query", and a single word handed to it as a label can only come back
     * exact: "nicht" IS the whole of what it was given. So every label with
     * "nicht" anywhere among its words scored 100, the answer was two dozen
     * rows all claiming to be the word itself, and the only thing left holding
     * them apart was the length tie-break below - which is there to order
     * parallel renderings, not to carry this.
     *
     * Nothing is lost by dropping it, and that is checkable rather than hoped
     * for: the ladder already asks every question a term could answer, of the
     * same folded string the terms were split from. A term equal to the query
     * is one of the label's words (60). A term starting with it is a word
     * starting with it (40). A term containing it means the label contains it
     * (25). All three clear the threshold, so the same entries match - they
     * are ranked against each other properly now instead of tying at the top.
     */
    /*
     * The other half of the same report, and the half ranking can fix.
     *
     * METACOM writes some pairs apart and some together. `nicht_binaer`
     * reaches the label "nicht binaer", which scoreLabel reads as the query
     * followed by more - 70. `nichtkein` is the negation pair "nicht/kein"
     * written without its slash, and scoreLabel has no separator to find: 55,
     * a bare prefix, below every spelling of "nicht binaer" and below "nichte"
     * and "nichts" on the length tie-break as well. So the one symbol a picker
     * searching "nicht" is after was buried under nine unrelated ones.
     *
     * `pairApart` puts the slash back, as a space, and only where the label
     * really is a pair. It is deliberately narrow. An earlier version of this
     * asked only whether what followed the query looked like a word, which
     * also promoted "nichtbinaer" - and that is a compound, a different word
     * that happens to start the same way. vorlaut reads this score as a grade
     * and captions an answer that holds no picture of the word itself, so
     * flattening that distinction took its caption away for the exact search
     * it was written for. A pair is two words; a compound is one. Only the
     * first is rewritten.
     *
     * Scored, never stored: the label a caller sees is still the one the
     * filename gave. And membership cannot change - a label it rewrites
     * already began with one of the pair, so it already scored at least 55 and
     * was already in the answer. Rows are reordered; none appear, none drop.
     */
    const scored: Candidate[] = [];
    for (const entry of this.#entries) {
      const label = foldGerman(entry.label);
      let best = scoreLabel(folded, label);
      const paired = pairApart(label);
      if (paired) best = Math.max(best, scoreLabel(folded, paired));
      if (best >= 25) scored.push({ id: entry.path, label: entry.label, score: best });
    }

    /*
     * The preference orders equals and nothing more. It sits below the score
     * so a rendering can never outrank a better match — a word that exists in
     * only one folder still wins its own search — and above label length,
     * because parallel renderings share a file name and therefore tie there
     * too. Without it the winner among identical names is whichever the index
     * happened to list first.
     *
     * Label length is what answers "nicht" once the rewrite above has put the
     * pair on the same rung as the separated spellings: "nichtkein" is shorter
     * than "nicht binaer" and than every SW variant of it, and the least
     * embellished label is the word asked for.
     */
    return scored
      .sort((a, b) => b.score - a.score
        || this.#renderingRank(a.id) - this.#renderingRank(b.id)
        || a.label.length - b.label.length)
      .slice(0, 24);
  }

  #renderingRank(path: string): number {
    if (!this.#preferred) return 0;
    return path.split('/').slice(0, -1).includes(this.#preferred) ? 0 : 1;
  }

  /**
   * Prefer one rendering when several hold the same file name. Ordering only:
   * nothing is filtered out, so a symbol that exists in just one folder stays
   * reachable. Pass null to go back to no preference.
   */
  preferRendering(segment: string | null): void {
    this.#preferred = segment?.trim() || null;
  }

  /** The rendering currently preferred, or null. */
  get preferredRendering(): string | null {
    return this.#preferred;
  }

  /**
   * The folders that tell identical file names apart, with how many names each
   * one covers.
   *
   * METACOM ships its symbols several times over — with and without a frame,
   * with and without the word printed on the picture — as parallel folders
   * holding the same file names. Only the segments that *differ* within a group
   * of same-named files identify a rendering: the ones every copy shares are
   * the collection root and the category, which say nothing about which
   * rendering you are looking at.
   *
   * Derived from the index rather than from a list of known folder names,
   * because a user's copy is theirs: renamed, partial, or organised for a
   * language this package has never seen.
   */
  renderings(): { segment: string; count: number }[] {
    const byName = new Map<string, string[][]>();
    for (const entry of this.#entries) {
      const segments = entry.path.split('/');
      const name = (segments.pop() ?? '').toLowerCase();
      const group = byName.get(name);
      if (group) group.push(segments);
      else byName.set(name, [segments]);
    }

    const counts = new Map<string, number>();
    for (const group of byName.values()) {
      if (group.length < 2) continue;
      const shared = group.reduce((common, segments) =>
        common.filter((segment) => segments.includes(segment)));
      for (const segments of group) {
        for (const segment of new Set(segments)) {
          if (shared.includes(segment)) continue;
          counts.set(segment, (counts.get(segment) ?? 0) + 1);
        }
      }
    }

    return [...counts]
      .map(([segment, count]) => ({ segment, count }))
      .sort((a, b) => b.count - a.count || a.segment.localeCompare(b.segment));
  }

  /* ------------------------------------------------------------- image ---- */

  /**
   * The id behind a stored name — or null when nothing here answers to it.
   *
   * This exists for consumers whose *stored* references are names rather than
   * paths: a name survives the collection moving to another disk or machine,
   * where a path is a fact about one copy. Reading such a reference back needs
   * exactly this lookup, and nothing public offered it — `search()` ranks and
   * truncates, which is right for a search box and wrong for resolution, where
   * a miss must mean "not there" and never "outranked".
   *
   * Two shapes arrive. A bare name — `Apfel_rot-02` — matches the file with
   * exactly that stem: the original reference shape, written by every document
   * that exists, so it stays valid forever. A name carrying a `/` —
   * `PNG_ohne_Rahmen/ja` — also says which *rendering* was meant: METACOM
   * ships parallel folders holding identical file names, and the stem alone
   * cannot tell them apart. It matches the entry whose extension-stripped path
   * *is* that name or ends with `/` + that name, whatever sits above it —
   * the folders are part of a METACOM distribution while everything above
   * them only names one copy of it.
   *
   * The two id shapes this index itself produces are why both comparisons
   * exist and why a miss sheds its leftmost segment and tries again: a picked
   * directory handle indexes paths without the root ("PNG_ohne_Rahmen/ja.png"),
   * a file list indexes them with it ("METACOM_9/PNG_ohne_Rahmen/ja.png"), and
   * a zip does whatever the zip was made to do. A name written against one
   * shape has to find the same picture in any other, so the qualified match is
   * tried most-specific first and the bare stem — the rule every old document
   * already relies on — is where the walk ends. The right symbol in another
   * rendering beats a placeholder.
   *
   * Exact per candidate, including case. The names come out of this same
   * index via the consumer's own stem-stripping, so a case difference is a
   * real difference — and a forgiving match could hand back the wrong
   * licensed artwork, which is worse than a placeholder.
   */
  idForName(name: string): string | null {
    let candidate = name;
    for (;;) {
      const hit = candidate.includes('/')
        ? this.#idForPath(candidate)
        : this.#idForStem(candidate);
      if (hit) return hit;
      const cut = candidate.indexOf('/');
      if (cut < 0) return null;
      candidate = candidate.slice(cut + 1);
    }
  }

  #idForPath(path: string): string | null {
    const suffix = '/' + path;
    for (const entry of this.#entries) {
      const stripped = entry.path.replace(IMAGE_EXT, '');
      if (stripped === path || stripped.endsWith(suffix)) return entry.path;
    }
    return null;
  }

  #idForStem(stem: string): string | null {
    if (!stem) return null;
    for (const entry of this.#entries) {
      const base = entry.path.split('/').pop() ?? entry.path;
      if (base.replace(IMAGE_EXT, '') === stem) return entry.path;
    }
    return null;
  }

  async getImageUrl(id: string): Promise<string | null> {
    const live = this.#objectUrls.get(id);
    if (live) return live;

    const blob = await this.#readBlob(id);
    if (!blob) return null;

    // Bound the live set: object URLs hold their blob in memory until revoked.
    if (this.#objectUrls.size >= MAX_LIVE_URLS) {
      const oldest = this.#objectUrls.keys().next().value;
      if (oldest !== undefined) {
        URL.revokeObjectURL(this.#objectUrls.get(oldest)!);
        this.#objectUrls.delete(oldest);
      }
    }

    const url = URL.createObjectURL(blob);
    this.#objectUrls.set(id, url);
    return url;
  }

  /**
   * The only place licensed bytes are touched, and they go straight into an
   * object URL. Nothing else in this package receives a Blob from here.
   */
  async #readBlob(path: string): Promise<Blob | null> {
    const source = this.#source;
    try {
      if (source.kind === 'handle') {
        const segments = path.split('/').filter(Boolean);
        let dir = source.handle;
        for (const segment of segments.slice(0, -1)) {
          dir = await dir.getDirectoryHandle(segment);
        }
        const fileHandle = await dir.getFileHandle(segments[segments.length - 1]);
        return await fileHandle.getFile();
      }
      if (source.kind === 'files') return source.files.get(path) ?? null;
      if (source.kind === 'zip') return (await source.zip.file(path)?.async('blob')) ?? null;
    } catch {
      return null;
    }
    return null;
  }

  async labelFor(id: string): Promise<string | null> {
    return this.#byPath.get(id)?.label ?? null;
  }

  #revokeAll(): void {
    for (const url of this.#objectUrls.values()) URL.revokeObjectURL(url);
    this.#objectUrls.clear();
  }
}

/* ------------------------------------------------------------- helpers --- */

async function walk(dir: FileSystemDirectoryHandle, prefix: string, out: MetacomEntry[]): Promise<void> {
  // @ts-expect-error - async iteration over directory handles is not in lib.dom yet
  for await (const [name, handle] of dir.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') {
      await walk(handle as FileSystemDirectoryHandle, path, out);
    } else if (IMAGE_EXT.test(name)) {
      out.push(makeEntry(path));
    }
  }
}

const firstSegment = (path: string) => path.split('/')[0] ?? 'METACOM';

/**
 * A run-together pair of negation words, split apart: `"nichtkein"` becomes
 * `"nicht kein"`. Null for everything else, which is nearly everything.
 *
 * The label is already folded. scoreLabel then reads the result the way it
 * already reads "nicht binaer" - the query, and then more - so the pair stops
 * being punished for a slash a filename could not hold.
 *
 * What this refuses is the point of it:
 *
 *   "nichtbinaer" is a compound, not a pair. "binaer" is not a negation word,
 *   so no split is found and the label keeps the bare-prefix score the ladder
 *   already gave it. The same goes for "nichtkauen" and "nichtkomisch", and
 *   for "apfelsaft", which is not a way of writing "Apfel".
 *
 *   "nichte" is a niece and "nichts" is "nothing". Neither "e" nor "s" is a
 *   word at all, let alone a negation, so a search for negation cannot put
 *   either of them above the symbol it is looking for.
 *
 * Both halves are checked, so the split reads the same from either side: a
 * search for "kein" reaches "nichtkein" too, which it could only do as a bare
 * substring before.
 */
function pairApart(label: string): string | null {
  // A label that already carries a separator has nothing run together in it,
  // and every pair is two short words - so this walks a handful of positions
  // on a handful of labels rather than every index on every search.
  if (label.length > 24 || /[\s\-_/]/.test(label)) return null;
  for (let cut = 1; cut < label.length; cut++) {
    const head = label.slice(0, cut);
    const tail = label.slice(cut);
    if (NEGATIONS.has(head) && NEGATIONS.has(tail)) return `${head} ${tail}`;
  }
  return null;
}

/**
 * Turns "Essen/Obst/Apfel_rot-02.png" into a label of "Apfel rot". METACOM
 * filenames are the only metadata available, so this cleanup is what search
 * quality rests on.
 *
 * The label is the whole of it. An entry used to carry a pre-split `terms`
 * list beside it, and search() scored those words as though each were a label
 * of its own - which made every compound an exact match for any word in it.
 * The split is not gone, it moved back to where it belongs: scoreLabel does it
 * on the folded label and knows that a word of a label is worth less than the
 * label. Nothing else read the field, and an index the browser keeps on disk is
 * better off without a copy of what can be derived from the line above it.
 */
function makeEntry(path: string): MetacomEntry {
  const base = path.split('/').pop() ?? path;
  const stem = base.replace(IMAGE_EXT, '');

  const label = stem
    .replace(/[_]+/g, ' ')
    .replace(/(?<=\D)-(?=\D)/g, ' ')
    .replace(/[-\s]*\d+\s*$/, '') // trailing variant numbers: "Apfel-02" -> "Apfel"
    .replace(/\s+/g, ' ')
    .trim() || stem;

  return { path, label };
}
