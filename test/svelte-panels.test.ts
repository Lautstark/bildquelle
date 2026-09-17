// @vitest-environment jsdom
/* The two Svelte components, held to the things that were paid for once.
 *
 * `css-contract.test.ts` asserts the vocabulary. This asserts the behaviour,
 * and every case in it is a defect somebody found in a product and wrote down —
 * conventions.md §6.4 and §6.8 are a list of them. A component that quietly
 * loses one of these is worse than the three copies it replaced, because it
 * loses it in four places at once.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRawSnippet, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
/* Every import below is one a consumer can write, and that is the point rather
 * than tidiness. The components used to import `../src/`, which is green here
 * — the source is right there — and red in every product, because `exports`
 * points at `dist` and `tsc` writes `#private;` into a class declaration, so
 * the two `MetacomProvider`s are nominally distinct types. A suite that
 * imported from `../src/` too was standing on the same side of the seam as the
 * bug and could not see it. See "the seam" at the bottom of this file. */
import { MetacomProvider } from '@lautstark/bildquelle';
import { metacomPanel } from '@lautstark/bildquelle/metacom-panel';
import MetacomPanel from '../svelte/MetacomPanel.svelte';
import SymbolSearch from '../svelte/SymbolSearch.svelte';
import ConsumerCallSite from './fixtures/ConsumerCallSite.svelte';
import type { Candidate, ProviderStatus, SymbolProvider } from '@lautstark/bildquelle';

/* The three code unions are not exported, and a consumer reads them off
   `ProviderStatus` exactly like this. Deriving them rather than reaching into
   `src/types.js` for them also keeps this file's promise: it holds the
   published surface to what the panel draws, and a code the union gains is one
   this suite gains with it. */
type NeedsSetup = Extract<ProviderStatus, { kind: 'needs-setup' }>['code'];
type Loading = Extract<ProviderStatus, { kind: 'loading' }>['code'];
type Failed = Extract<ProviderStatus, { kind: 'error' }>['code'];

const mounted: Array<Record<string, unknown>> = [];

afterEach(() => {
  while (mounted.length) void unmount(mounted.pop()!);
  document.body.replaceChildren();
});

function render<P extends Record<string, unknown>>(component: unknown, props: P): Element {
  const host = document.createElement('div');
  document.body.append(host);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mounted.push(mount(component as any, { target: host, props }) as Record<string, unknown>);
  return host.firstElementChild!;
}

/** Let mount effects, the debounce and any awaited picture settle. */
const settle = (ms = 0) => new Promise((done) => { setTimeout(done, ms); });

/* --- the panel ----------------------------------------------------------- */

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

const named = (status: ProviderStatus) =>
  `${status.kind}${'code' in status ? ` / ${status.code}` : ''}`;

/**
 * What a panel says, as something two implementations can be compared on.
 *
 * Not `outerHTML`: the two builders write the same attributes in different
 * orders and one of them is not more right than the other. What §6.8 means by
 * "same emitted markup" is what a reader and a stylesheet see — the elements,
 * their classes, the text, what is hidden and what is disabled — and that is
 * what this reads off.
 */
function shape(root: Element): unknown {
  return [...root.querySelectorAll('*')].map((el) => ({
    tag: el.tagName,
    class: el.className,
    state: el.getAttribute('data-state'),
    hidden: el.hasAttribute('hidden'),
    disabled: el.hasAttribute('disabled'),
    text: (el as HTMLElement).textContent,
  }));
}

