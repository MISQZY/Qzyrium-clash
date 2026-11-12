import { DEFAULT_APP_CONFIG, subscriptionUserAgent, type AppConfig } from './app-config'
import { validateAppConfig } from './settings-validation'

export type SettingsSection = 'settings' | 'sysproxy' | 'tun' | 'mihomo'
export interface SettingsDraftValues { form: AppConfig; bypass: string; dnsHijack: string }

const lines = (value: string): string[] => value.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
const sectionPatches: Record<SettingsSection, (draft: SettingsDraftValues, saved: AppConfig) => Partial<AppConfig>> = {
  settings: ({ form }) => ({ general: Object.fromEntries(Object.entries({ ...DEFAULT_APP_CONFIG.general, ...form.general })
    .map(([key, value]) => [key, value === undefined ? DEFAULT_APP_CONFIG.general[key as keyof AppConfig['general']] : value])) as AppConfig['general'] }),
  sysproxy: ({ form, bypass }, saved) => ({ sysProxy: { ...form.sysProxy,
    host: form.sysProxy.host?.trim() || DEFAULT_APP_CONFIG.sysProxy.host,
    enable: saved.sysProxy.enable, bypass: lines(bypass) } }),
  tun: ({ form, dnsHijack }, saved) => ({ kernel: { ...saved.kernel,
    tun: { ...form.kernel.tun, dnsHijack: lines(dnsHijack) } } }),
  mihomo: ({ form }, saved) => ({ kernel: { ...form.kernel, tun: saved.kernel.tun } })
}

/** Sections own their patch policy so a draft cannot overwrite another capture mode. */
export function createSettingsSectionPatch(section: SettingsSection, draft: SettingsDraftValues, saved: AppConfig): Partial<AppConfig> {
  return structuredClone(sectionPatches[section](draft, saved))
}

/** Merge known nested sections; arrays and optional override blocks are replaced. */
export function mergeSettings(current: AppConfig, patch: Partial<AppConfig>): AppConfig {
  const next = {
    ...current, ...patch,
    general: { ...current.general, ...patch.general },
    kernel: { ...current.kernel, ...patch.kernel, tun: { ...current.kernel.tun, ...patch.kernel?.tun } },
    sysProxy: { ...current.sysProxy, ...patch.sysProxy }
  }
  next.general.userAgent = subscriptionUserAgent(next.general.userAgent)
  if (patch.general?.minimizeToTray !== undefined && patch.general.closeAction === undefined) {
    next.general.closeAction = patch.general.minimizeToTray ? 'tray' : 'quit'
  }
  validateAppConfig(next)
  return structuredClone(next)
}

export function normalizeSettings(raw: unknown, base = DEFAULT_APP_CONFIG): AppConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Settings must be an object')
  return mergeSettings(base, raw as Partial<AppConfig>)
}

/** Reset preferences while preserving the controller's authentication identity. */
export function resetSettingsSection(current: AppConfig, section: SettingsSection): AppConfig {
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
