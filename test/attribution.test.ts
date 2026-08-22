import { describe, expect, it } from 'vitest';
import { ARASAAC_ATTRIBUTION, arasaac, attributionsFor, metacom } from '../src/index.js';

/**
 * ARASAAC is CC BY-NC-SA: the notice is a licence condition, not a nicety, and
 * both consuming apps must render it wherever pictograms appear.
 */
describe('attribution', () => {
  it('travels with the ARASAAC provider', () => {
    expect(arasaac.attribution).toBe(ARASAAC_ATTRIBUTION);
    expect(ARASAAC_ATTRIBUTION).toContain('CC BY-NC-SA');
    expect(ARASAAC_ATTRIBUTION).toContain('arasaac.org');
  });

  it('is absent for the user’s own licensed METACOM copy', () => {
    expect(metacom.attribution).toBeNull();
  });

  it('collects the notices owed by a mixed set of symbols', () => {
    // A vorlaut board can carry keys from both sources; ARASAAC is still owed.
    expect(attributionsFor(['metacom', 'arasaac'])).toEqual([ARASAAC_ATTRIBUTION]);
    expect(attributionsFor(['arasaac', 'arasaac'])).toEqual([ARASAAC_ATTRIBUTION]);
    expect(attributionsFor(['metacom'])).toEqual([]);
    expect(attributionsFor([])).toEqual([]);
  });
});
