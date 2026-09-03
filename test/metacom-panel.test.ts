// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  headlineFor, metacomPanel, stateLineFor, type MetacomAction, type PanelLang,
} from '../src/metacom-panel.js';
import type { MetacomProvider } from '../src/metacom.js';
import { needsAttention } from '../src/types.js';
import type { Failed, Loading, NeedsSetup, ProviderStatus } from '../src/types.js';

/*
 * The panel three products drew for themselves.
 *
 * What is asserted here is what the three copies disagreed about, rather than
 * that the module runs: both languages carrying every code, the language being
 * read on every paint, §3.7's rule that a state needing attention always hands
 * somebody a button, and a blocked action being drawn rather than deleted. A
 * test that only mounted the node would have passed against all three copies,
 * including the two that lose the keyboard's place when a folder arrives.
 */

/** Just enough of a MetacomProvider to paint against, with a status we control. */
function stub(status: ProviderStatus, facts: { count?: number; root?: string } = {}) {
  const listeners = new Set<() => void>();
  const provider = {
    status: () => provider.state,
    isReady: () => provider.state.kind === 'ready',
    symbolCount: facts.count ?? 0,
    rootName: facts.root ?? '',
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    requestPermission: vi.fn(async () => true),
    pickDirectory: vi.fn(async () => {}),
    useFileList: vi.fn(async () => {}),
    useZip: vi.fn(async () => {}),
    rebuildIndex: vi.fn(async () => {}),
    forget: vi.fn(async () => {}),
    state: status,
    /** Move to another state the way the provider would, listeners and all. */
    go(next: ProviderStatus) {
      provider.state = next;
      for (const listener of listeners) listener();
    },
    get listenerCount() { return listeners.size; },
  };
  return provider;
}

const mount = (
  provider: ReturnType<typeof stub>,
  extra: { lang?: PanelLang | (() => PanelLang); actions?: readonly MetacomAction[] } = {},
) => {
  const said: [string, MetacomAction][] = [];
  const heads: string[] = [];
  const panel = metacomPanel({
    metacom: provider as unknown as MetacomProvider,
    say: (line, action) => said.push([line, action]),
    headline: (text) => heads.push(text),
    ...extra,
  });
  return { panel, said, heads };
};

const buttons = (panel: { node: HTMLElement }) =>
  [...panel.node.querySelectorAll<HTMLButtonElement>('.acts .btn')];
const labels = (panel: { node: HTMLElement }) => buttons(panel).map((b) => b.textContent);

const NEEDS_SETUP: NeedsSetup[] = ['no-folder', 'permission-needed'];
const LOADING: Loading[] = ['reading-folder', 'unpacking-zip', 'indexing'];
const FAILED: Failed[] = ['no-images', 'read-failed', 'network'];

const EVERY_STATUS: ProviderStatus[] = [
  { kind: 'ready' },
  ...NEEDS_SETUP.map((code) => ({ kind: 'needs-setup', code }) as const),
  ...LOADING.map((code) => ({ kind: 'loading', code }) as const),
  ...FAILED.map((code) => ({ kind: 'error', code }) as const),
];

describe('the words', () => {
  /*
   * Both languages, every state. §5's own note on the backup extraction says
   * why this is asserted twice over: vorlaut's first version of the equivalent
   * test ran in whichever language the runner picked, so taking a whole clause
   * out of the German string left it green.
   */
  it.each(['de', 'en'] as const)('has a sentence for every status in %s', (lang) => {
    for (const status of EVERY_STATUS) {
      const line = stateLineFor(status, 12, 'METACOM_9', lang);
      expect(line, `${status.kind}/${'code' in status ? status.code : '-'}`).not.toBe('');
      expect(line).not.toContain('undefined');
    }
  });

  it('says how many and out of where, not one or the other', () => {
    expect(stateLineFor({ kind: 'ready' }, 4812, 'METACOM_9_Desktop', 'de'))
      .toBe('4812 Symbole aus „METACOM_9_Desktop“');
    expect(stateLineFor({ kind: 'ready' }, 4812, 'METACOM_9_Desktop', 'en'))
      .toBe('4812 symbols from “METACOM_9_Desktop”');
  });

  /*
   * The English arm was translated from the German one by hand next door and
   * the German quotation marks came with it, in two strings, for as long as
   * they existed.
   *
   * The two share a character, which is the reason this reads as it does:
   * German is „…“ and English is “…”, so U+201C is the *closing* mark of one
   * and the *opening* mark of the other. Only the opening marks tell them
   * apart, and a check written against both curly doubles would fail on
   * correct English.
   */
  it('keeps each language’s quotation marks in its own arm', () => {
    for (const status of EVERY_STATUS) {
      expect(stateLineFor(status, 12, 'METACOM_9', 'en')).not.toMatch(/„/);
      expect(headlineFor(status, 12, 'METACOM_9', 'en')).not.toMatch(/„/);
      expect(stateLineFor(status, 12, 'METACOM_9', 'de')).not.toMatch(/”/);
      expect(headlineFor(status, 12, 'METACOM_9', 'de')).not.toMatch(/”/);
    }
  });
});

