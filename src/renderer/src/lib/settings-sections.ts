import { CoreIcon, SettingsIcon, SystemProxyIcon, TunIcon } from './icons'

export const SETTINGS_SECTIONS = {
  tun: { title: 'tUNInterface', icon: TunIcon },
  sysproxy: { title: 'systemProxy', icon: SystemProxyIcon },
  mihomo: { title: 'mihomoCore', icon: CoreIcon },
  settings: { title: 'settings', icon: SettingsIcon }
} as const