describe('svelte/MetacomPanel is the twin of the vanilla panel', () => {
  it.each(EVERY_STATUS.map((s) => [named(s), s] as const))(
    'draws what metacomPanel draws, %s', async (_name, status) => {
      const vanilla = metacomPanel({ metacom: stub(status), say: () => {} });
      const twin = render(MetacomPanel, { metacom: stub(status), say: () => {} });
      await settle();
      expect(shape(twin)).toEqual(shape(vanilla.node));
      vanilla.dispose();
    });

  it('draws what metacomPanel draws in English too', async () => {
    const status: ProviderStatus = { kind: 'ready' };
    const vanilla = metacomPanel({ metacom: stub(status), say: () => {}, lang: 'en' });
    const twin = render(MetacomPanel, { metacom: stub(status), say: () => {}, lang: 'en' });
    await settle();
    expect(shape(twin)).toEqual(shape(vanilla.node));
    vanilla.dispose();
  });

  /* §6.8: `data-state` is the kind verbatim, because components.css styles the
     kinds by name — a mapping table would break the styling and hide a kind
     nobody has added yet. */
  it.each(EVERY_STATUS.map((s) => [named(s), s] as const))(
    'writes the status kind onto data-state verbatim, %s', async (_name, status) => {
      const node = render(MetacomPanel, { metacom: stub(status), say: () => {} });
      await settle();
      expect(node.querySelector('.standing')!.getAttribute('data-state')).toBe(status.kind);
    });

  /* §6.8: blocked is drawn, not removed. All three products dropped the
     buttons they could not offer and thereby moved the row under the pointer
     and sent focus to the document. */
  it.each(EVERY_STATUS.map((s) => [named(s), s] as const))(
    'keeps all four buttons and disables what it cannot offer, %s',
    async (_name, status) => {
      const node = render(MetacomPanel, { metacom: stub(status), say: () => {} });
      await settle();
      const acts = [...node.querySelectorAll<HTMLButtonElement>('.acts button')];
      expect(acts).toHaveLength(4);
      // "Read again" wants a folder that is readable; "forget" wants one stored.
      expect(acts[2]!.disabled).toBe(status.kind !== 'ready');
      const nothing = status.kind === 'needs-setup' && status.code === 'no-folder';
      expect(acts[3]!.disabled).toBe(nothing);
    });

  it('offers only what actions names, and still draws them disabled', async () => {
    const node = render(MetacomPanel, {
      metacom: stub({ kind: 'needs-setup', code: 'no-folder' }),
      say: () => {},
      actions: ['choose', 'forget'],
    });
    await settle();
    const acts = [...node.querySelectorAll<HTMLButtonElement>('.acts button')];
    expect(acts).toHaveLength(2);
    expect(acts[1]!.disabled).toBe(true);
  });

  /* The licence paragraph is a legal claim rather than a wording, and it is the
     one sentence in this package nobody would think to diff. It is imported
     from the vanilla panel, and this is the assertion that says so. */
  it('says the licence in the same words the vanilla panel does', async () => {
    const vanilla = metacomPanel({ metacom: stub({ kind: 'ready' }), say: () => {} });
    const twin = render(MetacomPanel, { metacom: stub({ kind: 'ready' }), say: () => {} });
    await settle();
    const licence = (root: Element) => root.querySelector('p.notice')!.textContent;
    expect(licence(twin)).toBe(licence(vanilla.node));
    expect(licence(twin)).toContain('überträgt niemals METACOM-Dateien');
    vanilla.dispose();
  });

  it('unsubscribes when it goes, without a dispose() to call', async () => {
    let live = 0;
    /* The cast is `stub`'s, for `stub`'s reason: a spread of a class instance
       is a plain object, and `MetacomProvider` has private fields, so nothing
       assembled out here is ever that type. It is also why the stubs cannot be
       what proves the seam — `test/fixtures/ConsumerCallSite.svelte` does. */
    const metacom = {
      ...stub({ kind: 'ready' }),
      subscribe: () => { live += 1; return () => { live -= 1; }; },
    } as unknown as MetacomProvider;
    const host = document.createElement('div');
    document.body.append(host);
    const instance = mount(MetacomPanel, { target: host, props: { metacom, say: () => {} } });
    await settle();
    expect(live).toBe(1);
    void unmount(instance);
    await settle();
    expect(live).toBe(0);
  });
});

/* --- the search ---------------------------------------------------------- */

const HITS: Candidate[] = [
  { id: 'a', label: 'ja', score: 60 },
  { id: 'b', label: 'ja', score: 55 },
  { id: 'c', label: 'trinken', score: 40 },
];

interface Asked { terms: string[] }

