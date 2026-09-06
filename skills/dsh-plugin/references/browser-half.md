# The browser half

The browser half is not a Node module. The host serves it over HTTP and the
page's own module system evaluates it as a classic script. Getting this wrong
produces failures that surface late and point at the loader rather than at your
code, so the mechanics are worth understanding before writing UI.

## How a browser half reaches the page

1. The host scans Loader entries for packages whose `package.json` declares
   `dsh.client.platform: 'web'` and exports `./client`.
2. Each becomes a row in `window.__DSH_BOOT__`, keyed by **package name**.
3. The page fetches each row from `/plugins/<id>/client.js`.
4. Executing the script only **registers** a factory. Materialization —
   running the factory and getting its exports — happens on first import.

So the artifact is a CJS bundle wrapped in a registration call:

```js
window.__ModuleLoader__.load({ id: "dsh-my-plugin", factory: (require) => {
  var module = { exports: {} }; var exports = module.exports;
  /* bundled code */
  return module.exports; } });
```

**The `id` must equal the package `name`.** The module table is keyed by package
name; a mismatch loads the script and then never resolves the module, with no
error at load time.

## The module table answers only seeds

The `require` handed to your factory resolves platform seed modules and other
materialized rows — nothing else. A `require` it cannot answer throws at
materialization.

Seeds: `react`, `react/jsx-runtime`, `react-dom`, `@deepseek-ai/cordis`,
`@deepseek-ai/dsh-client-store`, `@deepseek-ai/dsh-client-ui-slots`,
`@deepseek-ai/dsh-client-ui-primitives`. Confirm against the harness you target —
this list is the shell's, not a promise.

Everything else must be inlined by the bundler. Practically:

- Import harness UI packages **type-only** (`import type {} from '…'`). You want
  their declaration merges — `ctx.slots`, `ctx.locale`, the `SlotMap` keys — and
  those erase at compile time.
- Do not import runtime values across plugin packages. Two copies of a module
  with `Symbol`, `instanceof`, or singleton state are two identities, and they
  mismatch silently. Collaborate through Cordis services instead.
- Inline stylesheets as strings rather than importing `.css`, unless your build
  emits the CSS into the bundle. A surviving `.css` import is a `require` the
  table cannot answer.

Assert this in a test rather than trusting the build — see `testing.md`.

## The build

tsdown, with the wrapper as banner/intro/footer:

```ts
{
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib', format: 'cjs', platform: 'browser', target: 'es2022',
  clean: false, dts: false, sourcemap: true,
  deps: {
    neverBundle: ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/cordis'],
    alwaysBundle: [/^\.\//, /^\.\.\//],
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-my-plugin", factory: (require) => {',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
  },
}
```

Declarations for this half must come from `tsc`, not tsdown: a tsdown dts pass
wraps the banner and footer into a `.d.cts` that does not parse. Emit both
halves' declarations with one `tsc -p tsconfig.build.json --emitDeclarationOnly`
into `lib/types/`.

## Contributing UI through slots

Slots are the web client's typed composition registry. A feature contributes a
component into a slot another package declares:

```tsx
export const inject = ['slots']

export function apply(ctx: Context): void {
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'my-tab',
    order: 20,
    label: () => t('tab'),
    locale: NS,
    inject: () => ({ load }),      // the registrant's own data face
  }, MyTab))
}
```

`ctx.slots.inject(key, callback)` is what makes this safe from outside the
shipped bundle: the callback runs for each lifetime of the owner's declaration,
so you never import the owner and never race its activation. Registering
directly into a slot whose declaration has not mounted fails.

Slot keys are declaration-merged into `SlotMap` by whichever package declares
them, so you need that package as a **type-only** import for the key to
typecheck. Useful ones:

| Key | Owner | Cardinality |
|---|---|---|
| `settings.section` | ui-settings shell | list (a whole settings page) |
| `settings.plugins.tab` | ui-settings-plugins | list (a tab in the Plugins page) |
| `settings.general.item` | ui-settings-general | list (one preference row) |
| `conversation.session.header.actions` | ui-conversation | list (a header button) |

Find the current set from the harness's generated client catalog
(`pnpm run gen-client-catalog` in a checkout) or the slots subsystem page.

Fields on a registration: `name` (the slot), `id` + `order` + `label` for list
slots, `key` for keyed slots, `locale` (declares the dictionary namespace and
gives the component a `t` prop), `inject` (a function returning the props your
component needs), `children` (declares and authorizes child slots you render).

Components receive `PropsRuntime<'slot.key'> & PropsLocale<'ns'> &
InjectFace<YourFace>`. Nested helper components are plain functions and get
nothing automatically — thread `t` and data down as props.

## Locale

Register dictionaries into the harness's locale service; never read
`navigator.language`.

```ts
export const inject = ['slots', 'locale']

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'my.namespace': MyLocaleKey }
}

ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'my-plugin: dictionaries')
const t = ctx.locale.bind(NS)     // for copy outside the component tree
```

Dictionary files: make one locale the key source of truth and type the others
against it, so a missing key is a compile error.

```ts
export const en = { tab: 'Versions', count: '{count} packages' } satisfies Record<string, string>
export type MyLocaleKey = keyof typeof en
export const zh = { tab: '版本', count: '{count} 个包' } satisfies Record<MyLocaleKey, string>
```

`t(key, params)` interpolates `{name}` placeholders. Lookup falls back to the
`common` namespace and then to the key itself, so a missing string renders as
its key rather than blank.

Three things that are easy to get wrong:

- **The label thunk.** Copy outside the component tree (a tab label) uses
  `ctx.locale.bind(NS)` in a thunk, so it re-resolves when the language changes.
- **Host strings.** The host cannot know the reader's language. Send structured
  facts over the wire and let the browser write sentences.
- **`Intl` defaults to the browser.** `toLocaleTimeString()` with no argument
  formats for the browser's language, not the app's. Pass
  `ctx.locale.getSnapshot().active` in through the registration face — as a
  function, because the face is built once while the locale changes under it.

## Fetching from your own host half

The browser half runs in a normal page, so `fetch` works. Call the route your
host half registered, with whatever header its fence requires:

```ts
const response = await fetch('/my-plugin/api/list', {
  headers: { 'X-My-Plugin': '1' }, signal,
})
```

Keep the route path and header in one place per half and note the pairing in a
comment — they are a contract the compiler cannot check across the bundle
boundary.
