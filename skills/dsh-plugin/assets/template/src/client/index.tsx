/**
 * Browser half of `__PLUGIN_NAME__`.
 *
 * `ctx.slots.inject` is what makes a contribution safe from outside the shipped
 * web bundle: the callback runs for each lifetime of the owner's slot
 * declaration, so this package never imports the owner and never races its
 * activation.
 */

import type { ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
// Type-only: these carry the declaration merges (`ctx.slots`, `ctx.locale`, the
// SlotMap keys). Importing any of them as a value would leave a require the
// page's module table cannot answer.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { en, zh, type PluginLocaleKey } from './locales.js'

export type { PluginLocaleKey } from './locales.js'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** This plugin's copy. */
    '__PLUGIN_NS__': PluginLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = '__PLUGIN_NS__'

/** The registry and the dictionaries. */
export const inject = ['slots', 'locale']

/** Data the registration hands the component. */
export interface PluginInjected {
  /** The harness's active locale id, read at call time (Intl defaults to the browser's). */
  activeLocale: () => string
}

type Props = PropsRuntime<'settings.plugins.tab'> & PropsLocale<'__PLUGIN_NS__'> & InjectFace<PluginInjected>

/**
 * The tab body.
 * @param props - slot-assembled props carrying the registrant's face and `t`.
 * @returns the rendered tab.
 */
function PluginTab({ t }: Props): ReactNode {
  return <p>{t('loading')}</p>
}

/**
 * Contribute the tab.
 * @param ctx - the browser plugin's own context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), '__PLUGIN_ID__: dictionaries')

  // Copy outside the component tree reads the active locale through a bound
  // translate, in a thunk so it re-resolves when the language changes.
  const t = ctx.locale.bind(NS)
  const injected = (): PluginInjected => ({
    activeLocale: () => ctx.locale.getSnapshot().active,
  })
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: '__PLUGIN_ID__',
    order: 50,
    label: () => t('tab'),
    locale: NS,
    inject: injected,
  }, PluginTab))
}
