<script lang="ts">
  /**
   * „Welche Bilder?" — ARASAAC or METACOM, as one question with two answers.
   *
   * `src/symbole-panel.ts` has the words and the four rules this draws by.
   * In short: METACOM is not offered as an answer until its folder is read;
   * setting it up is one sentence and one button; a ZIP is reached through the
   * folder it lies in; a ready METACOM keeps its actions in a `⋯`.
   *
   * ## What the host keeps
   *
   * Which answer is in force. bildhaft calls it the default source and stores
   * it with its settings, vorlaut-editor calls it `activeProvider`, and this
   * panel has no business storing either. So `current` comes in as a value and
   * every change goes out through `pick`: when somebody picks a card, when a
   * folder has just been read in (METACOM becomes the answer, which is what
   * „Einrichten" promised), and when the folder is forgotten while METACOM was
   * the answer (ARASAAC again). The host says what that did to its page.
   *
   * ## What it borrows
   *
   * The choose flow is `MetacomPanel`'s, for the reasons that file gives: a
   * stored handle whose permission the browser withdrew comes back with
   * `requestPermission()` and no picker; without a persistent picker the press
   * only opens a file input, synchronously, inside the gesture. The `⋯` is
   * `@lautstark/werkzeuge/svelte/MoreMenu`, which conventions.md §6.0 allows a
   * provider package and design's `Overflow` it does not.
   *
   * Everything comes from this package's published entries, for
   * `MetacomPanel`'s reason: `src/` and `dist/` are two nominally distinct
   * `MetacomProvider`s.
   *
   * No METACOM byte moves here either: the panel counts symbols and names a
   * folder.
   */
  import { tick } from 'svelte';
  import { MetacomProvider, needsAttention } from '@lautstark/bildquelle';
  import {
    WORDS, headlineFor, type PanelLang, type SymbolSource,
  } from '@lautstark/bildquelle/symbole-panel';
  import MoreMenu, { type MenuRow } from '@lautstark/werkzeuge/svelte/MoreMenu';

  let {
    metacom,
    current,
    pick,
    say,
    attribution = null,
    rendering,
    headline,
    lang = 'de',
    id,
  }: {
    metacom: MetacomProvider;
    /** The answer the host has stored. METACOM is drawn as the answer only
     *  while its folder can be read; until then the page shows ARASAAC and so
     *  does this panel. */
    current: SymbolSource;
    /** Make this the answer. Called on a pick, after a folder is read in, and
     *  after a forgotten folder that was the answer. */
    pick: (source: SymbolSource) => void | Promise<void>;
    /** Something to say out loud once a folder has been read in, read again
     *  or forgotten. */
    say: (line: string) => void;
    /** ARASAAC's credit line, shown while ARASAAC is the answer. */
    attribution?: string | null;
    /** Which of the folder's parallel renderings to prefer, where it has two
     *  or more. Offered in the `⋯`; leave it out to offer nothing. */
    rendering?: { current: string | null; choose: (segment: string | null) => void };
    /** The panel frame's summary line: which answer is in force. */
    headline?: (text: string) => void;
    lang?: PanelLang;
    id?: string;
  } = $props();

  /* The provider mutates in place and has `subscribe`; this counter is all of
     its reactivity. MetacomPanel's head says why it must stay that way. */
  let told = $state(0);
  $effect(() => metacom.subscribe(() => { told += 1; }));

  let busy = $state(false);
  let setting = $state(false);
  let folderInput: HTMLInputElement;
  let chooseButton = $state<HTMLButtonElement>();

  const words = $derived(WORDS[lang]);
  const status = $derived.by(() => { void told; return metacom.status(); });
  const ready = $derived.by(() => { void told; return metacom.isReady(); });
  const count = $derived.by(() => { void told; return metacom.symbolCount; });
  const root = $derived.by(() => { void told; return metacom.rootName; });
  const found = $derived.by(() => { void told; return metacom.found; });
  const renderings = $derived.by(() => { void told; return ready ? metacom.renderings() : []; });
  const shown = $derived<SymbolSource>(current === 'metacom' && ready ? 'metacom' : 'arasaac');

  const permission = $derived(status.kind === 'needs-setup' && status.code === 'permission-needed');
  const loading = $derived(status.kind === 'loading');
  const failed = $derived(!ready && needsAttention(status) && status.kind === 'error');
  /* What unfolds under METACOM: the setup, or the reason it cannot be read. */
  const unfolded = $derived(!ready && (setting || loading || failed || permission));

  $effect(() => { headline?.(headlineFor(current, status, count, lang)); });

  /* A name every card in one panel shares, so the two radios are one group,
     and no two panels on one page share it. */
  const group = `symbole-${Math.random().toString(36).slice(2, 8)}`;

  function report(error: unknown): void {
    if (typeof reportError === 'function') reportError(error);
    else console.error(error);
  }

  /** One task at a time, the row disabled while it runs. A dismissed picker
   *  is somebody changing their mind, not a fault. */
  async function run(task: () => Promise<void>): Promise<void> {
    busy = true;
    try {
      await task();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) report(error);
    } finally {
      busy = false;
    }
  }

  /** After a folder came in: METACOM is the answer, which is what „Einrichten"
   *  promised. A folder with no METACOM in it stays unfolded with its reason. */
  async function arrived(): Promise<void> {
    if (!metacom.isReady()) return;
    setting = false;
    await pick('metacom');
    say(words.nowMetacom(metacom.symbolCount));
  }

  async function choose(): Promise<void> {
    if (permission && await metacom.requestPermission()) return arrived();
    await metacom.pickDirectory();
    await arrived();
  }

  /** Synchronous in the press: Firefox and Safari open a file dialog only
   *  inside the gesture that asked for it. MetacomPanel's `pressChoose`. */
  function pressChoose(): void {
    if (!permission && !MetacomProvider.supportsPersistentPicker) folderInput.click();
    else void run(choose);
  }

  /** „Einrichten …" takes itself away when pressed, and focus would fall to
   *  the page with it. It lands on the button it unfolded instead. */
  async function setUp(): Promise<void> {
    setting = true;
    await tick();
    chooseButton?.focus();
  }

  function rows(): MenuRow[] {
    const out: MenuRow[] = [
      { label: words.chooseAnother, run: pressChoose },
    ];
    if (MetacomProvider.supportsPersistentPicker) {
      out.push({
        label: words.reread, note: words.rereadNote,
        run: () => void run(async () => { await metacom.rebuildIndex(); say(words.reread_done); }),
      });
    }
    if (rendering && renderings.length >= 2) {
      const prefer = rendering;
      out.push('rule', { label: words.noRendering, checked: prefer.current === null, run: () => prefer.choose(null) });
      for (const one of renderings) {
        out.push({ label: words.rendering(one.segment), checked: prefer.current === one.segment, run: () => prefer.choose(one.segment) });
      }
    }
    out.push('rule', {
      label: words.forget, note: words.forgetNote, danger: true,
      run: () => void run(async () => {
        await metacom.forget();
        if (current === 'metacom') await pick('arasaac');
        say(words.forgotten);
      }),
    });
    return out;
  }

  const DIRECTORY = { webkitdirectory: true, directory: '' };
