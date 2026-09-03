/*
 * The panel that adopts somebody's own licensed METACOM folder — once, for
 * every product.
 *
 * `@lautstark/sicherung/backup-panel` is the precedent and the shape: a module
 * that hands back a finished block, carries its own words in both languages,
 * and leaves the product only what the product alone knows. This is the same
 * correction applied to the *other* folder in the family — conventions.md §4.9
 * names the two, and the symbol folder was the one still drawn three times.
 *
 * ## What was measured, on 2026-09-03
 *
 * Read side by side: bildhaft `src/ui/settingsDialog.ts` (the METACOM arm of
 * `paintSources`) with `src/ui/symbolSources.ts` behind it, wochenwerk
 * `src/views/settings-dialog.ts` (the „Symbole" panel), vorlaut-editor
 * `src/shell/settings.ts` (`renderHere` / `wireSymbolFolder`) with its words in
 * `src/core/boot_data.ts` under `ui.metacom_*`.
 *
 * | | bildhaft | wochenwerk | vorlaut-editor |
 * | --- | --- | --- | --- |
 * | choose a folder | „Symbolordner wählen" | „Anderen Ordner wählen" / „Ordner wählen" / „Ordner hochladen" | „Ordner wählen" |
 * | read a ZIP | „ZIP einlesen" | „ZIP lesen" | — (see below) |
 * | read again | „Neu einlesen" | „Neu einlesen" | — |
 * | forget | „Symbolordner vergessen" | „Ordner vergessen" | „Vergessen" |
 * | state line | `{n} Symbole · {root}` | heading only: `METACOM aus „{root}"` | `{count} Symbole aus {root}` |
 * | licence notice | a full paragraph, in `.notice` | one line about sharing an Ablage | a paragraph plus a link to the licence shop |
 * | permission lost | §3.7's three sentences | reuses the status line | §3.7's three sentences, near-identical wording |
 * | confirm access | no button; the choose button does it | „Erneut erlauben", its own button | no button; the choose button tries `requestPermission()` first |
 * | index kind | — | — | „mit Schlagwörtern" / „nur Dateinamen" |
 *
 * ## What was taken, and from whom
 *
 * - **The block, the state line and the heading callback: bildhaft's**, by way
 *   of `backup-panel`. bildhaft is the only one of the three that put the state
 *   in the panel's own summary, which is the only thing that keeps „a folder is
 *   set up" and „a folder is set up and unreadable" apart without unfolding it.
 * - **The choose button's mechanism: vorlaut-editor's.** Try
 *   `requestPermission()` on the stored handle first and only open a picker
 *   when there is nothing stored. bildhaft always opens the picker, which costs
 *   a re-pick on every Chromium visit; wochenwerk grew a second button for it.
 *   One button, three labels, and §3.7's "what one press does" is then true.
 * - **The file-input fallback: wochenwerk's and vorlaut-editor's.** A real
 *   `<button>` that clicks a hidden input. bildhaft uses a `<label class="btn">`
 *   wrapping the input, which no keyboard can reach — a label is not a control.
 * - **The licence link: vorlaut-editor's.** Nobody who does not have a licence
 *   can use this panel, and it was the only product that said where one comes
 *   from.
 * - **„Anderen Ordner wählen": wochenwerk's.** It is the only product that
 *   noticed the button asks a different question once a folder is already read.
 * - **Not shown unless the page is English: bildhaft's** `metacom_german_only`.
 *   METACOM's ids are the filenames in somebody's own German copy, and on an
 *   English page that is the difference between a source that looks broken and
 *   one that was never going to answer.
 *
 * ## What deliberately stays with the product
 *
 * - **Which source is the active/default one.** bildhaft moves a default and
 *   says what that did to the page; vorlaut-editor writes `activeProvider`;
 *   wochenwerk has no such setting at all. That is three models, not three
 *   spellings — conventions.md §4-shaped — and `after()` is where a product
 *   does it.
 * - **The rendering chooser.** All three have one and all three build it out of
 *   their own menu component: bildhaft a `<select class="field">`, the other two
 *   a `.menu` dropdown. Sharing it means sharing a menu, which is
 *   `@lautstark/design/menu`'s subject and not this one.
 * - **Where the folder is expected to live.** wochenwerk's tree drawing tells
 *   somebody to drop METACOM *into the Ablage*, so that every device that
 *   reaches the Ablage draws with it. Nothing else in the family has an Ablage
 *   holding the store, so nothing else has that sentence to say.
 * - **What forgetting leaves behind.** `say()` is handed the module's sentence
 *   and the action, so bildhaft can go on saying that the open Sammlung is now
 *   pointed at a source that cannot answer.
 *
 * ## The index kind is not here, and that is a finding rather than an omission
 *
 * The task this module was built to sheds one item: „mit Schlagwörtern" /
 * „nur Dateinamen". It exists in vorlaut-editor alone, and it is **dead text**.
 * `src/backend/local.ts` `readSettings()` writes `keywords: false` as a literal
 * — the whole `settings.metacom` record is rebuilt from the browser provider
 * there — so `ui.metacom_keywords` has been unreachable since the search moved
 * into the browser. It is a leftover from the Python build, where a collection
 * could ship a keyword table beside it.
 *
 * A browser-read folder has no keywords to have: `metacom.ts` indexes file
 * names and nothing else, by construction, because the index is the only thing
 * about a licensed folder this package is allowed to keep. So a line offering
 * two answers here could only ever print one of them, and printing "file names
 * only" beside a count invites the question "as opposed to what?" — to which
 * there is no answer. Left out on purpose. vorlaut-editor's own dead arm is
 * its to delete; this module is not the place it disappears from.
 *
 * ## The words are the panel's, and that is not a contradiction
 *
 * README.md says this package returns codes and never sentences, and it is
 * right — about `ProviderStatus`, whose `message` field was removed in 2.0.0
 * for exactly that reason. A *status code* is a fact a host has to phrase in
 * its own voice and its own language, at whichever of its three sites it turns
 * up. The fixed furniture of one panel is the opposite kind of thing: it is the
 * panel, and a product cannot phrase it differently without the four surfaces
 * looking different, which is the whole failure a shared panel exists to
 * prevent. conventions.md §4.12 now carries the boundary in as many words.
 *
 * A code's sentence appears below anyway, because this module is the one
 * surface that shows every one of them; a host that shows a status somewhere
 * else still gets a code and no words.
 */

