// @vitest-environment jsdom
/* The CSS contract, conventions.md §4.12: a shared module that emits markup
 * brings its CSS. Until 2026-09-16 that was prose; this is the check.
 *
 * Every class name a module puts on a node has to be one
 * @lautstark/design/components.css draws - a selector in that file names it.
 * Each panel is rendered in every state it has, the class tokens of every node
 * under it are collected, and the difference against the stylesheet has to be
 * empty. A name that is missing is either a rule that belongs in
 * components.css and is not there yet, or a class the module should not be
 * emitting at all - §4.12 says which, and neither is this test's to decide.
 *
 * components.css comes in as a devDependency for exactly this: the package
 * does not import it at runtime, the products do, and what is asserted here
 * is that what they import draws what this package emits.
 *
 * ## The two helpers came home, and that is why the Svelte versions are here
 *
 * `drawnClasses()` and `emittedClasses()` were three character-identical
 * copies - sicherung, bildquelle, stimmquelle - and all three said in their
 * header that they belonged in @lautstark/design beside the file they read.
 * design v1.33.0 carries them, so they are imported rather than written out.
 *
 * It is not tidying. A Svelte component with a `<style>` block puts its scoping
 * hash into `classList` beside the real names, and the local walk reported that
 * hash as a missing class - a failure nobody can act on, on every component
 * that styles itself. `emittedClasses()` over there skips it. Learning that
 * once is the whole argument for the move, and this file is the first consumer
 * of the lesson.
 *
 * `KNOWN_MISSING` stays here. Those are dated local exceptions with a reason
 * each, and they are this package's rather than design's.
 *
 * ## The Svelte panels are held to the same file, not to a copy of the rule
 *
 * §6.8 says the twin emits the same markup as the vanilla panel; this is the
 * assertion behind that sentence, and the two are run over the same list of
 * statuses so that a divergence shows up as a state rather than as a name.
 */
import { drawnClasses, emittedClasses } from '@lautstark/design/css';
import { mount, unmount } from 'svelte';
import { describe, expect, it } from 'vitest';
import { metacomPanel, type MetacomAction } from '../src/metacom-panel.js';
import MetacomPanel from '../svelte/MetacomPanel.svelte';
import SymbolSearch from '../svelte/SymbolSearch.svelte';
import type { MetacomProvider } from '../src/metacom.js';
import type {
  Candidate, Failed, Loading, NeedsSetup, ProviderStatus, SymbolProvider,
} from '../src/types.js';

function stub(status: ProviderStatus): MetacomProvider {
  return {
    status: () => status,
    isReady: () => status.kind === 'ready',
    symbolCount: status.kind === 'ready' ? 1234 : 0,
    rootName: status.kind === 'ready' ? 'METACOM' : '',
    subscribe: () => () => {},
    requestPermission: async () => true,
    pickDirectory: async () => {},
    useFileList: async () => {},
    useZip: async () => {},
    rebuildIndex: async () => {},
    forget: async () => {},
  } as unknown as MetacomProvider;
}

const HITS: Candidate[] = [
  { id: 'a', label: 'ja', score: 60 },
  // The same label twice, which is what `describe`'s `among` is about: METACOM
  // ships parallel rendering folders holding identical file names.
  { id: 'b', label: 'ja', score: 55 },
  { id: 'c', label: 'trinken', score: 40 },
];

/** A source that answers, so that the grid has tiles in it to collect from. */
function source(attribution: string | null, hits: Candidate[] = HITS): SymbolProvider {
  return {
    id: attribution ? 'arasaac' : 'metacom',
    name: 'stub',
    attribution,
    status: () => ({ kind: 'ready' }),
    isReady: () => true,
    search: async () => hits,
    getImageUrl: async (id: string) => `blob:${id}`,
    labelFor: async () => null,
  };
}

const NEEDS_SETUP: NeedsSetup[] = ['no-folder', 'permission-needed'];
const LOADING: Loading[] = ['reading-folder', 'unpacking-zip', 'indexing'];
const FAILED: Failed[] = ['no-images', 'read-failed', 'network'];
const EVERY_STATUS: ProviderStatus[] = [
  { kind: 'ready' },
  ...NEEDS_SETUP.map((code) => ({ kind: 'needs-setup', code }) as const),
  ...LOADING.map((code) => ({ kind: 'loading', code }) as const),
  ...FAILED.map((code) => ({ kind: 'error', code }) as const),
];
const ALL_ACTIONS: MetacomAction[] = ['choose', 'zip', 'reread', 'forget'];

