import { arasaacCache } from './storage.js';
import { scoreLabel } from './text.js';
import type { Candidate, ProviderStatus, SymbolProvider } from './types.js';

const API = 'https://api.arasaac.org/v1/pictograms/de';
const IMAGE = (id: string) => `https://static.arasaac.org/pictograms/${id}/${id}_500.png`;

/**
 * The licence notice, in German because both consuming apps are German-language
 * AAC tools and this text is shown to their users verbatim. CC BY-NC-SA requires
 * it wherever the pictograms appear — on screen and on anything printed.
 */
export const ARASAAC_ATTRIBUTION =
  'Piktogramme: ARASAAC (arasaac.org), CC BY-NC-SA. Autor: Sergio Palao. Urheber: Regierung von Aragón (Spanien).';

/** Extra words beyond the first — 0 for a single-word label. */
const wordCount = (label: string) => Math.max(0, label.trim().split(/\s+/).length - 1);

/** Cached searches go stale eventually, but ARASAAC changes slowly. */
const SEARCH_TTL_MS = 1000 * 60 * 60 * 24 * 30;

interface ArasaacPictogram {
  _id: number;
  keywords?: { keyword: string; type?: number }[];
  schematic?: boolean;
  aac?: boolean;
  aacColor?: boolean;
  sex?: boolean;
  violence?: boolean;
}

/**
 * The default backend: ARASAAC's public REST API, so a first-time visitor gets
 * symbols with zero setup. Results and image blobs are cached in IndexedDB, which
 * makes a re-opened session work without network.
 *
 * Licence: CC BY-NC-SA. Attribution is mandatory on screen and on print output.
 */
export class ArasaacProvider implements SymbolProvider {
  readonly id = 'arasaac' as const;
  readonly name = 'ARASAAC';
  readonly attribution = ARASAAC_ATTRIBUTION;

  #objectUrls = new Map<string, string>();
  #inFlight = new Map<string, Promise<Candidate[]>>();
  #labels = new Map<string, string>();
  #lastError: string | null = null;

  status(): ProviderStatus {
    return this.#lastError
      ? { kind: 'error', code: 'network', message: this.#lastError }
      : { kind: 'ready' };
  }

  isReady(): boolean {
    return true;
  }

  async search(query: string): Promise<Candidate[]> {
    const key = query.toLowerCase().trim();
    if (!key) return [];

    const existing = this.#inFlight.get(key);
    if (existing) return existing;

    const task = this.#doSearch(key).finally(() => this.#inFlight.delete(key));
    this.#inFlight.set(key, task);
    return task;
  }

  async #doSearch(key: string): Promise<Candidate[]> {
    const cached = await arasaacCache.readSearch(key);
    if (cached && Date.now() - cached.ts < SEARCH_TTL_MS) {
      this.#rememberLabels(cached.candidates);
      return cached.candidates;
    }

    let candidates: Candidate[] = [];
    try {
      const res = await fetch(`${API}/search/${encodeURIComponent(key)}`, {
        headers: { Accept: 'application/json' },
      });

      // A 404 is ARASAAC's "no results", not a failure worth surfacing.
      if (res.status === 404) {
        candidates = [];
      } else if (!res.ok) {
        throw new Error(`ARASAAC antwortete mit ${res.status}`);
      } else {
        const json = (await res.json()) as ArasaacPictogram[];
        candidates = this.#rank(key, Array.isArray(json) ? json : []);
      }
      this.#lastError = null;
    } catch (err) {
      // Serve a stale cache rather than nothing when the network is down.
      if (cached) return cached.candidates;
      this.#lastError = err instanceof Error ? err.message : 'Netzwerkfehler';
      return [];
    }

    await arasaacCache.writeSearch(key, candidates);
    this.#rememberLabels(candidates);
    return candidates;
  }

  #rank(query: string, pictograms: ArasaacPictogram[]): Candidate[] {
    return pictograms
      .map((p, apiRank) => {
        const keywords = (p.keywords ?? []).map((k) => k.keyword).filter(Boolean);
        const label = keywords[0] ?? String(p._id);
        const best = keywords.reduce((acc, kw) => Math.max(acc, scoreLabel(query, kw)), 0);

        // Symbols flagged for AAC use are the ones drawn for communication boards.
        const aacBonus = (p.aacColor ? 12 : 0) + (p.aac ? 8 : 0);
        // Schematic and sensitive pictograms are rarely what a family wants first.
        // Whole-phrase pictograms ("Ich mag das nicht.") frequently have writing
        // drawn into the artwork, which reads badly next to our own text label —
        // push them below the plain single-concept symbols.
        const phrasePenalty = query.includes(' ') ? 0 : Math.min(30, wordCount(label) * 12);
        const penalty =
          (p.schematic ? 15 : 0) + (p.violence ? 40 : 0) + (p.sex ? 40 : 0) + phrasePenalty;

        return {
          id: String(p._id),
          label,
          score: best + aacBonus - penalty - apiRank * 0.5,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 24);
  }

  #rememberLabels(candidates: Candidate[]): void {
    for (const c of candidates) this.#labels.set(c.id, c.label);
  }

  async getImageUrl(id: string): Promise<string | null> {
    const cachedUrl = this.#objectUrls.get(id);
    if (cachedUrl) return cachedUrl;

    const stored = await arasaacCache.readImage(id);
    if (stored) {
      const url = URL.createObjectURL(stored);
      this.#objectUrls.set(id, url);
      return url;
    }

    try {
      const res = await fetch(IMAGE(id));
      // A non-OK response is often transient (rate limiting, a 5xx). Hand back the
      // remote URL rather than null: the <img> can still try, and can report a real
      // failure through onError instead of leaving a spinner up forever.
      if (!res.ok) return IMAGE(id);
      const blob = await res.blob();
      await arasaacCache.writeImage(id, blob);
      const url = URL.createObjectURL(blob);
      this.#objectUrls.set(id, url);
      return url;
    } catch {
      // Fall back to the remote URL; the browser may still have it in HTTP cache.
      return IMAGE(id);
    }
  }

  async labelFor(id: string): Promise<string | null> {
    const known = this.#labels.get(id);
    if (known) return known;

    const found = await arasaacCache.findLabel(id);
    if (found) this.#labels.set(id, found);
    return found;
  }
}