import { MetacomProvider } from './metacom.js';
import { needsAttention } from './types.js';
import type { ProviderStatus } from './types.js';

export type PanelLang = 'de' | 'en';

/** The four things somebody can do to a symbol folder. */
export type MetacomAction = 'choose' | 'zip' | 'reread' | 'forget';

const ALL_ACTIONS: readonly MetacomAction[] = ['choose', 'zip', 'reread', 'forget'];

export interface MetacomPanelOptions {
  /** The provider this panel is about. Its own `subscribe` drives the repaint. */
  metacom: MetacomProvider;
  /**
   * Which of the four this product offers. Defaults to all of them.
   *
   * A product may genuinely not have one — see conventions.md §4.13 for the one
   * absence in the family that was checked and turned out to be a hole rather
   * than a decision. `choose` is not optional: a panel with no way in has
   * nothing to say.
   */
  actions?: readonly MetacomAction[];
  /**
   * A value, or a function read on every paint.
   *
   * The function form is not a convenience, and it is `backup-panel`'s rule
   * carried over unchanged: bildhaft and vorlaut-editor change language without
   * reloading, and a locale captured once goes on answering in the language the
   * reader has just left — perfectly well-formed the whole time, which is what
   * makes it hard to notice. wochenwerk is German by policy and passes nothing.
   */
  lang?: PanelLang | (() => PanelLang);
  /**
   * Something to say out loud when an action finishes, and which action it was.
   *
   * Both halves, because a product usually has more to add: bildhaft appends
   * what moving the default did to the page, and says something else entirely
   * when forgetting leaves the open Sammlung pointed at nothing.
   */
  say: (line: string, action: MetacomAction) => void;
  /**
   * Told the heading line on every repaint, so the panel's own summary carries
   * the folder without being unfolded. Blank where there is nothing to say.
   *
   * Optional because a product may have no heading to put it in — but it was
   * bildhaft's alone and is the reason bildhaft read best, so the default is to
   * offer it rather than to wait for a product to ask.
   */
  headline?: (text: string) => void;
  /**
   * Run after an action succeeded and before `say`, awaited.
   *
   * This is where a product decides what the folder arriving or going means to
   * it — which source is now the default, which Sammlung has to be redrawn.
   * None of that is shared, because the three do not agree about what a
   * default is; see the header.
   */
  after?: (action: MetacomAction) => void | Promise<void>;
}

