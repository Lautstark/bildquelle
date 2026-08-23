import { describe, expect, it } from 'vitest';
import { foldGerman, scoreLabel } from '../src/index.js';

describe('foldGerman', () => {
  it('folds umlauts and ß so filenames and typing can differ', () => {
    expect(foldGerman('Fröhlich')).toBe('froehlich');
    expect(foldGerman('Straße')).toBe('strasse');
    expect(foldGerman('Über Äpfel')).toBe('ueber aepfel');
  });

  it('drops punctuation, which is what a typed sentence brings with it', () => {
    expect(foldGerman('Hallo!')).toBe('hallo');
    expect(foldGerman('Ich habe Durst.')).toBe('ich habe durst');
    expect(foldGerman('Wirklich?')).toBe('wirklich');
    // Not turned into spaces: an abbreviation is one word, not three letters.
    expect(foldGerman('u.s.w.')).toBe('usw');
  });

  it('keeps the separators scoreLabel splits words on', () => {
    // METACOM's filenames mean something by these, and a query naming a
    // rendering carries a slash.
    expect(foldGerman('Apfel-rot')).toBe('apfel-rot');
    expect(foldGerman('PNG_ohne_Rahmen/ja')).toBe('png_ohne_rahmen/ja');
  });
});

describe('a query with punctuation, end to end', () => {
  it('scores against a clean label instead of falling to the floor', () => {
    // The bug this pins: a query is compared as a string, so "hallo!" was not
    // equal to "hallo", did not start with it, was not one of its words and
    // was not inside it - five points, under every provider's threshold, so a
    // full stop emptied the collection.
    expect(scoreLabel(foldGerman('Hallo!'), foldGerman('Hallo'))).toBe(100);
    expect(scoreLabel(foldGerman('Durst.'), foldGerman('Durst haben')))
      .toBeGreaterThanOrEqual(25);
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
