import { describe, expect, it } from 'vitest';
import {
  ARASAAC_ATTRIBUTIONS, ArasaacProvider, arasaac, attributionsFor, metacom,
} from '../src/index.js';

/**
 * ARASAAC is CC BY-NC-SA: the notice is a licence condition, not a nicety, and
 * both consuming apps must render it wherever pictograms appear.
 */
describe('attribution', () => {
  it('travels with the ARASAAC provider', () => {
    expect(arasaac.attribution).toBe(ARASAAC_ATTRIBUTIONS[arasaac.language]);
    for (const notice of Object.values(ARASAAC_ATTRIBUTIONS)) {
      expect(notice).toContain('CC BY-NC-SA');
      expect(notice).toContain('arasaac.org');
      // Sergio Palao is named by the licence, in every language it is shown in.
      expect(notice).toContain('Sergio Palao');
    }
  });

  it('follows the language the provider is searching in', () => {
    // The notice is shown verbatim under artwork that is not ours, so an
    // English page owes the English wording rather than a German paragraph
    // nobody reading it can check.
    const provider = new ArasaacProvider('en');
    expect(provider.attribution).toBe(ARASAAC_ATTRIBUTIONS.en);
    expect(provider.attribution).toContain('Government of Aragon');

    provider.setLanguage('de');
    expect(provider.attribution).toBe(ARASAAC_ATTRIBUTIONS.de);
    expect(provider.attribution).toContain('Regierung von Aragón');
  });

  it('is absent for the user’s own licensed METACOM copy', () => {
    expect(metacom.attribution).toBeNull();
  });

  it('collects the notices owed by a mixed set of symbols', () => {
    // A vorlaut board can carry keys from both sources; ARASAAC is still owed.
    const owed = ARASAAC_ATTRIBUTIONS[arasaac.language];
    expect(attributionsFor(['metacom', 'arasaac'])).toEqual([owed]);
    expect(attributionsFor(['arasaac', 'arasaac'])).toEqual([owed]);
    expect(attributionsFor(['metacom'])).toEqual([]);
    expect(attributionsFor([])).toEqual([]);
  });
});
