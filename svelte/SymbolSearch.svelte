<script lang="ts" module>
  import type { Candidate } from '@lautstark/bildquelle';

  /**
   * A finished — or unfinished — search, as the snippets see it.
   *
   * conventions.md §6.4: **the seam is a parameterised snippet over the answer,
   * not two blocks around it.** vorlaut's prescribed start-key tile and its
   * „way back in" button are not caller content standing above and below the
   * results — they come out of the answer alongside the hits and render inside
   * the results box, and the tile is index 0 of the roving ring. A `before` and
   * an `extra` around the component would have shipped vorlaut's arrows and
   * removed the tile they start on.
   *
   * So what a snippet is handed is this: everything the component knows about
   * the search on screen, from which a product derives its own additions.
   * vorlaut's tile is a function of `searched`; its button is a function of
   * `empty` and of a provider status it can read for itself.
   */
  export interface SearchAnswer {
    /** What is in the field, trimmed. Not what the tiles are the answer to. */
    query: string;
    /**
     * The word the tiles on screen are the answer to, which is not the same as
     * the word in the field: somebody who has typed three more letters and not
     * yet been answered is looking at the old ones. `''` before any search.
     */
    searched: string;
    /** What the grid is drawing — the hits, or the caller's suggestions. */
    candidates: readonly Candidate[];
    /** A search is in flight and the box has nothing to stand in for it. */
    searching: boolean;
    /** A search has answered, and answered with nothing. */
    empty: boolean;
    /** The tiles are the caller's suggestions rather than an answer to a word. */
    suggested: boolean;
  }

  /**
   * The component's own words, which are the caller's.
   *
   * §6.0: a shared component carries no German. There are only two, because
   * there is only so much fixed furniture in a field and a grid of pictures.
   */
  export interface SearchWords {
    /** The field's accessible name. */
    field: string;
    /** The field's placeholder. Both products name the collection in it. */
    placeholder?: string;
    /**
     * „sucht …", written into the results box while a search is in flight and
     * there is nothing else in it. Left off, nothing is drawn — results stand
     * until they are replaced, which is what stops the box flickering under a
     * hand that is typing.
     */
    searching?: string;
  }
</script>

