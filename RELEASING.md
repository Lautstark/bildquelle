# Releasing

There is no registry publish. A **git tag is the release** — consumers resolve
`#semver:^1.0.0` against the tags in this repo, so pushing a tag is the moment a
version becomes real for bildhaft and vorlaut. Treat it as publishing, because
it is.

## Why v1.0.0 has no bump commit

`npm version` bumps, and `1.0.0` was already the version in `package.json` — it
had simply never been tagged. So `v1.0.0` was cut by hand, with the gate run
manually because `preversion` only fires on a bump:

```
npm run typecheck && npm test && npm run build && npm run build:browser
git tag -a v1.0.0 -m "1.0.0"
```

Annotated, because that is what `npm version` creates and the tags should not
be two different kinds of object. Every release after this one uses the flow
below.

## Cutting a release

From a clean `main`:

```
npm version minor
```

`preversion` runs typecheck, tests and both builds first, so a broken tree
cannot be tagged. On success npm bumps `package.json`, commits, and creates the
tag — `v1.1.0`, which is the shape npm's `#semver:` resolver expects.

Nothing has left your machine yet. Check `git show --stat HEAD` and then:

```
git push --follow-tags
```

CI re-runs the whole gate on the tag from a clean checkout, and asserts the tag
matches `package.json`.

### Why the push is a separate step

`npm version` does not push, and this repo deliberately leaves it that way. A
pushed tag can be resolved by a consumer within seconds and must never be moved
afterwards, so the irreversible half is its own command rather than a side
effect of one that sounds local. If you would rather it were automatic, add
`"postversion": "git push --follow-tags"` — but then `npm version patch`
publishes, and it should read that way to whoever runs it.

## Which bump

Consumers pin with `^`, so the major is the only thing protecting them.

- **patch** — a fix with no API change.
- **minor** — new exports, new optional arguments.
- **major** — anything a consumer must change code for: a removed or renamed
  export, a changed return shape, a new required argument. The
  `PictogramStatus` code added in `f62dfcc` is the kind of change to look at
  twice: adding a field is minor, changing what an existing one means is not.

A licensing change is always major, whatever the diff size. Consumers inherit
the behaviour described in the README without inheriting the README, and the
major is the only signal that reaches them.

## Moving a consumer onto the range

Changing a consumer's spec to `#semver:^1.0.0` and running `npm install` does
nothing, and says nothing. npm keeps whatever commit the lockfile already names
and never looks at the tags.

That is not a bug. Every commit made before `v1.0.0` also calls itself `1.0.0`,
because the version sat in `package.json` untagged for the whole of that
history. A lockfile pinning some old sha therefore already claims a version the
range accepts, and npm has no reason to go looking. Name the package to force
the question:

```
npm install "github:Lautstark/bildquelle#semver:^1.0.0"
```

Then check what landed, and do not take a green build as the answer — the old
commit is still a working bildquelle, so tests pass against it just as happily:

```
grep -A2 '"node_modules/@lautstark/bildquelle"' package-lock.json
```

The `resolved` sha there should be the one `git rev-parse v1.0.0^{}` prints in
this repo. When bildhaft moved, the spec said `^1.0.0`, the build passed, the
e2e suite passed, and the installed code was still four commits old.

Two smaller things fall out of the same re-resolution: npm drops the
`integrity` line for the dependency, and the range is only honoured from then
on — it does not retroactively explain what the previous sha was.

None of this outlives the next release. Once a second version exists the
versions differ, ordinary resolution works, and only a lockfile written before
the tags existed is affected.

## Never move a published tag

If a tag is wrong, cut the next version. Re-pointing `v1.1.0` leaves consumers
with lockfiles pinned to a commit that no longer matches the tag, and nothing
warns them.
