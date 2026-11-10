import { AppConfig } from './app-config'
import { ConnectionsSnapshot, MihomoRule, ProxyNode } from './mihomo'
import { ProfileItem, CustomRuleItem } from './profile'
import { CoreState, LogEntry, MihomoVersion, TrafficStats } from './types'
import type { GlobeLocations } from './geo'
import type { CustomThemePack } from './theme'
import type { AppUpdaterStatus, WhatsNewPayload } from './updater'
import type { BootAppearance } from './appearance'

export const IPC_CHANNELS = {
  // Kernel
  KERNEL_GET_STATUS: 'kernel:get-status',
  KERNEL_GET_SESSION_STARTED_AT: 'kernel:get-session-started-at',
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
  MIHOMO_GET_GLOBE_LOCATIONS: 'mihomo:get-globe-locations',
  MIHOMO_CLOSE_CONNECTION: 'mihomo:close-connection',
  MIHOMO_CLOSE_ALL_CONNECTIONS: 'mihomo:close-all-connections',

  // Profiles
  PROFILE_GET_LIST: 'profile:get-list',
  PROFILE_GET_ACTIVE: 'profile:get-active',
  PROFILE_SET_ACTIVE: 'profile:set-active',
  PROFILE_ADD: 'profile:add',
  PROFILE_DELETE: 'profile:delete',
  PROFILE_UPDATE: 'profile:update',
  PROFILE_GET_CUSTOM_RULES: 'profile:get-custom-rules',
  PROFILE_SAVE_CUSTOM_RULES: 'profile:save-custom-rules',
  PROFILE_GET_RAW_CONFIG: 'profile:get-raw-config',
  PROFILE_SAVE_RAW_CONFIG: 'profile:save-raw-config',
  PROFILE_UPDATE_INFO: 'profile:update-info',

  // System Proxy
  SYSPROXY_GET_STATUS: 'sysproxy:get-status',
  SYSPROXY_SET: 'sysproxy:set',

  // Settings & App
  APP_GET_SETTINGS: 'app:get-settings',
  APP_UPDATE_SETTINGS: 'app:update-settings',
  APP_SET_SHORTCUT_RECORDING: 'app:set-shortcut-recording',
  APP_MINIMIZE: 'app:minimize',
  APP_MAXIMIZE: 'app:maximize',
  APP_CLOSE: 'app:close',
  APP_OPEN_FOLDER: 'app:open-folder',

  // Custom Themes & Config Files
  THEME_GET_CUSTOM_THEMES: 'theme:get-custom-themes',
  THEME_SAVE_CUSTOM_THEME: 'theme:save-custom-theme',
  THEME_DELETE_CUSTOM_THEME: 'theme:delete-custom-theme',
  CONFIG_OPEN_JSON_FILE: 'config:open-json-file',
  CONFIG_SAVE_TEXT_FILE: 'config:save-text-file',
  WINDOW_SET_TITLEBAR_OVERLAY: 'window:set-titlebar-overlay',

  // Elevation
  APP_IS_ELEVATED: 'app:is-elevated',
  APP_RESTART_AS_ADMIN: 'app:restart-as-admin',

  // Process Icons & Updates & URLs
  APP_GET_PROCESS_ICON: 'app:get-process-icon',
  APP_GET_APP_VERSION: 'app:get-app-version',
  APP_CHECK_UPDATES: 'app:check-updates',
  APP_GET_UPDATER_STATUS: 'app:get-updater-status',
  APP_DOWNLOAD_UPDATE: 'app:download-update',
  APP_GET_WHATS_NEW: 'app:get-whats-new',
  APP_OPEN_URL: 'app:open-url',

  // Streaming events
  EVENT_TRAFFIC: 'event:traffic',
  EVENT_UPDATER_STATUS: 'event:updater-status',
  EVENT_LOG: 'event:log',
  EVENT_CORE_STATUS: 'event:core-status',
  EVENT_SETTINGS_CHANGED: 'event:settings-changed',
  EVENT_TUN_ERROR: 'event:tun-error',
  EVENT_IMPORT_PROFILE: 'event:import-profile',
  EVENT_WINDOW_VISIBILITY: 'event:window-visibility'
} as const

export interface SysProxyStatus {
  enabled: boolean
  host?: string
  mode: 'manual' | 'pac'
  port: number
}

export interface AddProfileDto {
  name?: string
  url?: string
  type: 'remote' | 'local'
  content?: string
}

export interface IElectronApi {
  bootAppearance?: BootAppearance
  kernel: {
    getStatus: () => Promise<CoreState>
    getSessionStartedAt: () => Promise<number | null>
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
    getGlobeLocations: () => Promise<GlobeLocations>
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
    getCustomRules: (profileId: string) => Promise<CustomRuleItem[]>
    saveCustomRules: (profileId: string, rules: CustomRuleItem[]) => Promise<void>
    getRawConfig: (profileId: string) => Promise<string | null>
    saveRawConfig: (profileId: string, content: string) => Promise<void>
    updateInfo: (id: string, patch: Partial<ProfileItem>) => Promise<ProfileItem>
  }
  sysproxy: {
    getStatus: () => Promise<SysProxyStatus>
    set: (enable: boolean) => Promise<void>
  }
  settings: {
    setShortcutRecording: (recording: boolean) => Promise<void>
    get: () => Promise<AppConfig>
    update: (patch: Partial<AppConfig>) => Promise<AppConfig>
  }
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    openFolder: (target: 'logs' | 'data' | 'profiles') => Promise<void>
    setTitleBarOverlay: (overlay: { color?: string; symbolColor?: string }) => Promise<void>
  }
  theme: {
    getCustomThemes: () => Promise<CustomThemePack[]>
    saveCustomTheme: (pack: CustomThemePack) => Promise<CustomThemePack[]>
    deleteCustomTheme: (id: string) => Promise<CustomThemePack[]>
    openConfigFile: () => Promise<{ fileName: string; content: string } | null>
    saveConfigFile: (defaultFileName: string, content: string) => Promise<boolean>
  }
  app: {
    isElevated: () => Promise<boolean>
    restartAsAdmin: () => Promise<boolean | void>
    getProcessIcon: (processPath: string) => Promise<string | null>
    getVersion: () => Promise<string>
    checkUpdates: () => Promise<AppUpdaterStatus>
    getUpdaterStatus: () => Promise<AppUpdaterStatus>
    downloadUpdate: () => Promise<void>
    getWhatsNew: () => Promise<WhatsNewPayload | null>
    openUrl: (url: string) => Promise<void>
  }
  events: {
    onUpdaterStatus: (callback: (status: AppUpdaterStatus) => void) => () => void
    onSettingsChanged: (callback: () => void) => () => void
    onTraffic: (callback: (data: TrafficStats) => void) => () => void
    onLog: (callback: (log: LogEntry) => void) => () => void
    onCoreStatus: (callback: (status: CoreState) => void) => () => void
    onTunError: (callback: (errorText: string) => void) => () => void
    onImportProfile: (callback: (data: { url: string; name?: string }) => void) => () => void
    onWindowVisibility: (callback: (visible: boolean) => void) => () => void
  }
}
