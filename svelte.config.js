/* What `@sveltejs/vite-plugin-svelte` and `svelte-check` read here, and it is
 * deliberately empty of preprocessing.
 *
 * The components under `svelte/` ship as raw source and are compiled by the
 * consumer, with the consumer's config — so anything written here that changed
 * how they compile would be a rule this package could not make a consumer
 * follow. What it is for is the two tools that run inside this repository: the
 * plugin logs "no Svelte config found" on every test run without it, and a log
 * line nobody can act on is the kind of noise a real warning hides in.
 *
 * Not in `files`: it is a fact about this checkout, not about the package.
 */
export default {};
