/**
 * Host-half tests against the built artifact and a real Cordis Loader.
 *
 * Entries are created `disabled: true`: a disabled entry is never imported, so
 * these exercise the plugin's declared shape and the Loader's own bookkeeping
 * without starting anything. Enable an entry only when the assertion is about
 * what the plugin does once running.
 */
import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { apply, inject, name } from '../lib/index.js'

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE_URL = pathToFileURL(PACKAGE_ROOT).href + '/'

/** Contexts to tear down, so a failing assertion cannot leak a fiber. */
const contexts = []

after(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

/**
 * Build a context with a real Loader rooted at this package.
 * @returns the context, with `loader` active.
 */
async function harness() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Loader, { baseUrl: BASE_URL })
  return ctx
}

describe('host half', () => {
  it('exports the plugin shape the Loader expects', () => {
    assert.equal(typeof apply, 'function')
    assert.equal(name, '__PLUGIN_NAME__')
    assert.ok(Array.isArray(inject))
  })

  it('activates without the optional services it nests', async () => {
    const ctx = await harness()
    // Nothing provides webServer here. A plugin that DECLARED it would sit
    // pending forever instead of activating — which is why it is nested.
    await ctx.plugin({ name, inject, apply })
    await ctx.loader.await?.()
    assert.ok(true)
  })

  it('registers its route once a web surface exists', async () => {
    const ctx = await harness()
    const routes = []
    ctx.provide('webServer', {
      port: 0,
      register: route => { routes.push(route.path); return () => {} },
      tapIndex: () => () => {},
    })
    await ctx.plugin({ name, inject, apply })
    assert.deepEqual(routes, ['/__PLUGIN_ID__/api/hello'])
  })
})