export interface MetacomPanel {
  node: HTMLElement;
  /**
   * Paint again without waiting for a status change.
   *
   * For the one thing that changes what this panel says while the status stands
   * still: the page's language.
   */
  refresh: () => void;
  /**
   * Must be called when the panel's container goes, or every rebuild adds a
   * listener painting a node nobody can see. Three of the four products the
   * backup panel replaced did not have one to call; all three of these do not
   * either, because each subscribes for its whole sheet rather than per panel.
   */
  dispose: () => void;
}

/**
 * Every word this panel can say, in one shape per language.
 *
 * Declared rather than inferred, so that a key present in one language and
 * missing from the other does not compile — `backup-panel`'s reason, and it was
 * earned: mitreden's English arm carried German quotation marks for as long as
 * it existed because nothing compared the two.
 *
 * Filled positionally rather than through a placeholder syntax. This package
 * has no `t()` and is not growing one; two of its consumers have one and two do
 * not, and a `{root}` convention here would be a third beside theirs.
 */
interface Words {
  /** The licence paragraph. Names no product — see `note` below. */
  licence: string;
  licenceLink: string;
  licenceUrl: string;
  /** Shown on an English page only. */
  germanOnly: string;
  /** Shown where the browser cannot keep the folder across visits. */
  notRemembered: string;
  /** §3.7's three sentences: what is true, what the browser did, what one press does. */
  permissionLost: string;
  ready: (count: number, root: string) => string;
  head: (count: number, root: string) => string;
  headConfirm: (root: string) => string;
  headFailed: (root: string) => string;
  status: Record<StatusCode, string>;
  choose: string;
  chooseAnother: string;
  confirm: string;
  zip: string;
  reread: string;
  forget: string;
  read: string;
  zipRead: string;
  reread_done: string;
  forgotten: string;
}

/** Every code a status can carry, taken from the package's own union. */
type StatusCode = Extract<ProviderStatus, { code: string }>['code'];

