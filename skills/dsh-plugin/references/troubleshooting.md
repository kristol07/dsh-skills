# Troubleshooting

Most dsh plugin failures are quiet. This maps a symptom to the seam that
produces it.

## The plugin never runs, and nothing is logged

The fiber is **pending**, waiting on a declared service the profile never
provides. Check `inject` — anything the plugin can live without belongs in a
nested `ctx.inject([...], scope => …)` instead. `dsh --profile <name>
--dump-config` shows the composed tree; the Plugins settings tab shows fiber
state per entry.

## The row is not in the composed config at all

The patch did not apply. A patch targeting a row `id` that does not exist prints
a stderr warning and continues; an insert lands but may be in a different layer
than you expect. `--dump-config` groups rows under `# ==` comments naming the
file that contributed them — find yours there.

An empty or comments-only patch file **fails boot**. Disable a layer with `[]`,
not by emptying it.

## The UI does not appear, but the host half runs

Work down the chain:

1. **Is the package a boot row?** It needs `dsh.client.platform: 'web'` and a
   `./client` export. A malformed declaration among already-loaded entries fails
   the client-modules fiber loudly at activation; a broken one appearing later
   only logs a warning.
2. **Does the bundle load?** Check the network tab for `/plugins/…/client.js`.
3. **Does the factory materialize?** A `require` the module table cannot answer
   throws here. The message names the missing specifier — bundle it instead of
   leaving it external.
4. **Does the factory id match the package name?** A mismatch registers the
   factory under a key nothing looks up: the script loads, the module never
   resolves, and nothing errors.
5. **Did the slot registration run?** Registering into a slot whose declaration
   has not mounted fails; always go through `ctx.slots.inject(key, …)`.

## `require("…") missed the module table`

Exactly the case above. The bundler left something external that is not a
platform seed. Fix the build's `deps.neverBundle` / `alwaysBundle`, then assert
the exact require set in a test so it cannot come back.

## Two copies of one package are loaded

Cordis matches services, branded types, and `instanceof` on runtime identity, so
two copies mismatch silently rather than erroring. It happens when a plugin
declares a harness package as a hard `dependency` instead of a peer, when a
profile's module-fallback links a second copy, or when a source checkout and an
npm install are mixed. Compare the resolved directories, not the names.

## Boot fails on a native module

For example `Cannot find module './build/Release/fs_ext.node'` from
`@deepseek-ai/dsh-session-persistence-jsonl`. The native dependency was never
compiled — on Windows that usually means no MSVC toolchain. It is an environment
problem, not a plugin problem. Install the C++ build tools and `pnpm rebuild
<pkg>`, or run a profile that does not load it.

## The published package installs but has no `lib/`

A git install ran no build. Ship a `prepare` script (not just `prepack`), and
tell users about the pnpm `allowBuilds` allowance a git dependency needs.

## `npm publish --dry-run` fails with ENOENT on the tarball

`attw --pack` shells out to `npm pack`, which inherits `npm_config_dry_run` from
the outer publish and writes nothing. Keep packaging checks out of
`prepublishOnly`; run them from `release:check` and CI.

## publint or attw complains about the browser bundle

Expected, and waived by the harness for its own packages. `lib/client.js` is
CJS under `"type": "module"` because Node never resolves it — the page evaluates
it as a classic script. `cjs-resolves-to-esm` is the intent of an ESM-only
package. Ignore those two specifically rather than restructuring around them.

## The tab shows the wrong language

Check three places: the copy goes through `ctx.locale` rather than hardcoded
strings; the label is a thunk (`label: () => t('tab')`) so it re-resolves on a
language change; and any `Intl` call receives the harness's active locale, since
`toLocaleString()` with no argument follows the **browser**, not the app.

## A host-side string reaches the user untranslated

The host cannot know the reader's language. Any user-facing text built on the
host is a design error — send structured facts and write sentences in the
browser half.
