/**
 * Copy for this plugin's UI. `en` is the key source of truth and the harness's
 * fallback locale, so every other dictionary is typed against it and cannot
 * drift a key. `{name}` placeholders are filled by the locale runtime.
 */

/** English dictionary and key source of truth. */
export const en = {
  tab: '__PLUGIN_TAB__',
  loading: 'Loading…',
} satisfies Record<string, string>

/** This plugin's locale key union. */
export type PluginLocaleKey = keyof typeof en

/** Simplified Chinese dictionary. */
export const zh = {
  tab: '__PLUGIN_TAB__',
  loading: '加载中…',
} satisfies Record<PluginLocaleKey, string>