const WORDS: Record<PanelLang, Words> = {
  de: {
    /* bildhaft's paragraph with its own name taken out of it — the trick
       `backup-panel` uses and for the same reason: a noun for the product means
       a product-shaped hole in the module, and four products then write four
       sentences. „Dieses Programm" is true of a library, a calendar and a
       board. Every claim in it is one this package can actually keep, which is
       why it may be stated here at all: metacom.ts calls no network API, and
       storage.ts gives it nowhere to put bytes. */
    licence: 'METACOM ist lizenzpflichtig. Dieses Programm liefert keine METACOM-Symbole mit '
      + 'und überträgt niemals METACOM-Dateien. Du wählst deinen eigenen, lizenzierten Ordner; '
      + 'alle Bilder werden ausschließlich lokal in deinem Browser gelesen und angezeigt.',
    licenceLink: 'Woher eine Lizenz kommt',
    licenceUrl: 'https://www.metacom-symbole.de/bestellung/lizenzvarianten.html',
    germanOnly: 'METACOMs Symbole sind auf Deutsch benannt, weil die Dateinamen in deinem '
      + 'lizenzierten Ordner es sind.',
    notRemembered: 'Dieser Browser kann den Ordner nicht dauerhaft merken. Die Auswahl gilt bis '
      + 'zum Neuladen der Seite. In Chrome oder Edge ist sie einmalig.',
    permissionLost: 'Der Ordner ist gemerkt, aber dieser Browser hat den Zugriff darauf '
      + 'zurückgesetzt — das macht er zwischen Besuchen. Ein Druck auf „Zugriff bestätigen“ '
      + 'stellt ihn wieder her; neu ausgesucht werden muss nichts.',
    ready: (count, root) => `${count} Symbole aus „${root}“`,
    head: (count, root) => `Ordner „${root}“ · ${count} Symbole`,
    headConfirm: (root) => (root ? `Ordner „${root}“ · Zugriff bestätigen` : 'Zugriff bestätigen'),
    headFailed: (root) => (root ? `Ordner „${root}“ · nicht lesbar` : 'Ordner nicht lesbar'),
    status: {
      'no-folder': 'Noch kein METACOM-Ordner gewählt.',
      'permission-needed': 'Der Zugriff auf den METACOM-Ordner muss bestätigt werden.',
      'reading-folder': 'Der Ordner wird gelesen …',
      'unpacking-zip': 'Die ZIP-Datei wird entpackt …',
      'indexing': 'Die Symbole werden indiziert …',
      'no-images': 'In diesem Ordner wurden keine Bilddateien gefunden.',
      'read-failed': 'Der Ordner konnte nicht gelesen werden.',
      /* Unreachable for METACOM — nothing here makes a request, which is the
         licensing rule this package exists for. It is written out because the
         union is the union, and a missing arm would be a blank line rather
         than a compile error. */
      'network': 'Die Symbolquelle hat nicht geantwortet.',
    },
    choose: 'Ordner wählen',
    chooseAnother: 'Anderen Ordner wählen',
    confirm: 'Zugriff bestätigen',
    zip: 'ZIP einlesen',
    reread: 'Neu einlesen',
    forget: 'Ordner vergessen',
    read: 'METACOM-Ordner eingelesen.',
    zipRead: 'ZIP eingelesen.',
    reread_done: 'Der Ordner wurde neu eingelesen.',
    forgotten: 'Der METACOM-Ordner wird nicht mehr gelesen.',
  },
  en: {
    licence: 'METACOM is licensed per person. This programme ships no METACOM symbols and never '
      + 'transmits METACOM files. You point it at your own licensed folder; every picture is read '
      + 'and shown locally in your browser and nowhere else.',
    licenceLink: 'Where a licence comes from',
    licenceUrl: 'https://www.metacom-symbole.de/en/licensing.html',
    germanOnly: 'METACOM’s symbols are named in German, because the file names in your licensed '
      + 'folder are. On an English page it will match German words only.',
    notRemembered: 'This browser cannot remember the folder for next time. The choice holds until '
      + 'the page is reloaded. In Chrome or Edge it is a one-off.',
    permissionLost: 'The folder is remembered, but this browser has withdrawn access to it — it '
      + 'does that between visits. Pressing “Confirm access” restores it; nothing has to be picked '
      + 'out afresh.',
    ready: (count, root) => `${count} symbols from “${root}”`,
    head: (count, root) => `Folder “${root}” · ${count} symbols`,
    headConfirm: (root) => (root ? `Folder “${root}” · confirm access` : 'Confirm access'),
    headFailed: (root) => (root ? `Folder “${root}” · not readable` : 'Folder not readable'),
    status: {
      'no-folder': 'No METACOM folder chosen yet.',
      'permission-needed': 'Access to the METACOM folder has to be confirmed.',
      'reading-folder': 'Reading the folder …',
      'unpacking-zip': 'Unpacking the ZIP …',
      'indexing': 'Indexing the symbols …',
      'no-images': 'No image files were found in this folder.',
      'read-failed': 'The folder could not be read.',
      'network': 'The symbol source did not answer.',
    },
    choose: 'Choose folder',
    chooseAnother: 'Choose a different folder',
    confirm: 'Confirm access',
    zip: 'Read a ZIP',
    reread: 'Read again',
    forget: 'Forget folder',
    read: 'METACOM folder read.',
    zipRead: 'ZIP read.',
    reread_done: 'The folder was read again.',
    forgotten: 'The METACOM folder is no longer read.',
  },
};

/**
 * The sentence for a state, and the one line the panel's own body carries.
 *
 * `ready` is the only state with something to *report* rather than to explain,
 * and what it reports is the pair vorlaut-editor already wrote — how many, and
 * out of where. bildhaft joined the two with a middot and wochenwerk put the
 * root in its heading without the count; a sentence beats both, because a count
 * with no folder beside it is a number nobody can check.
 *
 * The root is quoted, which none of the three did. Folder names have spaces in
 * them — `METACOM_9_Desktop` does not, `METACOM 9 Symbole` does — and the whole
 * family already quotes a folder this way in `@lautstark/sicherung`.
 *
 * Exported for the test that holds both languages to every code. Nothing else
 * calls it.
 */
export function stateLineFor(
  status: ProviderStatus, count: number, root: string, lang: PanelLang = 'de',
): string {
  const say = WORDS[lang];
  return status.kind === 'ready' ? say.ready(count, root) : say.status[status.code];
}

/**
 * The one line a panel's own heading carries.
 *
 * Deliberately not `stateLineFor`: a heading is one line and truncates, and
 * conventions.md §3.7 is explicit that what goes in it is the *state* — „Zugriff
 * bestätigen" — never the instruction. bildhaft learned this by putting a whole
 * sentence in a summary and watching it stop mid-clause; vorlaut-editor's
 * `metacomWord` carries the same note in its own margin.
 *
 * `no-folder` is blank rather than „noch kein Ordner": a heading that fills
 * itself with the absence of a setting makes an unfolded column of panels read
 * as a list of things that are wrong. Nothing is wrong; nobody has a licence
 * for this yet, and may never want one.
 *
 * Exported for that assertion. Nothing else calls it.
 */
