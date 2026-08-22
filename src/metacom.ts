import type JSZipType from 'jszip';
import { metacomStore, type MetacomEntry } from './storage.js';
import { foldGerman, scoreLabel } from './text.js';
import type { Candidate, ProviderListener, ProviderStatus, SymbolProvider } from './types.js';

const IMAGE_EXT = /\.(png|jpe?g|svg|webp|gif|bmp)$/i;

/** Object URLs are cheap to recreate; cap the live set so long sessions do not leak. */
const MAX_LIVE_URLS = 400;

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

    const scored: Candidate[] = [];
    for (const entry of this.#entries) {
      let best = scoreLabel(folded, foldGerman(entry.label));
      for (const t of entry.terms) best = Math.max(best, scoreLabel(folded, t));
      if (best >= 25) scored.push({ id: entry.path, label: entry.label, score: best });
    }

    return scored.sort((a, b) => b.score - a.score || a.label.length - b.label.length).slice(0, 24);
  }

  /* ------------------------------------------------------------- image ---- */

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
 * Turns "Essen/Obst/Apfel_rot-02.png" into a label of "Apfel rot" plus the
 * search terms "apfel" and "rot". METACOM filenames are the only metadata
 * available, so this cleanup is what search quality rests on.
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

  const terms = [...new Set(
    foldGerman(label)
      .split(/[\s\-_/]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2),
  )];

  return { path, label, terms };
}
