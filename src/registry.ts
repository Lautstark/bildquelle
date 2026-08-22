import { ArasaacProvider } from './arasaac.js';
import { MetacomProvider } from './metacom.js';
import { arasaacCache } from './storage.js';
import type { ProviderId, SymbolProvider } from './types.js';

/**
 * One instance of each provider per document. Both hold caches — resolved object
 * URLs, an in-memory index — that only pay off when every part of the host app
 * shares them, and METACOM additionally owns a folder permission that must not
 * be re-requested per component.
 */
export const arasaac = new ArasaacProvider();
export const metacom = new MetacomProvider();

const REGISTRY: Record<ProviderId, SymbolProvider> = { arasaac, metacom };

export function getProvider(id: ProviderId): SymbolProvider {
  return REGISTRY[id];
}

export const PROVIDER_IDS: ProviderId[] = ['arasaac', 'metacom'];

/**
 * The licence notices that must be shown alongside symbols from these providers,
 * deduplicated and in a stable order.
 *
 * A host that shows one provider at a time can read `provider.attribution`
 * directly. This exists for output that mixes sources — a board with ARASAAC and
 * METACOM keys on it still owes ARASAAC its notice.
 */
export function attributionsFor(ids: Iterable<ProviderId>): string[] {
  const wanted = new Set(ids);
  return PROVIDER_IDS
    .filter((id) => wanted.has(id))
    .map((id) => REGISTRY[id].attribution)
    .filter((text): text is string => text !== null);
}

/**
 * Drops everything this package has stored: the ARASAAC caches, the METACOM
 * filename index and the folder handle. For a host's "delete all my data"
 * action — afterwards nothing here points at the user's disk.
 */
export async function clearAllProviderData(): Promise<void> {
  await Promise.all([arasaacCache.clear(), metacom.forget()]);
}
