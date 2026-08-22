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
  ProviderId,
  ProviderListener,
  ProviderStatus,
  SymbolProvider,
} from './types.js';

export { ArasaacProvider, ARASAAC_ATTRIBUTION } from './arasaac.js';
export { MetacomProvider } from './metacom.js';
export {
  arasaac,
  attributionsFor,
  clearAllProviderData,
  getProvider,
  metacom,
  PROVIDER_IDS,
} from './registry.js';
export { foldGerman, scoreLabel } from './text.js';
