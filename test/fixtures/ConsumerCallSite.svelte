<script lang="ts">
  /**
   * A product's call site, written the way a product writes it — and the whole
   * of the reason this file exists rather than a line inside the test.
   *
   * `svelte-check` reads this directory (`tsconfig.svelte.json`); `tsc` cannot
   * be shown a `.svelte` at all. So this is where the panel's declared prop
   * type meets a `MetacomProvider` a consumer is holding, and where the defect
   * this fixture was written for is a **compile** error rather than a runtime
   * one:
   *
   *     Type 'MetacomProvider' is missing the following properties from type
   *     'MetacomProvider': #source, #entries, #byPath, #categories, and 18 more.
   *
   * Which is what bildhaft got from every one of its call sites while
   * `MetacomPanel.svelte` imported the class from `../src/metacom.js`: the
   * component's declaration came from the source and the product's from
   * `dist`, `tsc` emits `#private;` for a class's private fields, and two
   * declarations carrying it are nominally distinct however identical they
   * read. There was no fix on the product's side — `exports` has no `./src/*`
   * entry — and the cast that makes it go green
   * (`asDeclared<ComponentProps<typeof MetacomPanel>["store"]>(store)`) asserts
   * the identity away instead of establishing it.
   *
   * `svelte-panels.test.ts` mounts this, so it is a fact at runtime too and not
   * only a typecheck.
   */
  import { metacom, type MetacomProvider } from '@lautstark/bildquelle';
  import MetacomPanel from '../../svelte/MetacomPanel.svelte';

  let { say = () => {} }: { say?: (line: string) => void } = $props();

  /* Annotated rather than inferred on purpose: this is the consumer's
     declaration of the type, and it has to be the one that reaches the panel. */
  const held: MetacomProvider = metacom;
</script>

<MetacomPanel metacom={held} lang="de" {say} id="consumer-call-site" />
