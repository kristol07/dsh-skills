# The host half

The host half is a plain Cordis plugin loaded into the dsh Node process. It is a
module exporting `apply`, optionally `name` and `inject`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-my-plugin'   // display metadata for diagnostics
export const inject = ['tools']       // services this plugin cannot work without

export function apply(ctx: Context): void {
  // register everything here; every registration should be an effect
}
```

`name` is optional and only labels the plugin in diagnostics. `apply` may be
async — the Loader awaits it.

## Declared vs nested injection

This is the decision most worth getting right.

```ts
export const inject = ['loader']                            // hard requirement
export function apply(ctx: Context): void {
  ctx.inject(['webServer'], scope => registerWeb(scope))    // optional capability
}
```

A declared service is a precondition: until it exists, the plugin's fiber stays
**pending**. In a profile that never provides it, the fiber stays pending
forever — which shows up as a plugin that silently never runs, not as an error.
So declare only what the plugin genuinely cannot work without, and nest anything
it can do without. A plugin that nests `webServer` stays loadable in `headless`
and `acp` profiles, where it simply contributes nothing.

Inside `ctx.inject(...)`, the callback receives a scope whose lifetime is tied to
the service's presence; registrations made on it are withdrawn when the service
goes away.

## Effects

Every registration should be a `ctx.effect`, so the Loader can unload and
hot-reload the plugin cleanly:

```ts
ctx.effect(() => ctx.webServer.register(route), 'my-plugin: read route')
ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'my-plugin: dictionaries')
```

The label is a diagnostic string. Services that return a disposer (most do) can
be wrapped directly; for a teardown that needs work, return a function:

```ts
ctx.effect(() => async () => { await handle.close() }, 'my-plugin: close ledger')
```

## The service catalogue

Discover services from the harness itself rather than from memory — they are
generated into the docs. In a source checkout, each page under
`docs/subsystems/` carries a "Cordis API" section listing `ctx.<service>` and its
exact method signatures; `docs/config-catalog.md` lists what each loadable
package accepts as config. From npm, read `lib/types/**/*.d.ts`.

The ones plugin authors reach for most:

| Service | For |
|---|---|
| `ctx.tools` | Register model-facing tools (`ctx.tools.register(definition)`) |
| `ctx.skills` | Register skills the model can invoke |
| `ctx.loader` | The live plugin tree: `entries()`, `config.baseUrl`, `internal` |
| `ctx.webServer` | HTTP routes, upgrade routes, index injections (web profiles) |
| `ctx.credentials` | Resolve secrets without putting them in prompts |
| `ctx.storageDomain` | Durable per-plugin state |
| `ctx.agents` | Drive agents: `followup()`, `steer()`, `cancel()` |
| `ctx.agentPresets` | The preset roster and each preset's composition (optional) |
| `ctx.systemPrompt` | Contribute a prompt section |

Optional services are read with `ctx.get('name')`, which returns `undefined`
when nothing provides them — that is how to consume something without making it
a precondition.

## Extension points

Product features are listeners on documented events, not modifications to the
loop. The waterfall events return typed decisions:

```ts
ctx.on('tools/pre-execute', async (exec, next) => {
  if (!allowed(exec)) return { kind: 'deny', reason: 'Denied by policy.' }
  return next()
})
```

Common points: `agent/session-start`, `agent/pre-step`, `agent/request`,
`tools/pre-execute`, `tools/execute` (wraps the dispatch lifetime),
`tools/post-execute` (transforms the result), `tools/result` (observes the
immutable outcome), `agent/turn-stopping`, `session/event` (durable settlements),
`agent/assistant-stream` (live chunks).

Pick by intent: `pre-execute` to allow/deny/ask, `execute` to wrap with
timeouts or metrics, `post-execute` to transform, `result` to observe only.

## Serving data to your own UI

A plugin cannot add a `ctx.remote.<namespace>` from outside the harness repo —
those are generated at build time by Typert and mounted by the `api-remotes`
assembly. Two channels are available instead:

**A feature-owned HTTP route.** The webserver carrier owns no authentication or
Origin policy of its own, so a route that discloses anything about the host must
state its own fence:

```ts
ctx.effect(() => ctx.webServer.register({
  kind: 'exact',
  path: '/my-plugin/api/list',
  handler: async (req, res) => { /* check trust, then answer JSON */ },
}), 'my-plugin: read route')
```

A workable fence for a local-only route: require a loopback `Host`, a same-origin
`Origin` when present, a `Sec-Fetch-Site` of `same-origin`/`none`, and a custom
request header (which a cross-origin form post cannot set).

**An index injection**, for data that is fixed at page load:

```ts
ctx.on('webserver/index-inject', table => {
  table.push({ kind: 'global', name: '__MY_PLUGIN__', value: data })
})
```

The table is collected fresh on every index render, so listeners read live state
at emit time. Rows are JSON and the renderer escapes them.

## Reading the plugin tree

`ctx.loader` is the live tree. Useful shapes:

```ts
for (const entry of ctx.loader.entries()) {
  entry.options.name      // module specifier
  entry.options.config    // this mount's config
  entry.options.group     // a container, not a plugin — skip it
  entry.id                // stable entry id
  entry.disabled          // includes disabled ancestors
  entry.fiber?.state      // 0 pending, 1 loading, 2 active, 3 failed, 4 disposed, 5 unloading
  entry.parent.tree.ctx.baseUrl   // this subtree's resolution base
}
ctx.loader.config?.baseUrl        // the profile's own base
```

`FiberState` is a const enum, so there is no runtime object to read — mirror the
numbers with a comment rather than importing it.

Note `ctx.loader.ctx` is the **accessing** context, not the Loader's own, so its
`baseUrl` is unset. Use `ctx.loader.config?.baseUrl`.

## Two planes

Plugin rows live on two independent planes, and a tool that reads only one will
be wrong about what the harness runs:

- **Global** — the profile's Loader tree, from `ctx.loader.entries()`.
- **Preset** — each agent preset's composition (`agent.<preset>.yml`), mounted
  per session when that preset is selected. Read it with the optional
  `ctx.get('agentPresets')?.compositionInventory()`, which parses composition
  files rather than the live tree, so an unmounted preset still answers and
  reading one cannot mount it early.

A preset row's bare package name resolves from the **profile's** base, not the
preset's own directory: a user-authored preset lives under the harness home,
where Node's upward `node_modules` walk never reaches the harness's
dependencies.
