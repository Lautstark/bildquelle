/**
 * bildquelle — symbol search for German AAC tools.
 *
 * Two sources behind one interface: ARASAAC's public API, and the user's own
 * licensed METACOM folder read from disk. Browser-only, no server anywhere.
 *
 * Before changing anything here, read the licensing section of the README. The
 * METACOM rule is the reason this package exists as a package.
 */

export type {
  Candidate,
  LanguageCode,
  ProviderId,
  ProviderListener,
  ProviderStatus,
  SymbolProvider,
} from './types.js';
/** Which provider states are somebody's to act on. See the note on it. */
export { needsAttention } from './types.js';
/** Every language a sentence can be read in and ARASAAC searched in. */
export { LANGUAGES } from './types.js';

export { ArasaacProvider, ARASAAC_ATTRIBUTIONS } from './arasaac.js';
export { MetacomProvider } from './metacom.js';
export {
  arasaac,
  attributionsFor,
  clearAllProviderData,
  getProvider,
  metacom,
  PROVIDER_IDS,
  setSymbolLanguage,
  symbolLanguage,
} from './registry.js';
export { foldGerman, scoreLabel } from './text.js';
