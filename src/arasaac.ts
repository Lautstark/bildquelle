import { arasaacCache } from './storage.js';
import { scoreLabel } from './text.js';
import type { Candidate, LanguageCode, ProviderStatus, SymbolProvider } from './types.js';

/*
 * ARASAAC keeps a set of keywords per language and the language is part of the
 * path, not a parameter. This was hardcoded to `de` for as long as everything
 * consuming it was German.
 *
 * It failing quietly is what makes it worth a note. The German endpoint does
 * not reject an English word, it answers one: `/de/search/water` comes back
 * 200 with a water-transport sign, because ARASAAC matches on tags and synsets
 * too. So an English reader was not shown "no results" - they were shown a
 * road sign for "water", which on a communication board is worse than an empty
 * square. Whatever else changes here, the language must stay something the
 * caller states rather than something this file assumes.
 */
const API = (lang: LanguageCode) => `https://api.arasaac.org/v1/pictograms/${lang}`;
const IMAGE = (id: string) => `https://static.arasaac.org/pictograms/${id}/${id}_500.png`;

/**
 * The licence notice, per language. CC BY-NC-SA requires it wherever the
 * pictograms appear — on screen and on anything printed.
 *
 * Shown verbatim, so it is a table rather than something assembled from parts:
 * a licence condition is not a sentence to be clever with, and the two apps
 * consuming this print it under artwork that is not theirs.
 */
export const ARASAAC_ATTRIBUTIONS: Record<LanguageCode, string> = {
  de: 'Piktogramme: ARASAAC (arasaac.org), CC BY-NC-SA. Autor: Sergio Palao. Urheber: Regierung von Aragón (Spanien).',
  en: 'Pictograms: ARASAAC (arasaac.org), CC BY-NC-SA. Author: Sergio Palao. Owner: Government of Aragon (Spain).',
};

/*
 * The default sentence for a state, per language.
 *
 * types.ts says a host should branch on `code` and write its own words, and
 * both hosts do. This is what is left for the ones that do not, and it follows
 * the provider's language for the same reason everything else here does.
 */
const NETWORK_MESSAGES: Record<LanguageCode, { status: (code: number) => string; failed: string }> = {
  de: { status: (code) => `ARASAAC antwortete mit ${code}`, failed: 'Netzwerkfehler' },
  en: { status: (code) => `ARASAAC answered with ${code}`, failed: 'Network error' },
};

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

  #lang: LanguageCode;

  /*
   * Keyed by language, all three of them, because the same string means a
   * different question per language and these are consulted before the network
   * is. `#objectUrls` is the exception below and is keyed by id alone: a
   * pictogram id is a picture, and a picture is not translated.
   */
  #objectUrls = new Map<string, string>();
  #inFlight = new Map<string, Promise<Candidate[]>>();
  #labels = new Map<string, string>();
  #lastError: string | null = null;

  /**
   * German unless told otherwise.
   *
   * The default is the older behaviour rather than the better one: bildhaft
   * reads German and says nothing about a language, and it should keep getting
   * German symbols without an edit. vorlaut states its language.
   */
  constructor(lang: LanguageCode = 'de') {
    this.#lang = lang;
  }

  get language(): LanguageCode {
    return this.#lang;
  }

  /**
   * Which language this provider searches, and which licence notice it owes.
   *
   * Switchable at runtime rather than fixed at construction, because vorlaut
   * switches language in place - no reload - and the registry hands out one
   * provider instance per document. Nothing needs clearing when it changes:
   * every cache here is keyed by language already, so the German answers stay
   * where they are and are still right the next time somebody switches back.
   */
  setLanguage(lang: LanguageCode): void {
    this.#lang = lang;
  }

  get attribution(): string {
    return ARASAAC_ATTRIBUTIONS[this.#lang];
  }

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

    const lang = this.#lang;
    const flight = `${lang}:${key}`;
    const existing = this.#inFlight.get(flight);
    if (existing) return existing;

    const task = this.#doSearch(lang, key).finally(() => this.#inFlight.delete(flight));
    this.#inFlight.set(flight, task);
    return task;
  }

  /*
   * The language is passed down rather than read from `this` again, and that
   * is not tidiness: a search started in German and awaited across a language
   * switch would otherwise write its German results under the English key.
   */
  async #doSearch(lang: LanguageCode, key: string): Promise<Candidate[]> {
    const cached = await arasaacCache.readSearch(lang, key);
    if (cached && Date.now() - cached.ts < SEARCH_TTL_MS) {
      this.#rememberLabels(lang, cached.candidates);
      return cached.candidates;
    }

    let candidates: Candidate[] = [];
    try {
      const res = await fetch(`${API(lang)}/search/${encodeURIComponent(key)}`, {
        headers: { Accept: 'application/json' },
      });

      // A 404 is ARASAAC's "no results", not a failure worth surfacing.
      if (res.status === 404) {
        candidates = [];
      } else if (!res.ok) {
        throw new Error(NETWORK_MESSAGES[lang].status(res.status));
      } else {
        const json = (await res.json()) as ArasaacPictogram[];
        candidates = this.#rank(key, Array.isArray(json) ? json : []);
      }
      this.#lastError = null;
    } catch (err) {
      // Serve a stale cache rather than nothing when the network is down.
      if (cached) return cached.candidates;
      this.#lastError = err instanceof Error ? err.message : NETWORK_MESSAGES[lang].failed;
      return [];
    }

    await arasaacCache.writeSearch(lang, key, candidates);
    this.#rememberLabels(lang, candidates);
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

  #rememberLabels(lang: LanguageCode, candidates: Candidate[]): void {
    for (const c of candidates) this.#labels.set(`${lang}:${c.id}`, c.label);
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
    const lang = this.#lang;
    const known = this.#labels.get(`${lang}:${id}`);
    if (known) return known;

    const found = await arasaacCache.findLabel(id, lang);
    if (found) this.#labels.set(`${lang}:${id}`, found);
    return found;
  }
}
