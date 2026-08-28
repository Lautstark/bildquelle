import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
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