<script lang="ts">
  /**
   * Searching a symbol source, and the grid of pictures that answers.
   * conventions.md §6.4.
   *
   * It is in bildquelle rather than design because its subject is a provider:
   * the search, the eight-state `ProviderStatus` behind it, and the attribution
   * line that is a licence condition rather than a courtesy.
   *
   * ## It emits `.picker__grid` and `.picker__item`, and imports nothing from
   * design
   *
   * Those two homes look like a dependency and must not become one — §6.0: a
   * provider package does not gain design as a runtime dependency, and this is
   * the entry where somebody would add it without noticing. `TileGrid` and
   * `Tile` are for a *product* that wants the component form; this speaks the
   * vocabulary and design draws it, which is the bargain the vanilla panels
   * have always had and which works here because those rules moved into
   * `components.css` with the components in design v1.33.0.
   *
   * There is no `<style>` block for the same reason there is no import: every
   * class below has a rule over there, and `test/css-contract.test.ts` holds
   * this file to it. What is deliberately *not* drawn here is the tile's
   * picture size — wochenwerk's, bildhaft's and vorlaut's thumbnails are three
   * different sizes and `components.css` records that as a real difference, so
   * the tile emits a bare `<img>` and the product sizes it.
   *
   * ## What is the component's and what is the caller's
   *
   * The component owns the search: the minimum, the debounce, the
   * stale-answer guard, whether the suggestions or an answer is on screen, and
   * the arrows. The caller owns every word, what a tile means when it is
   * pressed, and anything extra that belongs in the box — through the snippets,
   * which are handed the answer.
   *
   * **No METACOM image byte is uploaded, transmitted or written to any server
   * from here.** The only thing this asks a provider for is `getImageUrl`,
   * which is a URL and never bytes by construction — for METACOM an object URL
   * valid in this document alone. That is what makes the licence enforceable
   * from inside the package, and there must be no path added that moves bytes.
   *
   * **The two types below come from the published entry and not from
   * `../src/`.** `MetacomPanel.svelte`'s header carries the whole argument;
   * the short of it is that a consumer holds the `dist` declarations, a class
   * declared in both is two nominally distinct types, and a component that
   * reaches into its own package's source is green here and red in every
   * product.
   */
  import type { Snippet } from 'svelte';
  import { on } from 'svelte/events';
  import type { SymbolProvider } from '@lautstark/bildquelle';

  let {
    provider,
    words,
    chosen = null,
    busy = false,
    minimum = 3,
    limit,
    suggestions = [],
    seed = '',
    describe = (candidate: Candidate) => candidate.label,
    id,
    class: extra,
    onpick,
    onescape,
    between,
    lead,
    trailing,
    caption,
  }: {
    /** The source being searched. Also where the credit line comes from. */
    provider: SymbolProvider;
    words: SearchWords;
    /**
     * The stored choice, marked in the grid. Null where nothing is stored, or
     * where something else is covering it — bildhaft marks nothing while a
     * picture of the user's own is showing, because highlighting the symbol
     * underneath would claim the slot shows something it does not.
     */
    chosen?: string | null;
    /**
     * Suppresses the component's own field, grid and credit.
     *
     * bildhaft hides everything on the sheet while a square is being chosen — a
     * live grid of symbols under an open crop is a press that throws the crop
     * away without saying so — and asserts it. A snippet around the component
     * cannot hide what is inside it, so this is a prop.
     */
    busy?: boolean;
    /**
     * How many characters before typing runs a search. Three, and Enter
     * overrides it.
     *
     * Three because of what is on the other end: ARASAAC is a network call and
     * METACOM an index over somebody's folder, and one or two letters match a
     * large part of either and answer with the first few of a thousand
     * pictures, which is a slower way of showing nothing. Three is also where
     * German stops being prefixes — „es", „im", „am" are whole words and none
     * of them is a picture anybody wants.
     */
    minimum?: number;
    /** At most this many tiles. Left off, everything the provider answered. */
    limit?: number;
    /**
     * Tiles to show while nothing has been searched.
     *
     * bildhaft's, and they are not a block above the grid: they go in the same
     * results list, and they are declined the moment anything has been searched
     * — which is this component's state to know and so is done here rather than
     * by the caller. A caller that fills these in asynchronously simply updates
     * the prop; if a search has landed since, nothing moves.
     */
    suggestions?: readonly Candidate[];
    /** What the field opens with, and what is searched at mount if it is not
     *  empty — at any length, the way Enter is. vorlaut opens the sheet on the
     *  word the thing being edited already has. */
    seed?: string;
    /**
     * The tile's accessible name, and its `title`.
     *
     * `among` says the label is repeated in this answer. METACOM ships parallel
     * rendering folders holding identical file names, so a search can answer
     * four tiles that all say „ja" and differ only in picture — and both
     * products that meet that disambiguate, bildhaft in visible text and
     * vorlaut in `aria-label`. What the disambiguator *is* is the product's
     * (bildhaft reads the folder off the id, vorlaut carries a hint), which is
     * why this is a prop and not a rule here. That the labels collide is the
     * component's, and is said once.
     */
    describe?: (candidate: Candidate, among: boolean) => string;
    /** The wrapper's id. §6.0. */
    id?: string;
    /** Appended to the wrapper, which otherwise carries no class of its own:
     *  where this sits and how it is spaced belongs to the page. */
    class?: string;
    /**
     * A tile was pressed.
     *
     * **Handed the word that found the picture, not the field's value.**
     * vorlaut keeps a `searched` mirror for exactly this and records the bug
     * that made it so: a search for „trinken" that lands on a pictogram filed
     * under „Getränk" used to name the key „Getränk". `''` where the tile came
     * from the suggestions and no word found it.
     */
    onpick: (candidate: Candidate, searched: string) => void;
    /**
     * Escape in the field, taken back from the browser.
     *
     * `<input type="search">` swallows the first Escape to clear itself, so a
     * sheet that opens *in* a search ignores the first Escape and shuts on the
     * second, which reads as a dialog that has hung. The fix is not Sheet's:
     * wochenwerk nests a second search inside a card editor inside the
     * appointment sheet, and a sheet-level rule would discard an unsaved
     * appointment and an unsaved card together. Left off, the browser keeps its
     * behaviour and the field clears.
     */
    onescape?: () => void;
    /**
     * Drawn between the field and the results box, outside both.
     *
     * For a picker that has rows under its field and above its grid. bildhaft
     * has three — the own-image row, the print caption and the negation — and
     * its stylesheet records where the last of them goes: "below the own-image
     * row and above the suggestions: it applies to whichever symbol is chosen,
     * so it belongs with neither."
     *
     * Without this slot that arrangement is unsayable. The field and the grid
     * are one block here, so three rows that used to sit between them have to
     * go above the block or below it — above puts the search field fourth in a
     * dialog somebody opened to search in, and below contradicts the sentence
     * quoted above. bildhaft adopted the component, chose the first, and said
     * plainly that neither §6.4 nor its brief authorised the move. §6 answers
     * that case: if a component cannot serve one consumer, change the
     * component, not the consumer's markup.
     *
     * Not `lead`, which is inside the box: a tile there joins the roving ring
     * and scrolls with the hits, and these rows are neither.
     */
    between?: Snippet<[SearchAnswer]>;
    /** Drawn inside the results box, before the hits. A tile here carrying
     *  `picker__item` is index 0 of the roving ring, which is what vorlaut's
     *  prescribed start-key tile needs to be. */
    lead?: Snippet<[SearchAnswer]>;
    /** Drawn inside the results box, after the hits — the sentence about an
     *  empty answer and whatever can be done about it. */
    trailing?: Snippet<[SearchAnswer]>;
    /** The tile's visible text. Left off, the label. */
    caption?: Snippet<[Candidate, boolean]>;
  } = $props();

  /* Long enough that a word typed at speed is one search rather than six, short
     enough that stopping to look at the screen is answered before anybody
     wonders whether it will be. §6.4 fixes it at 300ms, so it is a constant and
     not a prop: three products had three figures and the disagreement was never
     about a product. */
  const SETTLES = 300;

  /* Read once, on purpose, and the compiler is told so. `seed` is where the
     field starts, not a feed: a search is opened around one word and never
     handed a second, and reading it through a derived would say the opposite —
     that a new seed could arrive and throw away what somebody had just typed. */
  // svelte-ignore state_referenced_locally
  let query = $state(seed);
  let found = $state.raw<readonly Candidate[]>([]);
  /* The word `found` is the answer to. See `onpick`. */
  let searched = $state('');
  let searching = $state(false);

  let field: HTMLInputElement;
  let box: HTMLElement;
  let typing: ReturnType<typeof setTimeout> | undefined;

  /* **The stale-answer guard is not optional.** bildhaft and vorlaut each hold
     a token and drop an answer that is not the current one; wochenwerk has
     none, and two in-flight searches there land in whatever order they resolve.
     It is also what makes searching-as-you-type safe at all: a fast typist has
     several searches in flight and only the newest may draw. Not a rune —
     nothing draws it. */
  let token = 0;

  let shown = $derived(searched ? found : suggestions);

  let answer = $derived<SearchAnswer>({
    query: query.trim(),
    searched,
    candidates: shown,
    searching,
    empty: searched !== '' && !searching && found.length === 0,
    suggested: searched === '',
  });

  /* Which labels are repeated in what is on screen. See `describe`. */
  let twins = $derived.by(() => {
    const seen = new Map<string, boolean>();
    for (const candidate of shown) seen.set(candidate.label, seen.has(candidate.label));
    return seen;
  });

  /** The credit line, **computed from the source and not from the results**, so
   *  a search that found nothing still says where the pictograms come from.
   *  Null under METACOM — somebody's own licensed folder owes nothing to
   *  anybody — and then nothing is drawn rather than an empty paragraph.
   *
   *  Not `.footer__credit`: that name is a different assertion in bildhaft. */
  let credit = $derived(provider.attribution ?? '');

  /* --- searching ---------------------------------------------------------- */

  function search(): void {
    const asked = query.trim();
    if (!asked) return;
    const mine = ++token;
    /* „sucht …" replaces the box, so it is only written into an empty one.
       Typing runs a search every few letters, and a box that blanked itself on
       each of them would flicker under the hand that is typing — and would take
       away the hits from two letters ago, which are the best answer anybody has
       until the next ones arrive. */
    searching = shown.length === 0;
    void provider.search(asked).then(
      (hits) => {
        if (mine !== token) return;
        searched = asked;
        searching = false;
        found = limit === undefined ? hits : hits.slice(0, limit);
      },
      () => {
        /* `search()` must not throw and a provider that keeps its contract
           answers `[]`; this is the belt for one that does not. */
        if (mine !== token) return;
        searched = asked;
        searching = false;
        found = [];
      },
    );
  }

  function typed(): void {
    clearTimeout(typing);
    const asked = query.trim();
    if (!asked) {
      /* Emptying the field goes back to the suggestions — and takes the token
         with it, so an answer still in flight cannot land on top of them. */
      token += 1;
      searched = '';
      found = [];
      searching = false;
      return;
    }
    if (asked.length < minimum) return;
    typing = setTimeout(search, SETTLES);
  }

  /**
   * The field's own keys.
   *
   * Attached rather than declared, and that is the whole reason this function
   * is not an `onkeydown` attribute. Svelte delegates `keydown` to the root,
   * where a handler runs *after* the event has really bubbled past every
   * ancestor — so `stopPropagation()` in a delegated handler cannot stop a
   * listener a product put on the dialog. bildhaft has exactly that listener:
   * it treats a non-field Enter as Fertig, and once the field lives inside this
   * component its `target === search` comparison has no node to compare
   * against. Enter in the search field would close the picker, and a test
   * asserts it must not. `on()` from `svelte/events` is a real listener on the
   * input, so the stop is a real stop.
   */
  function pressed(event: KeyboardEvent): void {
    /* Down into the pictures, which is the whole point of having typed. The box
       keeps its own arrows from there, and ArrowUp out of the top row comes
       back here. */
    if (event.key === 'ArrowDown') {
      const all = tiles();
      if (!all.length) return;
      event.preventDefault();
      focusTile(all, 0);
      return;
    }
    if (event.key === 'Escape' && onescape) {
      // Prevented, so the field is not cleared on the way past.
      event.preventDefault();
      onescape();
      return;
    }
    if (event.key !== 'Enter' || event.isComposing) return;
    /* The sheet is not a form, and Enter in a field inside a dialog is
       otherwise the browser's own way to close it — and the product's way, see
       the head. Both are taken. */
    event.preventDefault();
    event.stopPropagation();
    // Now, rather than in 300ms and again after that. And at any length: this
    // is the override, and it is what somebody typing „Ei" needs, as well as
    // the way to ask again after a search that failed on a dropped network.
    clearTimeout(typing);
    search();
  }

  $effect(() => on(field, 'keydown', pressed));

  /* --- walking the tiles ---------------------------------------------------
   *
   * The results are the one thing here that is looked at rather than read, and
   * Tab pressed twenty times to reach the twenty-first picture is not looking.
   * So the box is one stop in the tab order and the arrows move inside it.
   *
   * Delegated to the box rather than bound to each tile: the tiles are thrown
   * away and rebuilt by every search, and a handler per tile would be rebuilt
   * with them. The selector is the class, which is why a snippet's own tile
   * joins the ring by carrying it. */

  /** The tiles, in the order they are drawn in — the lead snippet's included. */
  const tiles = (): HTMLElement[] =>
    [...box.querySelectorAll<HTMLElement>('button.picker__item')];

  /** Focus one, and make it the box's one tab stop. Roving rather than a fixed
   *  stop at the first tile, so that Tab out and back in comes back to the
   *  picture somebody was looking at. */
  function focusTile(all: HTMLElement[], at: number): void {
    all.forEach((one, index) => { one.tabIndex = index === at ? 0 : -1; });
    all[at]?.focus();
  }

  /**
   * Where an arrow lands, as an index into the tiles.
   *
   * Stopping at the edge rather than wrapping: walking off the end back to the
   * beginning is a surprise.
   *
   * **Up and down are read off the layout rather than counted in fours.** The
   * grid is `auto-fill`, so the column count is a function of the width; and a
   * lead tile with a word under it stands taller than the hits beside it, so a
   * row is not reliably four tiles at the same height either. Grouping by
   * `offsetTop` makes such a tile a member of its row instead of an exception
   * to an arithmetic.
   */
  function stepTo(all: HTMLElement[], from: number, key: string): number {
    if (key === 'ArrowLeft') return Math.max(0, from - 1);
    if (key === 'ArrowRight') return Math.min(all.length - 1, from + 1);
    const here = all[from]!;
    const rows = [...new Set(all.map((one) => one.offsetTop))].sort((a, b) => a - b);
    const want = rows[rows.indexOf(here.offsetTop) + (key === 'ArrowDown' ? 1 : -1)];
    if (want === undefined) return from;
    // The nearest tile on that row by where it starts, so a run of presses
    // holds a column rather than drifting to the left edge.
    let best = from;
    let nearest = Infinity;
    all.forEach((one, at) => {
      if (one.offsetTop !== want) return;
      const gap = Math.abs(one.offsetLeft - here.offsetLeft);
      if (gap < nearest) { nearest = gap; best = at; }
    });
    return best;
  }

  function walk(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const all = tiles();
    const from = all.indexOf(document.activeElement as HTMLElement);
    // Something else in the box has focus — a button a snippet offered beside a
    // sentence about an empty answer — and the arrows are not this box's.
    if (from < 0) return;
    /* Claimed whether or not there is anywhere to go: the box may scroll, and
       an arrow that moved nothing would scroll the pictures out from under the
       one that is focused. */
    event.preventDefault();
    const to = stepTo(all, from, event.key);
    /* Off the top row is back to the field, which is where somebody who has
       changed their mind about the word is going. Off the other three edges is
       nowhere: left and right have the rest of the grid behind them, and down
       has the credit line, which is not a place to arrow into. */
    if (to === from && event.key === 'ArrowUp') field.focus();
    else focusTile(all, to);
  }

  /* One tab stop for the whole box, and the keyboard left where it was.
     The keyed `{#each}` is what makes remembering an index unnecessary: a tile
     that is still in the answer is still the same element, so focus stays put
     without anybody moving it. What is left is the tab index, which belongs to
     the box rather than to any one tile. */
  $effect(() => {
    shown; searching;
    const all = tiles();
    /* A tile is drawn at `-1` and one of them is promoted here, rather than the
       first being drawn at `0`: a lead snippet's tile is index 0 and carries a
       button's own default of `0`, so drawing the first hit at `0` as well
       would make two tab stops out of a box that is meant to be one. */
    if (!all.some((one) => one.tabIndex === 0)) {
      all.forEach((one, at) => { one.tabIndex = at === 0 ? 0 : -1; });
    }
  });

  /* A seeded field is searched once, at any length, the way Enter is.
   *
   * As the component is created and **not from an effect**, which is where this
   * was first written and is wrong twice over. An effect runs after the first
   * flush, so it would read `query` rather than `seed` — and anything typed
   * between the mount and that flush would be searched a second time, or worse,
   * a short word typed there would be searched despite the minimum. Measured:
   * two characters into a freshly mounted field were searched. Nothing here
   * touches the DOM, so there is nothing to wait for. */
  // svelte-ignore state_referenced_locally
  if (seed.trim()) search();

  /** The field, for a caller whose empty slot points at it. */
  export function focus(): void { field.focus(); }

  /** Back to nothing searched. wochenwerk's, which clears between openings of
   *  a sheet it keeps rather than rebuilds. */
  export function clear(): void {
    clearTimeout(typing);
    token += 1;
    query = '';
    searched = '';
    found = [];
    searching = false;
  }
