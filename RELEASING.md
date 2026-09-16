# Releasing

**Since 2026-09-16 this package is published to npmjs.org as
`@lautstark/bildquelle`, prebuilt, by CI, from the commit subjects.** Nobody
runs `npm version` any more and nobody writes a tag. `dist/` — both the node
build and the browser bundle — is in the tarball and there is no `prepare`
script: a consumer installs compiled output and compiles nothing.

The `github:Lautstark/bildquelle#vX.Y.Z` pins still resolve for every tag cut
before that date. No tag cut after it carries a build step, so a consumer that
wants anything newer than v2.2.0 takes it from npm:

```
npm install @lautstark/bildquelle@^2.2.0
```

A **git tag is still the release**, and it is still the thing that must never
move. What changed is who cuts it.

## What happens on a push to main

`.github/workflows/release.yml` calls the family's reusable workflow in
`Lautstark/.github`, which runs the gate — typecheck, the tests, both builds —
checks that the tarball `npm pack` would ship carries every entry point
`package.json` declares and no `prepare` script, and then runs
`semantic-release`, configured in `release.config.mjs`.

semantic-release reads every commit since the last `v*` tag and decides:

| subjects since the last tag contain | bump |
|---|---|
| `feat!:`, or a `BREAKING CHANGE:` trailer | **major** |
| `feat:` | **minor** |
| `fix:`, `perf:` | **patch** |
| only `docs:`, `test:`, `ci:`, `build:`, `chore:`, `refactor:` | none — green, nothing published |

If there is a bump, it writes the version into `package.json` and the
lockfile's mirror of it, prepends the notes to `CHANGELOG.md`, commits the
three as `chore(release): x.y.z`, tags that commit `vx.y.z`, publishes the
tarball to npmjs.org with provenance, and writes a GitHub release with the
same notes. Then it checks that the tag on the commit, `package.json` and what
the registry answers for that version are one number — the check the old
tag-triggered CI made, asked of the commit it just tagged.

**So the bump is decided when the commit is written, not when the release is
cut.** The commit subject is the release note and the version at once, which
is why `commit-messages.yml` refuses a subject without a prefix. Everything
below about *which* bump is now about which prefix — and it is worth more
than it was, because the number is a resolver input again: consumers take
this package as a caret range, and Renovate merges a minor or a patch into
them on its own once their tests pass. **This package is the exception the
family keeps by hand**: its `renovate.json5` rules say a bump of
`@lautstark/bildquelle` in a consumer waits for a person whatever the size,
because what it changes is what may leave a METACOM folder, and that is not a
question a green test suite answers. A major waits everywhere.

## What a person still does, once

The workflow stops before semantic-release, green, with a notice, until the
npm side exists. That side is an account and cannot be created from a
repository: the `lautstark` organisation on npmjs.org, the first publish of
this package by hand (`npm ci && npm run build && npm run build:browser &&
npm publish --access public` from a clean checkout), and then either trusted
publishing for `release.yml` plus a repository variable
`NPM_TRUSTED_PUBLISHING=true`, or an organisation secret `NPM_TOKEN`.
`@lautstark/sicherung`'s RELEASING.md spells the three out; they are the same
for every package in the family.

## Which prefix

Consumers take `^`, so the major is the only thing protecting them.

- **`fix:`** — a fix with no API change.
- **`feat:`** — new exports, new optional arguments.
- **`feat!:`** — anything a consumer must change code for: a removed or
  renamed export, a changed return shape, a new required argument. Put the
  reason in a `BREAKING CHANGE:` trailer; it becomes the first paragraph of
  the release note. The `PictogramStatus` code added in `f62dfcc` is the kind
  of change to look at twice: adding a field is minor, changing what an
  existing one means is not.

A licensing change is always major, whatever the diff size. Consumers inherit
the behaviour described in the README without inheriting the README, and the
major is the only signal that reaches them.

### The database is shared, so a schema change is not just a schema change

