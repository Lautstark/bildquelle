<script lang="ts">
  /**
   * The panel that adopts somebody's own licensed METACOM folder, drawn by the
   * framework. conventions.md §6.8.
   *
   * The twin of `src/metacom-panel.ts` and deliberately beside it: same
   * options, same emitted markup, same words, same `WORDS` table — which is
   * imported rather than copied, so „same words" is a fact about the build and
   * not a promise in a comment. The vanilla version stays until no consumer is
   * left. Every argument behind what this draws is in that file's header, which
   * is where it belongs; what is written here is only what the port had to
   * decide.
   *
   * ## METACOM's licence is the reason this package exists, and nothing here
   * moves a byte
   *
   * No METACOM image byte is uploaded, transmitted, or written to any server
   * from this component or from anything it calls. `getImageUrl` is a URL and
   * never bytes, by construction in `types.ts`, and this panel does not even
   * ask for one: it counts symbols and names a folder. `useFileList`, `useZip`
   * and `rebuildIndex` read the user's own disk into an index of file names.
   * A path here that moved bytes would be a licensing break rather than a bug,
   * and RELEASING.md says what that costs — a major, whatever the diff size.
   *
   * ## What the port decided
   *
   * **`lang` is a value, not a function.** The vanilla panel takes
   * `PanelLang | (() => PanelLang)` because it repaints itself and a locale
   * captured once goes on answering in the language the reader has just left.
   * §6.8 removes that asymmetry: the prop is a value and the reactivity is the
   * framework's, so a product that changes language without reloading passes
   * its own `$state` and this redraws. The function form has nothing left to do
   * and is not accepted.
   *
   * **`refresh()` and `dispose()` are gone, and that is the same change.**
   * `refresh` existed for the one thing that changed the panel's words while
   * the status stood still — the page's language — which is now a prop.
   * `dispose` was the caller's obligation to unsubscribe; here the
   * subscription is an `$effect` returning its teardown, so unmounting does it.
   *
   * **The provider is not reactive and must not be made so.** `MetacomProvider`
   * is a plain object that mutates in place and tells nobody; what it has is
   * `subscribe`. So the effect below bumps a counter and everything this panel
   * reads off the provider is derived through it. The provider itself is never
   * a rune — a proxy around it would deep-watch an index of ten thousand file
   * names to learn what one callback already says.
   */
  import { MetacomProvider } from '../src/metacom.js';
  import {
    ALL_ACTIONS, WORDS, headlineFor, stateLineFor,
    type MetacomAction, type PanelLang,
  } from '../src/metacom-panel.js';
  import { needsAttention } from '../src/types.js';

  let {
    metacom,
    actions = ALL_ACTIONS,
    lang = 'de',
    say,
    headline,
    after,
    id,
  }: {
    /** The provider this panel is about. Its own `subscribe` drives the
     *  repaint — see the effect below. */
    metacom: MetacomProvider;
    /**
     * Which of the four this product offers. Defaults to all of them.
     *
     * A product may genuinely not have one — see conventions.md §4.13 for the
     * one absence in the family that was checked and turned out to be a hole
     * rather than a decision. `choose` is not optional: a panel with no way in
     * has nothing to say.
     */
    actions?: readonly MetacomAction[];
    /** The page's language. A value: see the head. */
    lang?: PanelLang;
    /**
     * Something to say out loud when an action finishes, and which action it
     * was.
     *
     * Both halves, because a product usually has more to add: bildhaft appends
     * what moving the default did to the page, and says something else entirely
     * when forgetting leaves the open Sammlung pointed at nothing.
     */
    say: (line: string, action: MetacomAction) => void;
    /**
     * Told the heading line whenever it changes, so the panel's own summary
     * carries the folder without being unfolded. Blank where there is nothing
     * to say.
     *
     * Still a callback rather than a `$bindable`, and that is not inertia: the
     * heading is computed here and read there, never written there, and a
     * two-way binding would say a caller could set it.
     */
    headline?: (text: string) => void;
    /**
     * Run after an action succeeded and before `say`, awaited.
     *
     * This is where a product decides what the folder arriving or going means
     * to it — which source is now the default, which Sammlung has to be
     * redrawn. None of that is shared, because the three do not agree about
     * what a default is.
     */
    after?: (action: MetacomAction) => void | Promise<void>;
    /** The block's id. §6.0: every shared component takes one, because three
     *  suites in this family are built on ids and one masks its baselines by
     *  them. */
    id?: string;
  } = $props();

  /* What the provider has told us since the last paint. See the head: the
     provider mutates in place, so this counter is the whole of its reactivity
     and every read below goes through it. */
  let told = $state(0);
  $effect(() => metacom.subscribe(() => { told += 1; }));

  let busy = $state(false);

  let folderInput: HTMLInputElement;
  let zipInput: HTMLInputElement;

  let words = $derived(WORDS[lang]);
  let status = $derived.by(() => { told; return metacom.status(); });
  let ready = $derived.by(() => { told; return metacom.isReady(); });
  let count = $derived.by(() => { told; return metacom.symbolCount; });
  let root = $derived.by(() => { told; return metacom.rootName; });

  let attention = $derived(needsAttention(status));
  let permission = $derived(status.kind === 'needs-setup' && status.code === 'permission-needed');

  /* §3.7: drawn as a warning and never as another line of grey prose, and the
     three sentences are in the body beside the button they name — not in the
     heading, which carries the state instead. Which states deserve the warning
     is `needsAttention`, this package's own answer, so that a fifth surface
     cannot decide differently.
     `detail` is what the platform said, in whatever language it chose, so it
     goes *beside* the translated code and never instead of it — README.md's
     rule, and the only place in this panel that shows it. */
  let warning = $derived.by(() => {
    if (!attention) return '';
    if (permission) return words.permissionLost;
    if (status.kind !== 'error') return '';
    return status.detail ? `${words.status[status.code]} ${status.detail}` : words.status[status.code];
  });

  /* Told, not bound: see the prop. An effect rather than a call inside the
     derivation, because a heading arriving is a side effect on somebody else's
     node and a derivation that has one runs twice under a checker. */
  $effect(() => { headline?.(headlineFor(status, count, root, lang)); });

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
    try {
      await task();
      await after?.(action);
      const done = action === 'choose' ? words.read
        : action === 'zip' ? words.zipRead
          : action === 'reread' ? words.reread_done
            : words.forgotten;
      say(done, action);
    } catch (error) {
      // An abandoned picker is a normal user action, not a failure. All three
      // products had worked this out and written it in their own margin.
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
    } finally {
      busy = false;
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
    const now = metacom.status();
    if (now.kind === 'needs-setup' && now.code === 'permission-needed'
        && await metacom.requestPermission()) return;
    if (MetacomProvider.supportsPersistentPicker) await metacom.pickDirectory();
    else folderInput.click();
  }

  /**
   * What came out of a file input, copied out before the reset.
   *
   * `input.files` hands back the same FileList object every time and clearing
   * the value empties it in place, so a reference read a line later is empty.
   * vorlaut-editor's comment says the same, and it was a folder that silently
   * never got read.
   */
  function taken(input: HTMLInputElement): File[] {
    const files = Array.from(input.files ?? []);
    input.value = '';
    return files;
  }

  /**
   * What makes a file input ask for a folder.
   *
   * Non-standard, and the only directory input Firefox and Safari offer.
   * Spread rather than written out as two attributes: `directory` is not in
   * Svelte's HTML attribute types and svelte-check is right about that — it is
   * not in any specification. The pair is what the vanilla panel sets with
   * `setAttribute`, and the emitted markup is the same.
   */
  const DIRECTORY = { webkitdirectory: true, directory: '' };

  /* There is something to forget as soon as a handle is stored, which is every
     state except „no folder" — including the two that need attention, which is
     the whole reason somebody would want the button. */
  let stored = $derived(!(status.kind === 'needs-setup' && status.code === 'no-folder'));
