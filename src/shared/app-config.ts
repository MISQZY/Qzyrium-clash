import { LogLevel, TunnelMode } from './types'
import type { ConfigValues } from './settings-fields'
import type { ThemePreference } from './theme'

export interface AppConfig {
  general: {
    autoStart: boolean
    autoConnect: boolean
    minimizeToTray: boolean
    theme: ThemePreference
    language: 'en' | 'ru'
    liteDashboard?: boolean
    silentStart?: boolean
    disableGpu?: boolean
    lowMemoryMode?: boolean
    autoCloseConnection?: boolean
    connectionInterval?: number
    maxLogs?: number
    delayTestUrl?: string
    delayTestTimeout?: number
    delayTestConcurrency?: number
    userAgent?: string
    autoUpdateProfiles?: boolean
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
    autoConnect: false,
    minimizeToTray: true,
    theme: 'dark',
    language: 'ru',
    liteDashboard: false,
    silentStart: false,
    disableGpu: false,
    lowMemoryMode: true,
    autoCloseConnection: false,
    connectionInterval: 2000,
    maxLogs: 300,
    delayTestUrl: 'http://www.gstatic.com/generate_204',
    delayTestTimeout: 5000,
    delayTestConcurrency: 6,
    userAgent: DEFAULT_SUBSCRIPTION_USER_AGENT,
    autoUpdateProfiles: false,
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