</script>

<div {id} class={extra}><input
    bind:this={field} bind:value={query} class="field" type="search" autocomplete="off"
    aria-label={words.field} placeholder={words.placeholder} hidden={busy} oninput={typed}
  />{@render between?.(answer)}<div
    bind:this={box} class="picker__grid" hidden={busy} role="presentation" onkeydown={walk}
  >{@render lead?.(answer)}{#each shown as candidate (candidate.id)}{@const among = twins.get(candidate.label) === true}{@const name = describe(candidate, among)}<button
        type="button" tabindex="-1"
        class="picker__item{candidate.id === chosen ? ' picker__item--active' : ''}"
        aria-label={name} title={name}
        onclick={() => onpick(candidate, searched)}
      ><!--
      The picture, straight from the provider. `getImageUrl` is a URL and never
      bytes — for METACOM an object URL valid in this document alone — which is
      the whole of what keeps the licence enforceable from inside the package.
      `alt=""` because the button is named above: a reader that announced the
      name twice would be worse than one that did not announce it.
      Awaited in place rather than resolved into a map: the `{#each}` is keyed,
      so a tile that survives a search does not ask again, and both providers
      cache what they hand back.
    -->{#await provider.getImageUrl(candidate.id) then url}{#if url}<img
            src={url} alt="" loading="lazy"
          />{/if}{/await}{#if caption}{@render caption(candidate, among)}{:else}<span
        >{candidate.label}</span>{/if}</button
      >{/each}{#if searching && words.searching}<p>{words.searching}</p>{/if}{@render trailing?.(answer)}</div
  >{#if credit}<p class="small muted" hidden={busy}>{credit}</p>{/if}</div>