</script>

<!--
  **Blocked is drawn, not removed** — §6.8, and the vanilla panel's own margin.
  All three products deleted the buttons that cannot run, so the row's width and
  the position of every button in it changed under the pointer as a folder
  arrived, and a keyboard that was on „Neu einlesen" when a folder was forgotten
  landed back on the document. It is also the poorer answer for a reader: a
  control that is not there says nothing, and a disabled one says the act exists
  and is not available yet.

  `disabled` and not `aria-disabled`: these are genuinely inert, and the state
  line directly above says which thing is missing, so there is nothing a
  focusable-but-refusing button could explain that is not already said.

  `data-state` is `status.kind` verbatim. `components.css` styles the kinds by
  name, so a mapping here would be a chance to disagree with the stylesheet
  about what `error` looks like — and would hide a kind nobody has added yet.
--><div {id} class="metacom-panel"><p class="notice">{words.licence}</p><p
    class="metacom-panel__note"
  ><a href={words.licenceUrl} target="_blank" rel="noopener noreferrer">{words.licenceLink}</a></p><p
    class="metacom-panel__note" hidden={lang !== 'en'}
  >{words.germanOnly}</p><p class="notice bad" hidden={!attention}>{warning}</p><p
    class={attention ? 'standing notice bad' : 'standing'} data-state={status.kind}
  ><span class="dot"></span><span>{stateLineFor(status, count, root, lang)}</span></p><div
    class="acts"
  >{#if actions.includes('choose')}<button
        type="button"
        class="btn sm {permission || !ready ? 'primary' : 'quiet'}"
        disabled={busy}
        onclick={() => void run('choose', choose)}
      >{permission ? words.confirm : ready ? words.chooseAnother : words.choose}</button
      >{/if}{#if actions.includes('zip')}<button
        type="button" class="btn sm quiet" disabled={busy} onclick={() => zipInput.click()}
      >{words.zip}</button
      >{/if}{#if actions.includes('reread')}<button
        type="button" class="btn sm quiet" disabled={busy || !ready}
        onclick={() => void run('reread', () => metacom.rebuildIndex())}
      >{words.reread}</button
      >{/if}{#if actions.includes('forget')}<button
        type="button" class="btn sm destructive" disabled={busy || !stored}
        onclick={() => void run('forget', () => metacom.forget())}
      >{words.forget}</button
      >{/if}</div><p
    class="metacom-panel__note" hidden={MetacomProvider.supportsPersistentPicker}
  >{words.notRemembered}</p><!--
  A hidden file input, and a real button above that clicks it.

  bildhaft wraps the input in a `<label class="btn">`. It looks identical and it
  is not the same thing: a label is not a control, so it has no tab stop and no
  Enter, and the folder button was unreachable from the keyboard in the one
  product whose whole subject is somebody who cannot use a mouse well.

  `webkitdirectory` is non-standard and is the only directory input Firefox and
  Safari offer.
--><input
    bind:this={folderInput} type="file" hidden multiple {...DIRECTORY}
    onchange={() => { const files = taken(folderInput);
      if (files.length) void run('choose', () => metacom.useFileList(files)); }}
  /><input
    bind:this={zipInput} type="file" hidden accept=".zip,application/zip"
    onchange={() => { const files = taken(zipInput);
      if (files.length) void run('zip', () => metacom.useZip(files[0]!)); }}
  /></div>