describe('the heading', () => {
  /* conventions.md §3.7: the heading carries the state, never the instruction.
     A summary is one line and truncates, which is how bildhaft's arrived as its
     own first half and stopped mid-clause. */
  it('carries a state and not the sentence about what to press', () => {
    const head = headlineFor({ kind: 'needs-setup', code: 'permission-needed' }, 0, 'METACOM_9');
    expect(head).toContain('Zugriff bestätigen');
    expect(head).not.toContain('zwischen Besuchen');
  });

  /* Nothing is wrong with not owning a licence, and a column of folded panels
     must not read as a list of things that are. */
  it('is blank when no folder has ever been chosen', () => {
    expect(headlineFor({ kind: 'needs-setup', code: 'no-folder' }, 0, '')).toBe('');
  });

  it('tells the heading on every paint, blank included', () => {
    const provider = stub({ kind: 'needs-setup', code: 'no-folder' },
      { count: 4812, root: 'METACOM_9' });
    const { heads } = mount(provider);
    expect(heads).toEqual(['']);
    provider.go({ kind: 'ready' });
    expect(heads.at(-1)).toBe('Ordner „METACOM_9“ · 4812 Symbole');
  });
});

describe('the language is read on every paint', () => {
  /* backup-panel's rule, and the reason it is a rule: two of the three consumers
     change language without reloading, and a locale captured once goes on
     answering in the language the reader has just left — perfectly well-formed
     the whole time, which is what makes it hard to notice. */
  it('follows a function between paints', () => {
    let lang: PanelLang = 'de';
    const provider = stub({ kind: 'needs-setup', code: 'no-folder' });
    const { panel } = mount(provider, { lang: () => lang });
    expect(labels(panel)).toContain('Ordner wählen');
    lang = 'en';
    panel.refresh();
    expect(labels(panel)).toContain('Choose folder');
  });
});

describe('what is offered', () => {
  /*
   * conventions.md §3.7's closing rule, and the pair of packages exists to make
   * it impossible to break: a panel that says something is wrong and hands
   * nobody a button is the failure.
   */
  it.each(EVERY_STATUS.filter((status) => needsAttention(status)))(
    'offers something enabled to press in $kind/$code', (status) => {
      const { panel } = mount(stub(status, { root: 'METACOM_9' }));
      expect(buttons(panel).filter((b) => !b.disabled).length).toBeGreaterThan(0);
    },
  );

  /*
   * The rule bildhaft argued for a source that cannot draw and then did not
   * apply to its own buttons. All three products delete an act that cannot run;
   * a row that changes width and order under the pointer as a folder arrives is
   * how a keyboard loses its place, and a control that is not there says
   * nothing where a disabled one says the act exists.
   */
  it('draws a blocked act rather than removing it', () => {
    const { panel } = mount(stub({ kind: 'needs-setup', code: 'no-folder' }));
    expect(labels(panel)).toEqual([
      'Ordner wählen', 'ZIP einlesen', 'Neu einlesen', 'Ordner vergessen',
    ]);
    const [, , reread, forget] = buttons(panel);
    expect(reread!.disabled).toBe(true);
    expect(forget!.disabled).toBe(true);
  });

  it('unblocks them once a folder answers, without moving anything', () => {
    const provider = stub({ kind: 'needs-setup', code: 'no-folder' });
    const { panel } = mount(provider);
    const before = labels(panel);
    provider.go({ kind: 'ready' });
    expect(labels(panel)).toEqual(before.map((l) => l === 'Ordner wählen' ? 'Anderen Ordner wählen' : l));
    expect(buttons(panel).every((b) => !b.disabled)).toBe(true);
  });

  /* There is a stored handle to drop in every state but „no folder yet" —
     including the two that need attention, which is exactly when somebody wants
     the button. */
  it('lets a folder that needs attention be forgotten', () => {
    const { panel } = mount(stub({ kind: 'error', code: 'read-failed' }, { root: 'X' }));
    expect(buttons(panel).at(-1)!.disabled).toBe(false);
  });

  /*
   * A product may genuinely not have one — vorlaut-editor has no ZIP door on
   * screen. What it must not do is get a button it cannot wire up.
   */
  it('leaves out an act the product does not offer', () => {
    const { panel } = mount(stub({ kind: 'ready' }), { actions: ['choose', 'forget'] });
    expect(labels(panel)).toEqual(['Anderen Ordner wählen', 'Ordner vergessen']);
  });
});