function source(
  { attribution = null as string | null, hits = HITS, answer }:
  { attribution?: string | null; hits?: Candidate[]; answer?: (term: string) => Promise<Candidate[]> } = {},
): SymbolProvider & Asked {
  const terms: string[] = [];
  return {
    terms,
    id: attribution ? 'arasaac' : 'metacom',
    name: 'stub',
    attribution,
    status: () => ({ kind: 'ready' }),
    isReady: () => true,
    search: (term: string) => { terms.push(term); return answer ? answer(term) : Promise.resolve(hits); },
    getImageUrl: async (id: string) => `blob:${id}`,
    labelFor: async () => null,
  };
}

const type = (field: HTMLInputElement, value: string) => {
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
};

const press = (node: Element, key: string) =>
  node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

const WORDS = { field: 'Symbol suchen' };

/* Stands in for vorlaut's prescribed start-key tile: something a product draws
   inside the results box that is a tile rather than a block around them. */
const leadTile = createRawSnippet(() => ({
  render: () => '<button type="button" id="home" class="picker__item">Start</button>',
}));

describe('svelte/SymbolSearch', () => {
  /* §6.4: the minimum is three characters and the debounce is 300ms. */
  it('does not search below the minimum, and does after the debounce', async () => {
    const provider = source();
    const node = render(SymbolSearch, { provider, words: WORDS, onpick: () => {} });
    await settle();
    const field = node.querySelector('input')!;
    type(field, 'ja');
    await settle(400);
    expect(provider.terms).toEqual([]);
    type(field, 'jal');
    await settle(100);
    expect(provider.terms).toEqual([]);
    await settle(350);
    expect(provider.terms).toEqual(['jal']);
  });

  /* Enter is the override: it runs the word as it stands, now, at any length.
     That is what somebody typing „Ei" needs, and the way to ask again after a
     search that failed on a dropped network. */
  it('searches on Enter below the minimum, at once', async () => {
    const provider = source();
    const node = render(SymbolSearch, { provider, words: WORDS, onpick: () => {} });
    await settle();
    const field = node.querySelector('input')!;
    type(field, 'Ei');
    press(field, 'Enter');
    await settle();
    expect(provider.terms).toEqual(['Ei']);
  });

  /* §6.4, and a test in bildhaft asserts it: Enter in the field calls
     preventDefault AND stopPropagation. Without the second, bildhaft's
     sheet-level handler treats the key as Fertig and closes the picker over the
     search that is the reason it is open. */
  it('keeps Enter inside the field, away from a handler on an ancestor', async () => {
    const provider = source();
    const sheet = document.createElement('div');
    document.body.append(sheet);
    let reachedTheSheet = 0;
    sheet.addEventListener('keydown', () => { reachedTheSheet += 1; });
    mounted.push(mount(SymbolSearch, {
      target: sheet, props: { provider, words: WORDS, onpick: () => {} },
    }) as Record<string, unknown>);
    await settle();
    const field = sheet.querySelector('input')!;
    type(field, 'wort');
    const went = press(field, 'Enter');
    expect(reachedTheSheet).toBe(0);
    // preventDefault as well: the browser would otherwise close the dialog.
    expect(went).toBe(false);
  });

  /* §6.4: `onpick` is handed the word that found the picture, not the field's
     current value. A search for „trinken" landing on a pictogram filed under
     „Getränk" used to name the key „Getränk". */
  it('hands onpick the word that found the picture', async () => {
    const provider = source();
    const picked: Array<[string, string]> = [];
    const node = render(SymbolSearch, {
      provider, words: WORDS, onpick: (c: Candidate, searched: string) => picked.push([c.id, searched]),
    });
    await settle();
    const field = node.querySelector('input')!;
    type(field, 'trinken');
    press(field, 'Enter');
    await settle();
    // Three more letters typed and not yet answered: the tiles on screen are
    // still the answer to „trinken", and that is what a pick is named for.
    field.value = 'trinkenxyz';
    node.querySelectorAll<HTMLButtonElement>('button.picker__item')[0]!.click();
    expect(picked).toEqual([['a', 'trinken']]);
  });

  /* §6.4: the stale-answer guard is not optional. wochenwerk has none, and two
     in-flight searches there land in whatever order they resolve. */
  it('drops an answer that is not the current one', async () => {
    const slow = new Map<string, (hits: Candidate[]) => void>();
    const provider = source({
      answer: (term) => new Promise<Candidate[]>((done) => slow.set(term, done)),
    });
    const node = render(SymbolSearch, { provider, words: WORDS, onpick: () => {} });
    await settle();
    const field = node.querySelector('input')!;
    type(field, 'erste');
    press(field, 'Enter');
    type(field, 'zweite');
    press(field, 'Enter');
    await settle();

    slow.get('zweite')!([{ id: 'new', label: 'zweite', score: 10 }]);
    await settle();
    // The first search lands second, and must change nothing.
    slow.get('erste')!([{ id: 'old', label: 'erste', score: 99 }]);
    await settle();

    const tiles = [...node.querySelectorAll('button.picker__item')];
    expect(tiles).toHaveLength(1);
    expect(tiles[0]!.getAttribute('aria-label')).toBe('zweite');
  });

  /* §6.4: `busy` suppresses the component's own field and grid. bildhaft hides
     everything while a crop is in progress and asserts it — and a snippet
     around the component cannot hide what is inside it. */
  it('suppresses its own field and grid while busy', async () => {
    const provider = source({ attribution: '© ARASAAC' });
    const node = render(SymbolSearch, {
      provider, words: WORDS, suggestions: HITS, busy: true, onpick: () => {},
    });
    await settle();
    expect(node.querySelector('input')!.hidden).toBe(true);
    expect(node.querySelector<HTMLElement>('.picker__grid')!.hidden).toBe(true);
    expect(node.querySelector<HTMLElement>('p')!.hidden).toBe(true);
  });

  /* §6.4: bildhaft's suggestions are not a block above the grid. They go into
     the same results list, and they are declined once anything is searched. */
  it('shows the suggestions until something has been searched', async () => {
    const provider = source({ hits: [{ id: 'z', label: 'gefunden', score: 1 }] });
    const node = render(SymbolSearch, {
      provider, words: WORDS, suggestions: HITS, onpick: () => {},
    });
    await settle();
    expect(node.querySelectorAll('button.picker__item')).toHaveLength(3);
    const field = node.querySelector('input')!;
    type(field, 'gefunden');
    press(field, 'Enter');
    await settle();
    expect([...node.querySelectorAll('button.picker__item')]
      .map((b) => b.getAttribute('aria-label'))).toEqual(['gefunden']);
    // And emptying the field hands the box back to them.
    type(field, '');
    await settle();
    expect(node.querySelectorAll('button.picker__item')).toHaveLength(3);
  });

  /* §6.4: `chosen` marks the stored choice, which bildhaft draws as an active
     tile. The class and not `aria-pressed` — components.css says why. */
  it('marks the stored choice', async () => {
    const node = render(SymbolSearch, {
      provider: source(), words: WORDS, suggestions: HITS, chosen: 'b', onpick: () => {},
    });
    await settle();
    const tiles = [...node.querySelectorAll('button.picker__item')];
    expect(tiles.map((t) => t.classList.contains('picker__item--active')))
      .toEqual([false, true, false]);
    expect(tiles[1]!.hasAttribute('aria-pressed')).toBe(false);
  });

  /* §6.4: the twin disambiguation is a convergence. The component says that a
     label is repeated; what the disambiguator is stays the product's. */
  it('tells the caller which labels are repeated in this answer', async () => {
    const seen = new Map<string, boolean>();
    render(SymbolSearch, {
      provider: source(), words: WORDS, suggestions: HITS, onpick: () => {},
      describe: (c: Candidate, among: boolean) => { seen.set(c.id, among); return c.label; },
    });
    await settle();
    expect([...seen]).toEqual([['a', true], ['b', true], ['c', false]]);
  });

  /* §6.4: the credit line is computed from the source and not from the
     results, so a search that found nothing still says where the pictograms
     come from — and under METACOM the attribution is empty and nothing is drawn
     rather than an empty paragraph. */
  it('credits the source even when nothing was found', async () => {
    const provider = source({ attribution: '© ARASAAC', hits: [] });
    const node = render(SymbolSearch, { provider, words: WORDS, onpick: () => {} });
    await settle();
    const field = node.querySelector('input')!;
    type(field, 'nichts');
    press(field, 'Enter');
    await settle();
    expect(node.querySelectorAll('button.picker__item')).toHaveLength(0);
    expect(node.querySelector('p')!.textContent).toBe('© ARASAAC');
  });

  it('draws nothing at all where the source owes nothing', async () => {
    const node = render(SymbolSearch, {
      provider: source(), words: WORDS, suggestions: HITS, onpick: () => {},
    });
    await settle();
    expect(node.querySelector('p')).toBeNull();
    // And it is not bildhaft's class, which is a different assertion there.
    expect(node.querySelector('.footer__credit')).toBeNull();
  });

  /* §6.4: the field claims Escape, because `<input type="search">` swallows the
     first one to clear itself — and the fix is the caller's rather than
     Sheet's, since wochenwerk nests two search fields in one sheet. */
  it('hands Escape to onescape, prevented, and leaves the field alone', async () => {
    let escaped = 0;
    const node = render(SymbolSearch, {
      provider: source(), words: WORDS, onpick: () => {}, onescape: () => { escaped += 1; },
    });
    await settle();
    const field = node.querySelector('input')!;
    type(field, 'wort');
    expect(press(field, 'Escape')).toBe(false);
    expect(escaped).toBe(1);
  });

  it('leaves Escape to the browser when nobody has asked for it', async () => {
    const node = render(SymbolSearch, { provider: source(), words: WORDS, onpick: () => {} });
    await settle();
    expect(press(node.querySelector('input')!, 'Escape')).toBe(true);
  });

  /* §6.4: all four arrows call preventDefault even when nothing moves, or the
     scroll box scrolls out from under the focused tile. And Up off the top row
     comes back to the field, which is where somebody who has changed their mind
     about the word is going.
     What cannot be asserted here is where Up and Down land: they are read off
     `offsetTop`, and jsdom lays nothing out, so every tile is on row 0. The
     reading is deliberate — a taller lead tile breaks arithmetic in fours — and
     it is checked in the products, which have layout. */
  it('walks the tiles with the arrows and hands the top row back to the field', async () => {
    const node = render(SymbolSearch, {
      provider: source(), words: WORDS, suggestions: HITS, onpick: () => {},
    });
    await settle();
    const tiles = [...node.querySelectorAll<HTMLElement>('button.picker__item')];
    const field = node.querySelector('input')!;

    // The box is one tab stop, at the first tile.
    expect(tiles.map((t) => t.tabIndex)).toEqual([0, -1, -1]);

    field.focus();
    expect(press(field, 'ArrowDown')).toBe(false);
    expect(document.activeElement).toBe(tiles[0]);

    expect(press(tiles[0]!, 'ArrowRight')).toBe(false);
    expect(document.activeElement).toBe(tiles[1]);
    expect(tiles.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);

    // Claimed even at the edge, where nothing moves.
    tiles[2]!.focus();
    expect(press(tiles[2]!, 'ArrowRight')).toBe(false);
    expect(document.activeElement).toBe(tiles[2]);

    expect(press(tiles[2]!, 'ArrowUp')).toBe(false);
    expect(document.activeElement).toBe(field);
  });

  /* The lead snippet's tile joins the ring by carrying the class, which is what
     vorlaut's prescribed start-key tile is: index 0, and not a block above the
     box that the arrows would skip. */
  it('lets a lead tile be index 0 of the ring', async () => {
    const node = render(SymbolSearch, {
      provider: source(), words: WORDS, suggestions: HITS, onpick: () => {},
      lead: leadTile,
    });
    await settle();
    const tiles = [...node.querySelectorAll<HTMLElement>('button.picker__item')];
    expect(tiles).toHaveLength(4);
    expect(tiles[0]!.id).toBe('home');
    expect(tiles[0]!.tabIndex).toBe(0);
  });
});