export function headlineFor(
  status: ProviderStatus, count: number, root: string, lang: PanelLang = 'de',
): string {
  const say = WORDS[lang];
  if (status.kind === 'ready') return say.head(count, root);
  if (status.kind === 'error') return say.headFailed(root);
  if (status.kind === 'loading') return say.status[status.code];
  return status.code === 'permission-needed' ? say.headConfirm(root) : '';
}

const make = (tag: string, cls?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * A hidden file input, and a real button that clicks it.
 *
 * bildhaft wraps the input in a `<label class="btn">`. It looks identical and
 * it is not the same thing: a label is not a control, so it has no tab stop and
 * no Enter, and the folder button was unreachable from the keyboard in the one
 * product whose whole subject is somebody who cannot use a mouse well.
 * wochenwerk and vorlaut-editor both use a button that clicks an input, and
 * that is what is here.
 */
function filePicker(directory: boolean, onPick: (files: File[]) => void): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'file';
  input.hidden = true;
  if (directory) {
    // Non-standard, and the only directory input Firefox and Safari offer.
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.multiple = true;
  } else {
    input.accept = '.zip,application/zip';
  }
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    // Copied out before the reset: `input.files` hands back the same FileList
    // object every time and clearing the value empties it in place, so a
    // reference read a line later is empty. vorlaut-editor's comment says the
    // same, and it was a folder that silently never got read.
    input.value = '';
    if (files.length) onPick(files);
  });
  return input;
}

/**
 * Builds the block.
 *
 * Always a node, unlike `backup-panel`, which answers null where the browser
 * has no directory picker. The difference is real rather than an oversight: a
 * backup needs a folder the page can write to and there is nothing to offer
 * without one, whereas every browser can read a folder through a file input and
 * every browser can open a ZIP. What varies is only whether the choice is
 * remembered, and `notRemembered` says so.
 */