bildhaft and vorlaut are both served from `lautstark.github.io`. Same origin,
one IndexedDB — so there is **one `bildquelle` database with two programs in
it**, and each of them pins this package to an exact tag on its own schedule.
The versions differ routinely, and a Pages deploy of one is not a deploy of the
other.

IndexedDB does not negotiate. Opening with a version lower than the stored one
fails outright, so the app that pins the lower number is locked out of its own
cache entirely — `search()` throws, which the contract says it must never do.

This happened. `v1.6.0` bumped `DB_VERSION` to 2 to clear rows a new cache key
had made unreachable. For about half an hour, anybody who opened vorlaut and
then bildhaft found bildhaft unable to read anything. Both apps were correct;
they simply disagreed by one integer.

Since `v1.6.2` the open takes whatever version is there and adds any store it
finds missing, so a copy meeting a newer database no longer fails. Two rules
keep that true:

- **Schema changes must be additive.** New stores are safe. Renaming a store or
  changing a `keyPath` breaks every sibling that has not been redeployed, and
  no care at the open can soften it.
- **Change the data, not the schema.** The language-keyed cache — `de:apfel`
  rather than `apfel` — needed no schema change at all. The version bump that
  caused the outage was only there to purge stale rows that would have expired
  on their own. Tidiness is not worth a coordinated two-repo deploy.

A change that breaks either rule is a **major**, even when the exported API has
not moved. It is the one kind of break that hits consumers who change nothing.

## Moving a consumer onto the range

Before 2026-09-16 this section explained why `#semver:^1.0.0` on a `github:`
dependency resolved to nothing new — every pre-tag commit also called itself
`1.0.0`, and npm never looked at the tags. That trap was the git resolver's
and is gone with it: `npm install @lautstark/bildquelle@^2.2.0` asks the
registry, and the registry has exactly the versions that were released.

## Why v1.6.3 is published and should not be pinned

`v1.6.3` is a bad release. It is still on the remote, because a published tag
cannot be moved, and `v1.6.4` supersedes it — but nothing should pin it, and
`^1.6.0` resolves past it on its own.

What it changed was METACOM's ranking. METACOM writes some compounds with a
separator and some without, so the negation symbol — filed as `nichtkein`, the
pair "nicht/kein" written without the slash a filename cannot hold — could
score no better than a bare prefix and sat below every spelling that happened
to carry an underscore. `v1.6.3` fixed that by reading a run-together label as
the query plus a word whenever what followed was three characters or more.

That rule was too wide. It also promoted `nichtbinaer`, which is a compound —
one word naming a third thing — rather than a pair. And vorlaut reads
`Candidate.score` as a **grade**: its picker holds a `WHOLE_WORD` of 60 and,
below it, captions the answer "this collection has no picture of its own for
nicht". Promoting the compound over that line took the caption away for the
exact search it was written for. Two tests in vorlaut's `picker_match` went red
on the bump; `v1.6.4` narrows the rewrite to labels whose halves are both
German negation words, and the caption keeps its case.

The rule that comes out of it is not about negation:

> **The ladder is a consumer contract, not an implementation detail.** The
> comment on `scoreLabel` says the score is shared so that switching sources
> does not reshuffle results — and downstream it does more than order rows.
> vorlaut reads the rungs by number and captions on them. A change to what any
> rung means is a change to what two apps say to the people using them, and it
> reaches them silently: the version does not move unless somebody moves it,
> and no type changes shape.

So a ranking change is not a tidy-up. Run both consumers' suites *before*
cutting the tag, not after the bump — `npm test` and `npm run test:e2e` in
bildhaft, the same two in vorlaut, whose `tests/unit/picker_match.test.ts`
searches a live provider rather than a fabricated score for exactly this
reason. It is the cheapest thing in this document and it is the one that would
have caught this.

## Never move a published tag

If a tag is wrong, cut the next version: a `fix:` commit. Re-pointing `v1.1.0`
leaves consumers with lockfiles pinned to a commit that no longer matches the
tag, and nothing warns them. Since 2026-09-16 that goes for the npm side too —
a published version cannot be replaced, only deprecated and superseded.
