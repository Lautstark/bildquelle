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

/**
 * The languages this package can read a sentence in and search ARASAAC in.
 *
 * A closed union rather than a plain string, and it is the same union in three
 * places on purpose: the endpoint ARASAAC is asked, the pipeline that turns a
 * sentence into words, and the licence notice shown underneath the result. A
 * host that could pass "fr" here would get an ARASAAC endpoint that answers,
 * a German lemmatiser that does not, and no way to tell from the outside which
 * half was missing.
 *
 * METACOM is not in this picture. It is a German product with German
 * filenames, so a collection the user owns matches German words whatever this
 * is set to - see the README.
 */
export type LanguageCode = 'de' | 'en';

/** Every language above, for hosts that offer a choice. */
export const LANGUAGES: readonly LanguageCode[] = ['de', 'en'];

/** A symbol offered for a query. `id` is provider-local and opaque to callers. */
export interface Candidate {
  id: string;
  label: string;
  /** Higher is better. Meaningful only for ordering within one provider's results. */
  score: number;
}

/**
 * Why a provider is not usable, and a sentence saying so.
 *
 * `code` is the part a host should branch on. `message` is a German default,
 * because the app this came from is German — but vorlaut ships in German *and*
 * English through a table of its own, so a shared package cannot be the one
 * deciding the wording. Show `message` if it suits you; translate from `code`
 * if it does not.
 */
export type ProviderStatus =
  | { kind: 'ready' }
  | { kind: 'needs-setup'; code: NeedsSetup; message: string }
  | { kind: 'loading'; code: Loading; message: string }
  | { kind: 'error'; code: Failed; message: string };

/** No folder has been chosen yet, or the browser wants access confirmed again. */
export type NeedsSetup = 'no-folder' | 'permission-needed';

/**
 * Whether this state is one the person has to do something about.
 *
 * A provider that is not ready is not automatically a problem: `no-folder` is
 * somebody who has not set METACOM up and may never want to, and `loading` is
 * a state that ends on its own. The two that are a problem are the two where
 * **the source was working and has stopped, and will not start again by
 * itself**: the browser has withdrawn its permission on a folder that is still
 * stored, or the folder could not be read.
 *
 * It is here rather than in each product because that is where it was, and the
 * consuming products drew the same conclusion differently - one as a truncated
 * instruction in a panel heading, one as a line of prose beside the
 * descriptions. The presentation stays theirs: `.notice.bad` is what the family
 * draws, and @lautstark/design's conventions.md §3.7 says what the words have
 * to cover. Which states deserve it is this package's answer, because this
 * package is the one that knows what the states mean.
 *
 * `permission-needed` is ordinary rather than exceptional - Chromium withdraws
 * a stored handle's permission between visits, nothing is lost, and one press
 * puts it back. Ordinary is about whose fault it is, not about whether anybody
 * has to act.
 */
export const needsAttention = (status: ProviderStatus): boolean =>
  (status.kind === 'needs-setup' && status.code === 'permission-needed')
  || status.kind === 'error';

export type Loading = 'reading-folder' | 'unpacking-zip' | 'indexing';

/** The folder held no images, could not be read, or ARASAAC did not answer. */
export type Failed = 'no-images' | 'read-failed' | 'network';

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