export function metacomPanel(options: MetacomPanelOptions): MetacomPanel {
  const { metacom } = options;
  const offered = options.actions ?? ALL_ACTIONS;
  const reading = options.lang ?? 'de';
  const langNow = (): PanelLang => (typeof reading === 'function' ? reading() : reading);
  const tell = options.headline ?? (() => {});

  let busy = false;

  const licence = make('p', 'notice');
  const link = document.createElement('a');
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  const linkLine = make('p', 'metacom-panel__note');
  linkLine.append(link);
  const german = make('p', 'metacom-panel__note');
  const warning = make('p', 'notice bad');
  const line = make('p', 'standing');
  const acts = make('div', 'acts');
  const footnote = make('p', 'metacom-panel__note');

  const node = make('div', 'metacom-panel');

  const folderInput = filePicker(true, (files) => {
    void run('choose', () => metacom.useFileList(files));
  });
  const zipInput = filePicker(false, (files) => {
    void run('zip', () => metacom.useZip(files[0]!));
  });

  node.append(licence, linkLine, german, warning, line, acts, footnote, folderInput, zipInput);

  /**
   * One task, with the whole row disabled while it is in flight.
   *
   * Disabled and not hidden, and not simply left pressable: a second press
   * during a ten-thousand-file walk starts a second walk over the same folder.
   * bildhaft's `busy` flag is where this comes from; the other two have no
   * equivalent and can be pressed twice.
   */
  async function run(action: MetacomAction, task: () => Promise<unknown>): Promise<void> {
    busy = true;
    paint();
    try {
      await task();
      await options.after?.(action);
      const say = WORDS[langNow()];
      const done = action === 'choose' ? say.read
        : action === 'zip' ? say.zipRead
          : action === 'reread' ? say.reread_done
            : say.forgotten;
      options.say(done, action);
    } catch (error) {
      // An abandoned picker is a normal user action, not a failure. All three
      // products had worked this out and written it in their own margin.
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
    } finally {
      busy = false;
      paint();
    }
  }

  /**
   * What the one way in does, which depends on what is missing.
   *
   * vorlaut-editor's order, and it is the only one that makes §3.7's "what one
   * press does" true: a stored handle whose permission Chromium withdrew comes
   * back with `requestPermission()` and no picker at all. Only when there is
   * nothing stored to re-confirm does a picker open — and where the browser has
   * no persistent picker, the file input carries the errand instead.
   */
  async function choose(): Promise<void> {
    const status = metacom.status();
    if (status.kind === 'needs-setup' && status.code === 'permission-needed'
        && await metacom.requestPermission()) return;
    if (MetacomProvider.supportsPersistentPicker) await metacom.pickDirectory();
    else folderInput.click();
  }

  /**
   * A button, and whether it can do anything right now.
   *
   * **Blocked is drawn, not removed.** All three products delete the buttons
   * that cannot run — bildhaft and wochenwerk by rebuilding the row without
   * them, vorlaut-editor with `hidden` — so the row's width and the position of
   * every button in it change under the pointer as a folder arrives, and a
   * keyboard that was on „Neu einlesen" when a folder was forgotten lands back
   * on the document. It is also the poorer answer for a reader: a control that
   * is not there says nothing, and a disabled one says the act exists and is
   * not available yet. This is `symbolSources.ts`'s rule for a source that
   * cannot draw, carried across to the acts — bildhaft argued it there and then
   * did not apply it here.
   *
   * `disabled` and not `aria-disabled`: these are genuinely inert, and the
   * state line directly above says which thing is missing, so there is nothing
   * a focusable-but-refusing button could explain that is not already said.
   */
  function button(label: string, cls: string, enabled: boolean, press: () => void): HTMLElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn sm ${cls}`;
    b.textContent = label;
    b.disabled = busy || !enabled;
    b.addEventListener('click', press);
    return b;
  }

  function paint(): void {
    const lang = langNow();
    const say = WORDS[lang];
    const status = metacom.status();
    const ready = metacom.isReady();
    const root = metacom.rootName;
    const attention = needsAttention(status);

    tell(headlineFor(status, metacom.symbolCount, root, lang));

    licence.textContent = say.licence;
    link.textContent = say.licenceLink;
    link.href = say.licenceUrl;
    german.textContent = say.germanOnly;
    german.hidden = lang !== 'en';

    /* §3.7: this is drawn as a warning and never as another line of grey prose,
       and the three sentences are in the body beside the button they name — not
       in the heading, which carries the state instead. Which states deserve the
       warning is `needsAttention`, this package's own answer, so that a fifth
       surface cannot decide differently. */
    const permission = status.kind === 'needs-setup' && status.code === 'permission-needed';
    warning.hidden = !attention;
    if (!attention) warning.textContent = '';
    else if (permission) warning.textContent = say.permissionLost;
    // The other state that needs acting on is a folder that would not read.
    // `detail` is what the platform said, in whatever language it chose, so it
    // goes *beside* the translated code and never instead of it — README.md's
    // rule, and the only place in this module that shows it.
    else if (status.kind === 'error') {
      warning.textContent = status.detail
        ? `${say.status[status.code]} ${status.detail}`
        : say.status[status.code];
    }

    /* data-state takes the status kind verbatim. @lautstark/design styles the
       kinds by name, so a mapping here would be a chance to disagree with the
       stylesheet about what `error` looks like — the rule `backup-panel` keeps
       over @lautstark/sicherung's kinds, over this package's four. */
    line.setAttribute('data-state', status.kind);
    line.className = attention ? 'standing notice bad' : 'standing';
    line.replaceChildren(
      make('span', 'dot'),
      make('span', undefined, stateLineFor(status, metacom.symbolCount, root, lang)),
    );

    const rows: HTMLElement[] = [];
    if (offered.includes('choose')) {
      rows.push(button(
        permission ? say.confirm : ready ? say.chooseAnother : say.choose,
        permission || !ready ? 'primary' : 'quiet',
        true,
        () => void run('choose', choose),
      ));
    }
    if (offered.includes('zip')) {
      rows.push(button(say.zip, 'quiet', true, () => zipInput.click()));
    }
    if (offered.includes('reread')) {
      rows.push(button(say.reread, 'quiet', ready, () => void run('reread', () => metacom.rebuildIndex())));
    }
    if (offered.includes('forget')) {
      /* There is something to forget as soon as a handle is stored, which is
         every state except „no folder" — including the two that need attention,
         which is the whole reason somebody would want the button. */
      const stored = !(status.kind === 'needs-setup' && status.code === 'no-folder');
      rows.push(button(say.forget, 'destructive', stored, () => void run('forget', () => metacom.forget())));
    }
    acts.replaceChildren(...rows);

    footnote.textContent = say.notRemembered;
    footnote.hidden = MetacomProvider.supportsPersistentPicker;
  }

  paint();
  const stop = metacom.subscribe(paint);
  return { node, refresh: paint, dispose: stop };
}