/* --- the seam ------------------------------------------------------------ */

/**
 * The one thing in this file that is not about what a component draws.
 *
 * A shipped component that imports its own package's `src/` is green in this
 * repository and red in every product: `exports` has no `./src/*` entry, the
 * consumer holds the `dist` declarations, and `tsc` writes `#private;` into a
 * class's, so `src/metacom.ts`'s `MetacomProvider` and `dist/index.d.ts`'s are
 * two types that share a name and nothing else. The suite was blind to it for
 * exactly one reason — it imported from `../src/` as well. These three cases
 * are the fix for the blindness rather than for the defect, and all three go
 * red if somebody reaches into `src/` again.
 */
describe('the components import what a consumer imports', () => {
  /* The compile half is the fixture, which `svelte-check` reads and `tsc`
     cannot: `test/fixtures/ConsumerCallSite.svelte` annotates a provider as the
     published `MetacomProvider` and hands it to the panel. Mounting it here
     says the same thing at runtime, so the fixture is a live call site and not
     a file only a typechecker visits. */
  it('takes a provider a consumer is holding, and draws its status', async () => {
    const node = render(ConsumerCallSite, {});
    await settle();
    expect(node.id).toBe('consumer-call-site');
    expect(node.querySelector('.standing')!.getAttribute('data-state'))
      .toBe('needs-setup');
  });

  /**
   * And the half a typecheck cannot see.
   *
   * `MetacomPanel` reaches `MetacomProvider` as a **value**, for the static
   * `supportsPersistentPicker` — which is why bildhaft's build succeeded while
   * shipping two copies of the class, +12.9 kB raw and +3.7 kB gz. Two copies
   * is not something markup can be asked about, so this asks the only question
   * that separates them: redefine the static on the *published* class and see
   * whether the panel notices. It does only if it holds that class and not a
   * second one compiled from source.
   *
   * Stubbing `globalThis.showDirectoryPicker` instead would prove nothing —
   * both copies read the same global and would agree.
   */
  it('reads its static off the published class, not a second copy of it', async () => {
    /* The third note is the footnote: "this browser does not remember the
       folder", hidden exactly when the picker persists. jsdom has no
       `showDirectoryPicker`, so it starts visible. */
    const footnote = (root: Element) =>
      root.querySelectorAll('.metacom-panel__note')[2]!.hasAttribute('hidden');

    expect(footnote(render(MetacomPanel, { metacom: stub({ kind: 'ready' }), say: () => {} })))
      .toBe(false);

    const real = Object.getOwnPropertyDescriptor(MetacomProvider, 'supportsPersistentPicker')!;
    Object.defineProperty(MetacomProvider, 'supportsPersistentPicker',
      { configurable: true, get: () => true });
    try {
      const node = render(MetacomPanel, { metacom: stub({ kind: 'ready' }), say: () => {} });
      await settle();
      expect(footnote(node)).toBe(true);
    } finally {
      Object.defineProperty(MetacomProvider, 'supportsPersistentPicker', real);
    }
  });

  /* The guard for the next component, which is cheaper than either of the
     above and is the one that will catch it: a shipped `.svelte` may not name
     `../src/` at all. Whatever it wants is either behind a published entry or
     is not a thing a consumer can be given. */
  it('names no ../src/ import in anything under svelte/', () => {
    /* `process.cwd()` rather than `import.meta.url`, which is not a `file:`
       URL under the jsdom environment this file runs in. vitest's cwd is the
       package root. */
    const dir = join(process.cwd(), 'svelte');
    const offenders = readdirSync(dir)
      .filter((name) => name.endsWith('.svelte') || name.endsWith('.ts'))
      .flatMap((name) => {
        const text = readFileSync(join(dir, name), 'utf8');
        return [...text.matchAll(/^\s*(?:import|export)[^\n]*?from\s+'(\.\.\/src\/[^']+)'/gm)]
          .map((m) => `${name}: ${m[1]}`);
      });
    expect(offenders).toEqual([]);
  });
});
