import { AppConfig } from './app-config'
import { ConnectionsSnapshot, MihomoRule, ProxyNode } from './mihomo'
import { ProfileItem } from './profile'
import { CoreState, LogEntry, MihomoVersion, TrafficStats } from './types'

export const IPC_CHANNELS = {
  // Kernel
  KERNEL_GET_STATUS: 'kernel:get-status',
  KERNEL_START: 'kernel:start',
  KERNEL_STOP: 'kernel:stop',
  KERNEL_RESTART: 'kernel:restart',
  KERNEL_GET_VERSION: 'kernel:get-version',

  // Mihomo Core API
  MIHOMO_GET_CONFIGS: 'mihomo:get-configs',
  MIHOMO_PATCH_CONFIGS: 'mihomo:patch-configs',
  MIHOMO_GET_PROXIES: 'mihomo:get-proxies',
  MIHOMO_SELECT_PROXY: 'mihomo:select-proxy',
  MIHOMO_TEST_DELAY: 'mihomo:test-delay',
  MIHOMO_GET_RULES: 'mihomo:get-rules',
  MIHOMO_GET_CONNECTIONS: 'mihomo:get-connections',
  MIHOMO_CLOSE_CONNECTION: 'mihomo:close-connection',
  MIHOMO_CLOSE_ALL_CONNECTIONS: 'mihomo:close-all-connections',

  // Profiles
  PROFILE_GET_LIST: 'profile:get-list',
  PROFILE_GET_ACTIVE: 'profile:get-active',
  PROFILE_SET_ACTIVE: 'profile:set-active',
  PROFILE_ADD: 'profile:add',
  PROFILE_DELETE: 'profile:delete',
  PROFILE_UPDATE: 'profile:update',

  // System Proxy
  SYSPROXY_GET_STATUS: 'sysproxy:get-status',
  SYSPROXY_SET: 'sysproxy:set',

  // Settings & App
  APP_GET_SETTINGS: 'app:get-settings',
  APP_UPDATE_SETTINGS: 'app:update-settings',
  APP_MINIMIZE: 'app:minimize',
  APP_MAXIMIZE: 'app:maximize',
  APP_CLOSE: 'app:close',
  APP_OPEN_FOLDER: 'app:open-folder',

  // Streaming events
  EVENT_TRAFFIC: 'event:traffic',
  EVENT_LOG: 'event:log',
  EVENT_CORE_STATUS: 'event:core-status'
} as const

export interface SysProxyStatus {
  enabled: boolean
  mode: 'manual' | 'pac'
  port: number
}

export interface AddProfileDto {
  name: string
  url?: string
  type: 'remote' | 'local'
  content?: string
}

export interface IElectronApi {
  kernel: {
    getStatus: () => Promise<CoreState>
    start: () => Promise<void>
    stop: () => Promise<void>
    restart: () => Promise<void>
    getVersion: () => Promise<MihomoVersion>
  }
  mihomo: {
    getConfigs: () => Promise<Record<string, unknown>>
    patchConfigs: (patch: Record<string, unknown>) => Promise<void>
    getProxies: () => Promise<Record<string, ProxyNode>>
    selectProxy: (group: string, proxy: string) => Promise<void>
    testDelay: (name: string, url?: string, timeout?: number) => Promise<number>
    getRules: () => Promise<MihomoRule[]>
    getConnections: () => Promise<ConnectionsSnapshot>
    closeConnection: (id: string) => Promise<void>
    closeAllConnections: () => Promise<void>
  }
  profiles: {
    getList: () => Promise<ProfileItem[]>
    getActive: () => Promise<ProfileItem | null>
    setActive: (id: string) => Promise<void>
    add: (payload: AddProfileDto) => Promise<ProfileItem>
    delete: (id: string) => Promise<void>
    update: (id: string) => Promise<void>
  }
  sysproxy: {
    getStatus: () => Promise<SysProxyStatus>
    set: (enable: boolean) => Promise<void>
  }
  settings: {
    get: () => Promise<AppConfig>
    update: (patch: Partial<AppConfig>) => Promise<AppConfig>
  }
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    openFolder: (target: 'logs' | 'data' | 'profiles') => Promise<void>
  }
  events: {
    onTraffic: (callback: (data: TrafficStats) => void) => () => void
    onLog: (callback: (log: LogEntry) => void) => () => void
    onCoreStatus: (callback: (status: CoreState) => void) => () => void
  }
}
