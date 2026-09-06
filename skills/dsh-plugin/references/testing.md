# Testing a dsh plugin

The guiding idea: test the **built artifact** against the harness's **real**
machinery from npm. A plugin's failure modes are almost all in the seams — the
manifest declarations, the module edges, the service wiring — and a mock of the
harness reproduces your assumptions rather than the harness's behavior.

`npm test` builds first, then runs `node --import tsx --test test/*.test.mjs`.
Tests import `../lib/index.js` — what consumers actually get — and use tsx only
where a test genuinely needs a `.ts` source (dictionaries).

## Host logic, against a real Loader

```js
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { collect } from '../lib/index.js'

const ctx = new Context()
await ctx.plugin(Loader, { baseUrl: pathToFileURL(PACKAGE_ROOT).href + '/' })
await ctx.loader.create({ name: '@deepseek-ai/dsh-host-webserver', disabled: true })
```

**Create entries `disabled: true`.** A disabled entry is never imported, so the
test exercises resolution and manifest reading without starting any plugin and
without needing the plugin's own dependencies to behave. Enable an entry only
when the test is about what the plugin does once running.

`ctx.loader.builtins.<name> = () => {}` registers a `cordis:<name>` builtin,
which is a cheap way to get a real active fiber without a real module.

Dispose contexts in an `after` hook so a failing assertion cannot leak a fiber.

For a service the plugin consumes optionally, provide a stub shaped like the
methods you actually call — that is a genuine seam, not a mock of the harness:

```js
ctx.provide('agentPresets', {
  list: async () => [],
  compositionInventory: async () => [ /* rows */ ],
})
```

For filesystem-shaped behavior (resolution, duplicate detection), use real
fixture directories under `test/fixtures/` rather than mocking `fs`. Two
directories declaring the same package name at different versions is a fixture
you cannot get any other way.

## Browser wiring, against the real scanner

`@deepseek-ai/dsh-client-modules` is published, so the scanner that builds
`window.__DSH_BOOT__` can run in a test with a stub Loader and webServer:

```js
import { ClientModuleRegistry } from '@deepseek-ai/dsh-client-modules'

ctx.provide('loader', {
  internal: undefined,
  *entries() {
    yield {
      options: { name: pathToFileURL(join(ROOT, 'lib/index.js')).href },
      fiber: {}, disabled: false,
      parent: { tree: { ctx: { baseUrl: ctx.baseUrl } } },
    }
  },
})
ctx.provide('webServer', {
  port: 0,
  register: c => { if (c.path === '/plugins') route = c; return () => {} },
  tapIndex: () => () => {},
})
const graph = new ClientModuleRegistry(ctx).graph()
```

Worth asserting:

- the package joins the boot graph under its **package name**;
- the `/plugins` route serves the built bundle (200, and the bytes match);
- the `__ModuleLoader__.load({ id })` equals the package name;
- **the bundle requires nothing beyond the platform seeds** — assert the exact
  set, not a subset, so a new external shows up as a failure;
- no `.css` import survived into the bundle.

The requires assertion is the highest-value test in the suite: it catches the
commonest way a browser plugin breaks, and it catches it at build time instead of
in a page.

One wrinkle when comparing served bytes to the file on disk: the combo endpoint
rewrites the trailing `//# sourceMappingURL=` to the map it serves itself, and
inserts a bare `;` between concatenated resources. Strip a trailing sourcemap
comment from both before comparing — and require a leading newline in that
regex, or an optional `;` in the pattern will eat the semicolon ending the
bundle's own last statement.

## Dictionaries

TypeScript enforces key parity when one locale is the source of truth and the
others are `satisfies Record<Key, string>`. What it cannot see is the inside of a
string: a `{placeholder}` a translation dropped compiles fine and renders as
literal braces in front of a user. Assert that every locale declares the same
placeholder set per key.

## What not to test

- Rendering. Slot components need the renderer's synthesized props; standing that
  up costs more than it catches. Assert the bundle's shape, and check the UI by
  running dsh.
- Harness behavior. If a test would only prove the Loader loads plugins, delete
  it.
