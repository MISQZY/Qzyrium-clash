import { LogLevel, TunnelMode } from './types'

export interface AppConfig {
  general: {
    autoStart: boolean
    autoConnect: boolean
    minimizeToTray: boolean
    theme: 'system' | 'dark' | 'light'
    language: 'en' | 'ru'
  }
  kernel: {
    mode: TunnelMode
    logLevel: LogLevel
    mixedPort: number
    controllerPort: number
    controllerSecret: string
    allowLan: boolean
    tun: {
      enable: boolean
      stack: 'system' | 'gvisor' | 'mixed'
      autoRoute: boolean
      strictRoute: boolean
      dnsHijack: string[]
    }
  }
  sysProxy: {
    enable: boolean
    bypass: string[]
  }
  activeProfileId: string | null
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  general: {
    autoStart: false,
    autoConnect: true,
    minimizeToTray: true,
    theme: 'dark',
    language: 'en'
  },
  kernel: {
    mode: 'rule',
    logLevel: 'info',
    mixedPort: 7890,
    controllerPort: 9090,
    controllerSecret: 'qzyrium_secret_token',
    allowLan: false,
    tun: {
      enable: false,
      stack: 'system',
      autoRoute: true,
      strictRoute: false,
      dnsHijack: ['any:53']
    }
  },
  sysProxy: {
    enable: false,
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
