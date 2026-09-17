import { svelte } from '@sveltejs/vite-plugin-svelte';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  /* The components under `svelte/` are compiled here the same way a consumer
     compiles them — which is the point of shipping them as source, and the only
     way a test of one is a test of what a product gets. Measured 2026-09-17:
     the full plugin works in a vitest config at these versions. */
  plugins: [svelte()],
  /* Required, and the failure without it says nothing about configuration:
     vitest otherwise resolves svelte's `server` export, `mount()` throws
     `lifecycle_function_unavailable`, and every test in the file fails at once.
     Written first and checked first. */
  resolve: { conditions: ['browser'] },
  test: {
    // `.claude/worktrees/` holds full checkouts of this repo, each with its own
    // `test/`. Without this, a local `npm test` collects every copy and runs the
    // suite once per worktree — including against whatever half-finished state a
    // branch happens to be in. CI never saw it, because a fresh checkout has no
    // worktrees in it. stimmquelle hit this first and its config says the same.
    //
    // Measured 2026-08-28: 14 test files under `.claude/worktrees/` were being
    // collected on top of this repository's own 7.
    include: ['test/**/*.test.ts'],
    exclude: [...configDefaults.exclude, '.claude/**'],
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
