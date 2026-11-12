import { LogLevel, TunnelMode } from './types'
import type { ConfigValues } from './settings-fields'
import type { ThemePreference } from './theme'
import type { CustomLocalizationPack } from './custom-localization'

export interface AppConfig {
  general: {
    autoStart: boolean
    autoStartAsAdmin?: boolean
    autoCheckUpdates?: boolean
    autoConnect: boolean
    minimizeToTray: boolean
    closeAction?: 'tray' | 'quit' | 'core-only'
    theme: ThemePreference
    language: 'en' | 'ru'
    customLocalizations?: CustomLocalizationPack[]
    customLocalization?: string | null
    liteDashboard?: boolean
    onlyVpnTraffic?: boolean
    silentStart?: boolean
    disableGpu?: boolean
    lowMemoryMode?: boolean
    autoCloseConnection?: boolean
    connectionInterval?: number
    maxLogs?: number
    appLogEnabled?: boolean
    appLogMaxSizeMb?: number
    appLogArchives?: number
    appLogRetentionDays?: number
    connectionLogEnabled?: boolean
    connectionLogMaxSizeMb?: number
    connectionLogArchives?: number
    connectionLogRetentionDays?: number
    delayTestUrl?: string
    delayTestTimeout?: number
    delayTestConcurrency?: number
    userAgent?: string
    autoUpdateProfiles?: boolean
    updateProfilesOnStart?: boolean
    profileStartupMaxAgeHours?: number
    profileUpdateInterval?: number
    shortcuts?: Record<string, string>
  }
  kernel: {
    mode: TunnelMode
    logLevel: LogLevel
    mixedPort: number
    controllerPort: number
    controllerSecret: string
    allowLan: boolean
    options?: ConfigValues
    dns?: ConfigValues | null
    sniffer?: ConfigValues | null
    resources?: ConfigValues | null
    tun: {
      enable: boolean
      stack: 'system' | 'gvisor' | 'mixed'
      autoRoute: boolean
      strictRoute: boolean
      dnsHijack: string[]
      options?: ConfigValues
    }
  }
  sysProxy: {
    enable: boolean
    bypass: string[]
    mode?: 'manual' | 'pac'
    host?: string
    pacScript?: string
  }
  activeProfileId: string | null
}

export const DEFAULT_SUBSCRIPTION_USER_AGENT = 'clash.meta/qzyrium'

export function subscriptionUserAgent(value?: string): string {
  const trimmed = value?.trim()
  if (!trimmed || /^(?:clash\.meta\s*(?:\/\s*qzyrium(?:vpn|\s*-\s*clash)?)?|qzyrium(?:vpn|\s*-\s*clash)?)$/i.test(trimmed)) {
    return DEFAULT_SUBSCRIPTION_USER_AGENT
  }
  return trimmed
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  general: {
    autoStart: false,
    autoStartAsAdmin: false,
    autoCheckUpdates: true,
    autoConnect: false,
    minimizeToTray: true,
    closeAction: 'tray',
    theme: 'dark',
    language: 'ru',
    liteDashboard: false,
    onlyVpnTraffic: true,
    silentStart: false,
    disableGpu: false,
    lowMemoryMode: true,
    autoCloseConnection: false,
    connectionInterval: 2000,
    maxLogs: 300,
    appLogEnabled: true,
    appLogMaxSizeMb: 10,
    appLogArchives: 20,
    appLogRetentionDays: 30,
    connectionLogEnabled: true,
    connectionLogMaxSizeMb: 10,
    connectionLogArchives: 20,
    connectionLogRetentionDays: 30,
    delayTestUrl: 'http://www.gstatic.com/generate_204',
    delayTestTimeout: 5000,
    delayTestConcurrency: 6,
    userAgent: DEFAULT_SUBSCRIPTION_USER_AGENT,
    autoUpdateProfiles: false,
    updateProfilesOnStart: false,
    profileStartupMaxAgeHours: 24,
    profileUpdateInterval: 60,
    shortcuts: {}
  },
  kernel: {
    mode: 'rule',
    logLevel: 'info',
    mixedPort: 7895,
    controllerPort: 9095,
    controllerSecret: 'qzyrium_secret_token',
    allowLan: false,
    tun: {
      enable: false,
      stack: 'gvisor',
      autoRoute: true,
      strictRoute: true,
      dnsHijack: ['any:53']
    }
  },
  sysProxy: {
    enable: false,
    mode: 'manual',
    host: '127.0.0.1',
    pacScript: '',
    bypass: [
      'localhost',
      '127.*',
      '10.*',
      '172.16.*',
      '172.17.*',
      '172.18.*',
      '172.19.*',
      '172.20.*',
      '172.21.*',
      '172.22.*',
      '172.23.*',
      '172.24.*',
      '172.25.*',
      '172.26.*',
      '172.27.*',
      '172.28.*',
      '172.29.*',
      '172.30.*',
      '172.31.*',
      '192.168.*',
      '<local>'
    ]
  },
  activeProfileId: null
}