describe('the one way in', () => {
  /*
   * vorlaut-editor's order, and §3.7's third sentence is only true because of
   * it: a stored handle whose permission Chromium withdrew comes back with no
   * picker at all. bildhaft always opened the picker, so every return visit
   * cost re-picking the folder; wochenwerk grew a second button instead.
   */
  it('re-confirms a stored handle before opening a picker', async () => {
    const provider = stub({ kind: 'needs-setup', code: 'permission-needed' }, { root: 'METACOM_9' });
    const { panel } = mount(provider);
    const choose = buttons(panel)[0]!;
    expect(choose.textContent).toBe('Zugriff bestätigen');
    choose.click();
    await vi.waitFor(() => expect(provider.requestPermission).toHaveBeenCalled());
    expect(provider.pickDirectory).not.toHaveBeenCalled();
  });

  it('names itself for what is missing', () => {
    expect(labels(mount(stub({ kind: 'needs-setup', code: 'no-folder' })).panel)[0])
      .toBe('Ordner wählen');
    expect(labels(mount(stub({ kind: 'ready' })).panel)[0])
      .toBe('Anderen Ordner wählen');
  });
});

describe('what it says out loud', () => {
  it('reports the action, and lets the product add to the sentence', async () => {
    const provider = stub({ kind: 'ready' }, { root: 'METACOM_9' });
    const { panel, said } = mount(provider);
    buttons(panel)[2]!.click();
    await vi.waitFor(() => expect(said).toHaveLength(1));
    expect(said[0]).toEqual(['Der Ordner wurde neu eingelesen.', 'reread']);
  });

  /* „entfernt" was bildhaft's word and it says the wrong thing: nothing is
     removed from anybody's disk. The backup panel next door already says what
     stops happening, and this is that sentence's twin. */
  it('says what stops rather than what was deleted', async () => {
    const provider = stub({ kind: 'ready' }, { root: 'METACOM_9' });
    const { panel, said } = mount(provider);
    buttons(panel).at(-1)!.click();
    await vi.waitFor(() => expect(said).toHaveLength(1));
    expect(said[0]![0]).toBe('Der METACOM-Ordner wird nicht mehr gelesen.');
  });
});

describe('the block itself', () => {
  /*
   * Every class this module emits, against the list @lautstark/design draws.
   * conventions.md §4.12: a shared module that emits markup brings its CSS, and
   * the way that rule is broken is by reaching for a name one product happens
   * to have — `.small`, `.muted`, `.faint`, `.opt` are bildhaft's and nothing
   * in components.css draws any of them.
   */
  it('emits only class names components.css owns', () => {
    const { panel } = mount(stub({ kind: 'error', code: 'read-failed' }, { root: 'X' }));
    const drawn = new Set([
      'metacom-panel', 'metacom-panel__note', 'notice', 'bad', 'standing', 'dot',
      'acts', 'btn', 'sm', 'primary', 'quiet', 'destructive',
    ]);
    for (const node of panel.node.querySelectorAll('[class]')) {
      for (const name of node.classList) expect(drawn, name).toContain(name);
    }
    expect([...panel.node.classList]).toEqual(['metacom-panel']);
  });

  /* The status kind verbatim, because a mapping here would be a chance to
     disagree with the stylesheet about what `error` looks like. */
  it('hands the stylesheet the status kind, unmapped', () => {
    const provider = stub({ kind: 'needs-setup', code: 'no-folder' });
    const { panel } = mount(provider);
    const line = panel.node.querySelector('.standing')!;
    expect(line.getAttribute('data-state')).toBe('needs-setup');
    provider.go({ kind: 'loading', code: 'indexing' });
    expect(line.getAttribute('data-state')).toBe('loading');
  });

  /* Three of the four products the backup panel replaced never unsubscribed, so
     a settings dialog thrown away and built again left a listener painting a
     detached node, once per open. */
  it('hands back a dispose that actually unsubscribes', () => {
    const provider = stub({ kind: 'ready' });
    const { panel } = mount(provider);
    expect(provider.listenerCount).toBe(1);
    panel.dispose();
    expect(provider.listenerCount).toBe(0);
  });

  /* Shown on an English page only: METACOM's ids are the file names in
     somebody's own German copy, and saying so is the difference between a
     source that looks broken and one that was never going to answer. */
  it('explains the German file names to an English reader alone', () => {
    const german = (lang: PanelLang) => mount(stub({ kind: 'ready' }), { lang })
      .panel.node.querySelectorAll('.metacom-panel__note')[1] as HTMLElement;
    expect(german('de').hidden).toBe(true);
    expect(german('en').hidden).toBe(false);
  });
});
