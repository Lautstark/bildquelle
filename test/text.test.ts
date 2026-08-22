import { describe, expect, it } from 'vitest';
import { foldGerman, scoreLabel } from '../src/index.js';

describe('foldGerman', () => {
  it('folds umlauts and ß so filenames and typing can differ', () => {
    expect(foldGerman('Fröhlich')).toBe('froehlich');
    expect(foldGerman('Straße')).toBe('strasse');
    expect(foldGerman('Über Äpfel')).toBe('ueber aepfel');
  });
});

describe('scoreLabel', () => {
  it('ranks an exact match above every partial one', () => {
    const exact = scoreLabel('apfel', 'apfel');
    expect(exact).toBe(100);
    expect(exact).toBeGreaterThan(scoreLabel('apfel', 'apfel rot'));
    expect(scoreLabel('apfel', 'apfel rot')).toBeGreaterThan(scoreLabel('apfel', 'apfelsaft'));
  });

  it('prefers a whole word over a substring', () => {
    expect(scoreLabel('rot', 'apfel rot')).toBeGreaterThan(scoreLabel('rot', 'karotte'));
  });

  it('never returns zero, so a weak match still beats no match', () => {
    expect(scoreLabel('apfel', 'giraffe')).toBeGreaterThan(0);
  });
});