</script>

<div {id} class="where-panel">
  <div class="answers" role="radiogroup" aria-label={words.question}>
    <label class="answer">
      <input type="radio" name={group} value="arasaac" checked={shown === 'arasaac'}
        disabled={busy} onchange={() => void pick('arasaac')} />
      <b>{words.arasaac}</b>
      <span class="answer__note">{words.arasaacNote}</span>
    </label>
    {#if ready}
      <label class="answer">
        <input type="radio" name={group} value="metacom" checked={shown === 'metacom'}
          disabled={busy} onchange={() => void pick('metacom')} />
        <b>{words.metacom}</b>
        <span class="answer__note">{words.ready(count, root)}</span>
        <MoreMenu label={words.more} rows={rows} disabled={busy} />
      </label>
    {:else}
      <div class="answer off">
        <b>{words.metacom}{#if !permission}<span class="answer__tag"
          >{unfolded ? words.settingUp : words.notSetUp}</span>{/if}</b>
        <span class="answer__note">{words.metacomNeeds}</span>
        {#if !unfolded}
          <div class="acts">
            <button type="button" class="btn sm" onclick={() => void setUp()}>{words.setUp}</button>
          </div>
        {:else}
          <div class="answer__more">
            {#if loading}
              <p><b>{status.kind === 'loading' && status.code === 'unpacking-zip'
                ? words.unpacking(root) : words.reading(root || words.metacom)}</b></p>
              {#if found > 0}<p class="small muted">{words.found(found)}</p>{/if}
            {:else if permission}
              <div class="where bad" data-state={status.kind}>
                <b><span class="dot"></span>{words.permission(root)}</b>
                <span class="small faint">{words.permissionNote}</span>
              </div>
              <div class="acts">
                <button type="button" class="btn sm primary" disabled={busy}
                  onclick={pressChoose}>{words.allow}</button>
              </div>
            {:else if failed}
              <div class="where bad" data-state={status.kind}>
                {#if status.kind === 'error' && status.code === 'no-images'}
                  <b><span class="dot"></span>{words.noMetacom(root)}</b>
                  <span class="small faint">{words.noMetacomNote}</span>
                {:else}
                  <b><span class="dot"></span>{words.unreadable(root)}</b>
                  {#if status.kind === 'error' && status.detail}<span class="small faint">{status.detail}</span>{/if}
                {/if}
              </div>
              <div class="acts">
                <button type="button" class="btn sm primary" disabled={busy}
                  onclick={pressChoose}>{words.chooseAnother}</button>
              </div>
            {:else}
              <p>{words.pickFolder}</p>
              {#if !MetacomProvider.supportsPersistentPicker}<p class="small muted">{words.forgets}</p>{/if}
              {#if lang === 'en'}<p class="small muted">{words.germanOnly}</p>{/if}
              <div class="acts">
                <button bind:this={chooseButton} type="button" class="btn sm primary" disabled={busy}
                  onclick={pressChoose}>{words.choose}</button>
                <a class="small" href={words.licenceUrl} target="_blank"
                  rel="noopener noreferrer">{words.licenceLink}</a>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </div>
  {#if shown === 'arasaac' && attribution}<p class="small faint">{attribution}</p>{/if}
  <input bind:this={folderInput} type="file" hidden multiple {...DIRECTORY}
    onchange={() => {
      const files = Array.from(folderInput.files ?? []);
      folderInput.value = '';
      if (files.length) void run(async () => { await metacom.useFileList(files); await arrived(); });
    }} />
</div>
