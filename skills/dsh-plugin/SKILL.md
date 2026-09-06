---
name: dsh-plugin
description: Author, build, test, install, and publish a DeepSeek Harness (dsh) plugin — the two-half Cordis package shape, the browser module-table rules, settings/conversation slot contributions, locale registration, profile bundles and patch layers, and npm release with tag-triggered GitHub Actions. Use this whenever the user mentions a dsh plugin, DeepSeek Harness plugin, cordis.patch.yml, `dsh plugin add`, a dsh profile or bundle, contributing UI to the dsh web client, or publishing anything named `dsh-*` — and also when they are simply trying to make dsh do something it does not do yet, because in dsh that is always a plugin.
---

# DeepSeek Harness plugins

A dsh plugin is an npm package that contributes to a running harness through
Cordis services. Most of the work is not writing features — it is getting the
two halves, the manifest declarations, and the profile wiring exactly right, because
each of those fails in a way that is quiet rather than loud. This skill exists
to keep you out of those pits.

## Establish the ground truth first

Version-specific details change. Before committing to an approach, find the
harness the user actually runs and read from it:

```bash
npm view @deepseek-ai/dsh version          # what npm ships
ls "${DSH_HOME:-$HOME/.dsh}/profiles"      # what they boot
```

If a source checkout is available, it is the better reference — `docs/user/develop/`
holds the official authoring tutorials and `docs/subsystems/` documents each
service. The npm packages carry `lib/types/**/*.d.ts`, which is enough to work
against when there is no checkout.

Two facts worth checking early because they shape everything downstream: which
profile the plugin targets (`web` implies a browser half; `headless`/`acp` do
not), and which harness version's types to build against.

## The shape of a plugin

A plugin package can have two halves, and they are independent:

| Half | Artifact | Runs in | Required |
|---|---|---|---|
| Host | `lib/index.js`, ESM | the dsh Node process | yes |
| Browser | `lib/client.js`, CJS in a loader wrapper | the web client page | only for UI |

Both are described by one `package.json`. Three declarations do the wiring:

```jsonc
{
  "main": "./lib/index.js",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./package.json": "./package.json"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },   // makes it installable as a profile layer
    "client": { "platform": "web", "inject": [] }  // makes the browser half load
  }
}
```

`assets/template/` holds a working skeleton of all of this. Copy it rather than
retyping — `scripts/scaffold.py` does the copy and the renaming:

```bash
python scripts/scaffold.py <target-dir> --name dsh-my-plugin --ui
```

Drop `--ui` for a host-only plugin; it omits the browser half and the
`dsh.client` declaration, which is the right shape for a tool or a hook.

## Writing the host half

The host half is an ordinary Cordis plugin: `apply(ctx)`, plus `name` and
`inject` exports. Read `references/host-half.md` before writing one — it covers
the service catalogue, the difference between declared and nested injection,
and the extension points that matter (tools, skills, hooks, HTTP routes).

The one decision that trips people up is **declared vs nested injection**:

```ts
export const inject = ['loader']                          // required: no loader, no plugin
export function apply(ctx: Context): void {
  ctx.inject(['webServer'], scope => registerWeb(scope))  // optional: absent = contribute nothing
}
```

Declaring a service the plugin can live without makes the package unloadable in
profiles that lack it — the fiber sits pending forever rather than failing, which
reads as a hang. Nest anything the plugin degrades gracefully without.

## Writing the browser half

Read `references/browser-half.md` before writing UI. The constraint that breaks
plugins is not obvious from the outside: the page's module table answers only a
fixed set of **platform seed modules**, so anything else your bundle `require`s
throws when the factory materializes — after the page has loaded, in a stack
trace that names the loader rather than your code.

Practically that means:

- Bundle everything except `react`, `react/jsx-runtime`, `react-dom`,
  `@deepseek-ai/cordis`, `dsh-client-store`, `dsh-client-ui-slots`,
  `dsh-client-ui-primitives`.
- Import harness UI packages **type-only** — you need their declaration merges
  (`ctx.slots`, `ctx.locale`, the `SlotMap` keys), never their runtime values.
- The bundle's `__ModuleLoader__.load({ id })` must equal the package `name`,
  or the script loads and the module never resolves.

Contribute UI with `ctx.slots.inject(key, () => ctx.slots.register(...))`. The
`inject` wrapper is what lets a package outside the shipped bundle contribute
into a slot another package declares, without importing it and without racing
its activation.

## Localize through the harness, not the browser

dsh owns a locale service; a plugin registers dictionaries into it rather than
reading `navigator.language`. Anything else puts the plugin on a different
language from the rest of the UI the moment the user changes the setting.