/* Nothing tolerated on the day this was written. If a name ever has to be
 * listed here, it needs a date and a reason, the way sicherung's does. */
const KNOWN_MISSING = new Map<string, string>();

/** Mount a component into a throwaway host and hand back its one root node. */
function render<P extends Record<string, unknown>>(
  component: unknown, props: P,
): { node: Element; drop: () => void } {
  const host = document.createElement('div');
  document.body.append(host);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instance = mount(component as any, { target: host, props });
  return {
    node: host.firstElementChild!,
    drop: () => { void unmount(instance); host.remove(); },
  };
}

/** Let the mount's own effects and the awaited pictures settle. */
const settled = () => new Promise((done) => { setTimeout(done, 0); });

describe('every class name the panels emit is drawn by components.css', () => {
  const drawn = drawnClasses();
  const missingFrom = (node: Element) =>
    [...emittedClasses(node)].filter((name) => !drawn.has(name) && !KNOWN_MISSING.has(name));

  it('components.css was found and has rules', () => {
    expect(drawn.size).toBeGreaterThan(20);
  });

  it.each(EVERY_STATUS.map((s) => [`${s.kind}${'code' in s ? ' / ' + s.code : ''}`, s] as const))(
    'metacom-panel, %s, with every action offered', (_name, status) => {
      const panel = metacomPanel({
        metacom: stub(status), say: () => {}, actions: ALL_ACTIONS,
      });
      expect(missingFrom(panel.node)).toEqual([]);
      panel.dispose();
    });

  it('metacom-panel, ready, in English', () => {
    const panel = metacomPanel({ metacom: stub({ kind: 'ready' }), say: () => {}, lang: 'en' });
    expect(missingFrom(panel.node)).toEqual([]);
    panel.dispose();
  });

  it.each(EVERY_STATUS.map((s) => [`${s.kind}${'code' in s ? ' / ' + s.code : ''}`, s] as const))(
    'svelte/MetacomPanel, %s, with every action offered', async (_name, status) => {
      const panel = render(MetacomPanel, {
        metacom: stub(status), say: () => {}, actions: ALL_ACTIONS,
      });
      await settled();
      expect(missingFrom(panel.node)).toEqual([]);
      panel.drop();
    });

  it('svelte/MetacomPanel, ready, in English', async () => {
    const panel = render(MetacomPanel, {
      metacom: stub({ kind: 'ready' }), say: () => {}, lang: 'en',
    });
    await settled();
    expect(missingFrom(panel.node)).toEqual([]);
    panel.drop();
  });

  /* The search draws three things that can carry a class - the field, the grid
     and the credit line - and the credit is the one worth naming twice. It is
     computed from the source, so the two cases below are a source that owes an
     attribution and one that does not, and under METACOM nothing is drawn at
     all rather than an empty paragraph. */
  it('svelte/SymbolSearch, with hits and an attribution', async () => {
    const search = render(SymbolSearch, {
      provider: source('© ARASAAC'), words: { field: 'Symbol suchen' }, onpick: () => {},
    });
    await settled();
    expect(missingFrom(search.node)).toEqual([]);
    search.drop();
  });

  it('svelte/SymbolSearch, a chosen tile, under a source that owes nothing', async () => {
    const search = render(SymbolSearch, {
      provider: source(null), words: { field: 'Symbol suchen' }, chosen: 'a',
      suggestions: HITS, onpick: () => {},
    });
    await settled();
    expect(missingFrom(search.node)).toEqual([]);
    search.drop();
  });

  it('svelte/SymbolSearch, suppressed', async () => {
    const search = render(SymbolSearch, {
      provider: source('© ARASAAC'), words: { field: 'Symbol suchen' }, busy: true,
      suggestions: HITS, onpick: () => {},
    });
    await settled();
    expect(missingFrom(search.node)).toEqual([]);
    search.drop();
  });
});
