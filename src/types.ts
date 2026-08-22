/**
 * The contract every symbol source implements.
 *
 * Two sources exist today and the union is closed on purpose: ARASAAC is a public
 * API anyone may call, METACOM is a commercial set the user must own. Those two
 * cases have different obligations attached to them (see the README), and a
 * pluggable third-party provider would be a hole in exactly the place where the
 * rules live.
 */
export type ProviderId = 'arasaac' | 'metacom';

/** A symbol offered for a query. `id` is provider-local and opaque to callers. */
export interface Candidate {
  id: string;
  label: string;
  /** Higher is better. Meaningful only for ordering within one provider's results. */
  score: number;
}

export type ProviderStatus =
  | { kind: 'ready' }
  | { kind: 'needs-setup'; message: string }
  | { kind: 'loading'; message: string }
  | { kind: 'error'; message: string };

/** Notifies the host when a provider's readiness changes (folder picked, index built). */
export type ProviderListener = () => void;

export interface SymbolProvider {
  readonly id: ProviderId;
  readonly name: string;
  /**
   * The licence notice that must accompany this provider's symbols wherever they
   * are shown or printed. Null when the source carries no such obligation.
   *
   * Not optional, and not a hint: for ARASAAC this is a condition of the licence.
   */
  readonly attribution: string | null;

  status(): ProviderStatus;
  isReady(): boolean;

  /**
   * Ranked candidates for a search term. Must not throw; returns [] on failure.
   *
   * The term is whatever the host is looking up — a lemma from a parsed sentence,
   * or a word typed into a search box. Providers treat it as a plain string.
   */
  search(query: string): Promise<Candidate[]>;

  /**
   * A URL usable in `<img src>`, or null when the symbol cannot be resolved.
   *
   * Deliberately a URL and never bytes: an object URL is valid in this document
   * only, so a caller can render a symbol but cannot serialise, upload or store
   * one. That is what keeps the METACOM rule (see README) enforceable from here.
   */
  getImageUrl(id: string): Promise<string | null>;

  /** Human-readable label for a symbol id, for references restored from storage. */
  labelFor(id: string): Promise<string | null>;
}