```ts
export const inject = ['slots', 'locale']
ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'my-plugin: dictionaries')
const t = ctx.locale.bind(NS)          // for copy outside the component tree
// and `locale: NS` on the slot registration, which gives components a `t` prop
```

Two consequences that are easy to miss:

- **Host-side strings must not be sentences.** The host cannot know the reader's
  language — the locale is a browser-side preference. Send structured facts
  (`{ kind: 'duplicate-packages', names: [...] }`) and let the panel write the
  sentence. This also makes any JSON your plugin serves useful to other readers.
- **`Intl` defaults to the browser's language, not the app's.** A timestamp
  formatted with a bare `toLocaleTimeString()` will disagree with the rest of
  your tab. Pass the harness's active locale (`ctx.locale.getSnapshot().active`)
  in through the registration face, as a function so it stays fresh.

## Testing

Read `references/testing.md`. The pattern that pays for itself: test against the
**built artifact** and against the harness's **real** machinery from npm, not
against mocks of it.

- Host logic: a real Cordis `Loader`, with entries created `disabled: true` so
  nothing is imported and no plugin starts.
- Browser wiring: the real `@deepseek-ai/dsh-client-modules` scanner, asserting
  the package joins the boot graph, the `/plugins` route serves the bundle, the
  factory id matches, and **the bundle requires nothing beyond the seeds**. That
  last assertion is the one that catches the commonest breakage.
- Dictionaries: same keys and same `{placeholder}` set across locales.
  TypeScript already enforces the keys; a dropped placeholder is what it misses.

## Installing into a profile

A profile (`$DSH_HOME/profiles/<name>`) composes bundles. Layers apply in order:
each bundle's `cordis.patch.yml`, then the profile's own, then
`$DSH_HOME/cordis.patch.yml`, then `--patch` overlays. Later layers win per row,
and a patch replaces a row's whole `config` rather than merging keys.

```bash
dsh plugin --profile web add <spec>     # npm name, ./dir, link:/abs/dir, ./x.tgz, github:owner/repo
dsh --profile web --dump-config         # verify the layer before booting
```

For local iteration, `link:` symlinks the checkout so a rebuild is enough. Or
skip installing and point a patch row at the build output — see
`references/install-and-release.md` for that and for the git-install build-script
gate, which surprises people: a git dependency ships sources, so pnpm must run
your `prepare` script, and pnpm ≥10 refuses until the user allowlists it.

## Publishing

Read `references/install-and-release.md` for the full checklist. The parts that
are specific to dsh plugins rather than to npm in general:

- **`prepare`, not just `prepack`.** `prepare` is what a git install runs. Without
  it `dsh plugin add github:...` installs a package with no `lib/`.
- **Think twice before declaring peer dependencies.** A plugin that reaches
  everything through `ctx` imports no harness module at runtime and genuinely
  has no dependencies. And while the dsh family ships prereleases, semver only
  admits a prerelease when the range holds a comparator with the same
  `[major.minor.patch]` — so `>=0.1.2-rc.1` does not match `0.1.3-alpha.1`, and a
  pinned peer range warns on a healthy install. State compatibility in the README
  instead; add peers once dsh ships stable versions.
- **Two packaging-check false positives are expected**, and the harness itself
  waives both. `publint` calls `lib/client.js` "CJS written as ESM" — Node never
  resolves it; the page evaluates it as a classic script. `attw` reports
  `cjs-resolves-to-esm` — an ESM-only package is the intent.

Release on a pushed tag, so a merge publishes nothing and the tag is the
confirmation gesture. `assets/template/.github/workflows/` has both workflows;
the release job checks the tag against the manifest, refuses an already-published
version, runs the checks, publishes with provenance, and opens the GitHub
release. The only manual setup is an npm **automation** token as the `NPM_TOKEN`
repository secret — automation tokens are the ones that bypass 2FA in CI.

```bash
npm run release:check
npm version patch && git push --follow-tags
```

Keep the packaging checks out of `prepublishOnly`: `attw --pack` shells out to
`npm pack`, which inherits `npm_config_dry_run` from `npm publish --dry-run` and
then writes no tarball, so a `prepublishOnly` that runs them makes the publish
rehearsal impossible.

## Reference files

Read the one that matches what you are doing; they are written to be opened
individually.

| File | Read it when |
|---|---|
| `references/host-half.md` | Writing host-side behavior: services, tools, hooks, HTTP routes, degradation |
| `references/browser-half.md` | Writing UI: the module table, slots, locale, the bundle build |
| `references/packaging.md` | Setting up `package.json`, exports, types, dependency policy |
| `references/install-and-release.md` | Profiles, patch layers, install routes, npm release, CI |
| `references/testing.md` | Writing the test suites |
| `references/troubleshooting.md` | Something loaded but did not appear, or failed oddly |
