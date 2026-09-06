/**
 * Host half of `__PLUGIN_NAME__`.
 *
 * @module __PLUGIN_NAME__
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'

/** Diagnostic label for this plugin's fiber. */
export const name = '__PLUGIN_NAME__'

/**
 * Services this plugin cannot work without. Declaring one the plugin could
 * live without leaves its fiber pending forever in a profile that lacks it —
 * which reads as a hang, not an error. Nest the optional ones instead.
 */
export const inject: string[] = []

/**
 * Register everything this plugin contributes.
 * @param ctx - the plugin's own context.
 */
export function apply(ctx: Context): void {
  // A capability the plugin degrades gracefully without is nested, so the same
  // package stays loadable in a headless or ACP profile.
  ctx.inject(['webServer'], scope => {
    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: '/__PLUGIN_ID__/api/hello',
      handler: (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        // The carrier owns no Origin policy of its own, so a feature route
        // states its own fence. Tighten this before shipping anything that
        // discloses host state.
        res.end(JSON.stringify({ ok: true }))
      },
    }), '__PLUGIN_ID__: read route')
  })
}
