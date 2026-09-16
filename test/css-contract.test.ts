/* The CSS contract, conventions.md §4.12: a shared module that emits markup
 * brings its CSS. Until 2026-09-16 that was prose; this is the check.
 *
 * Every class name the module puts on a node has to be one
 * @lautstark/design/components.css draws - a selector in that file names it.
 * The panel is rendered in every state it has, the class tokens of every node
 * under it are collected, and the difference against the stylesheet has to be
 * empty. A name that is missing is either a rule that belongs in
 * components.css and is not there yet, or a class the module should not be
 * emitting at all - §4.12 says which, and neither is this test's to decide.
 *
 * components.css comes in as a devDependency for exactly this: the package
 * does not import it at runtime, the products do, and what is asserted here
 * is that what they import draws what this package emits.
 *
 * drawnClasses() is three copies today - sicherung, bildquelle, stimmquelle -
 * and belongs in @lautstark/design beside the file it reads, the day a
 * release of design can carry it there. Written 2026-09-16.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/** Every class name that has a rule in components.css. */
function drawnClasses(): Set<string> {
  const path = createRequire(import.meta.url).resolve('@lautstark/design/components.css');
  const css = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const drawn = new Set<string>();
  // The text before each `{` is a selector list (or an at-rule prelude, which
  // holds no class). Declarations never reach this: they sit after the brace.
  for (const [, prelude] of css.matchAll(/([^{};]+)\{/g)) {
    for (const [, name] of prelude.matchAll(/\.([A-Za-z_][\w-]*)/g)) drawn.add(name);
  }
  return drawn;
}

/** Every class token on a node and everything under it. */
function emittedClasses(root: Element): Set<string> {
  const names = new Set<string>();
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const name of el.classList) names.add(name);
  }
  return names;
}

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { metacomPanel, type MetacomAction } from '../src/metacom-panel.js';
import type { MetacomProvider } from '../src/metacom.js';
import type { Failed, Loading, NeedsSetup, ProviderStatus } from '../src/types.js';

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

describe('every class name the panel emits is drawn by components.css', () => {
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
});
