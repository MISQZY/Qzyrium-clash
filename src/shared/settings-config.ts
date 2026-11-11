import { DEFAULT_APP_CONFIG, subscriptionUserAgent, type AppConfig } from './app-config'
import { validateAppConfig } from './settings-validation'

/** Merge known nested sections; arrays and optional override blocks are replaced. */
export function mergeSettings(current: AppConfig, patch: Partial<AppConfig>): AppConfig {
  const next = {
    ...current, ...patch,
    general: { ...current.general, ...patch.general },
    kernel: { ...current.kernel, ...patch.kernel, tun: { ...current.kernel.tun, ...patch.kernel?.tun } },
    sysProxy: { ...current.sysProxy, ...patch.sysProxy }
  }
  next.general.userAgent = subscriptionUserAgent(next.general.userAgent)
  validateAppConfig(next)
  return structuredClone(next)
}

export function normalizeSettings(raw: unknown, base = DEFAULT_APP_CONFIG): AppConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Settings must be an object')
  return mergeSettings(base, raw as Partial<AppConfig>)
}

/** Reset preferences while preserving the controller's authentication identity. */
export function resetSettingsSection(current: AppConfig, section: 'settings' | 'sysproxy' | 'tun' | 'mihomo'): AppConfig {
  const defaults = structuredClone(DEFAULT_APP_CONFIG)
  const result = structuredClone(current)
  if (section === 'settings') result.general = { ...defaults.general, language: current.general.language,
    theme: current.general.theme, customLocalizations: current.general.customLocalizations,
    customLocalization: current.general.customLocalization }
  else if (section === 'sysproxy') result.sysProxy = defaults.sysProxy
  else if (section === 'tun') result.kernel.tun = defaults.kernel.tun
  else result.kernel = { ...defaults.kernel, controllerSecret: current.kernel.controllerSecret, tun: current.kernel.tun }
  return result
}
