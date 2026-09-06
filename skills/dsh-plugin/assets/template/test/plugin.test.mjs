/**
 * Contract tests against the built artifact and the harness's real machinery.
 *
 * The browser bundle is never imported by Node — the page evaluates it as a
 * classic script — so what is checkable here is everything that makes that
 * evaluation possible: the manifest wiring, the served bytes, the factory id,
 * and the module edges.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { before, describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { ClientModuleRegistry } from '@deepseek-ai/dsh-client-modules'

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const PACKAGE_NAME = '__PLUGIN_NAME__'

/**
 * Specifiers this bundle is allowed to ask the page's module table for.
 *
 * This is a budget, not a capability list: the seeds the shell installs are
 * `react`, `react/jsx-runtime`, `react-dom`, `@deepseek-ai/cordis`,
 * `dsh-client-store`, `dsh-client-ui-slots`, and `dsh-client-ui-primitives`,
 * and anything outside them must be inlined at build time, because a `require`
 * the table cannot answer throws when the factory materializes. Widen this
 * list when you deliberately start using another seed — and let it fail first,
 * so a specifier that leaked out of the bundle by accident is never mistaken
 * for one you meant.
 *
 * It starts at just the JSX runtime because the scaffolded component uses JSX
 * and nothing else; importing a hook adds `react`.
 */
const ALLOWED_REQUIRES = ['react/jsx-runtime']

let graph
let route

before(() => {
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(PACKAGE_ROOT).href + '/'
  ctx.provide('loader', {
    internal: undefined,
    *entries() {
      yield {
        options: { name: pathToFileURL(join(PACKAGE_ROOT, 'lib/index.js')).href },
        fiber: {},
        disabled: false,
        parent: { tree: { ctx: { baseUrl: ctx.baseUrl } } },
      }
    },
  })
  ctx.provide('webServer', {
    port: 0,
    register: candidate => {
      if (candidate.path === '/plugins') route = candidate
      return () => {}
    },
    tapIndex: () => () => {},
  })
  graph = new ClientModuleRegistry(ctx).graph()
})

describe('browser half', () => {
  it('joins the boot graph under its package name', () => {
    assert.ok(graph.entries.find(entry => entry.id === PACKAGE_NAME))
  })

  it('registers its factory under the id the module table keys on', () => {
    const bundle = readFileSync(join(PACKAGE_ROOT, 'lib/client.js'), 'utf8')
    const id = /__ModuleLoader__\.load\(\{[\s\S]{0,80}?id: "([^"]+)"/.exec(bundle)?.[1]
    // A mismatch loads the script and then never resolves the module.
    assert.equal(id, PACKAGE_NAME)
  })

  it('asks the module table for nothing beyond the platform seeds', () => {
    const bundle = readFileSync(join(PACKAGE_ROOT, 'lib/client.js'), 'utf8')
    const requires = [...new Set(
      [...bundle.matchAll(/\brequire\("([^"]+)"\)/g)].map(match => match[1]),
    )].sort()
    assert.deepEqual(requires, [...ALLOWED_REQUIRES].sort())
  })

  it('serves the built bundle on the plugin route', async () => {
    const row = graph.entries.find(entry => entry.id === PACKAGE_NAME)
    let status = 0
    let body = Buffer.alloc(0)
    const response = {
      writeHead(next) { status = next; return response },
      end(chunk) { body = chunk === undefined ? Buffer.alloc(0) : Buffer.from(chunk); return response },
    }
    await route.handler({ method: 'GET', url: row.url }, response)
    assert.equal(status, 200)
    // The combo endpoint rewrites the trailing sourcemap reference to the map it
    // serves itself. The leading \n in the pattern matters: without it the
    // optional `;` eats the semicolon ending the bundle's own last statement.
    const strip = source => source.replace(/\n\s*;?\s*\/\/# sourceMappingURL=\S*\s*$/, '')
    assert.equal(
      strip(body.toString('utf8')),
      strip(readFileSync(join(PACKAGE_ROOT, 'lib/client.js'), 'utf8')),
    )
  })
})
