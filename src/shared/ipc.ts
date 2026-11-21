import { AppConfig } from './app-config'
import type { ServiceCheckResult, ServiceCheckTarget } from './service-check'
import { ConnectionsSnapshot, MihomoRule, ProxyNode, ProviderKind, ProviderSummary } from './mihomo'
import { ProfileItem, CustomRuleItem, ProfileInfoPatch } from './profile'
import { CoreState, LogEntry, MihomoVersion, TrafficStats } from './types'
import type { GlobeLocations } from './geo'
import type { CustomThemePack } from './theme'
import type { AppUpdaterStatus, WhatsNewPayload } from './updater'
import type { BootAppearance } from './appearance'
import type { EffectiveCoreValues, ConfigPreview } from './effective-core'
import type { KernelFailure } from './kernel-failure'
import type { CoreChannel, CoreUpdateStatus, CoreVersionInfo } from './core-version'

export const IPC_CHANNELS = {
  // Kernel
  KERNEL_GET_STATUS: 'kernel:get-status',
  KERNEL_GET_FAILURE: 'kernel:get-failure',
  KERNEL_GET_SESSION_STARTED_AT: 'kernel:get-session-started-at',
  KERNEL_START: 'kernel:start',
  KERNEL_STOP: 'kernel:stop',
  KERNEL_RESTART: 'kernel:restart',
  KERNEL_GET_VERSION: 'kernel:get-version',
  KERNEL_GET_CORE_INFO: 'kernel:get-core-info',
  KERNEL_CHECK_CORE_UPDATE: 'kernel:check-core-update',
  KERNEL_INSTALL_CORE_UPDATE: 'kernel:install-core-update',
  KERNEL_SWITCH_CHANNEL: 'kernel:switch-channel',
  KERNEL_UPDATE_GEO_DATA: 'kernel:update-geo-data',

  // Mihomo Core API
  MIHOMO_GET_CONFIGS: 'mihomo:get-configs',
  MIHOMO_GET_EFFECTIVE_CORE: 'mihomo:get-effective-core',
  MIHOMO_GET_CONFIG_PREVIEW: 'mihomo:get-config-preview',
  MIHOMO_PATCH_CONFIGS: 'mihomo:patch-configs',
  MIHOMO_GET_PROXIES: 'mihomo:get-proxies',
  MIHOMO_GET_PROVIDERS: 'mihomo:get-providers',
  MIHOMO_UPDATE_PROVIDER: 'mihomo:update-provider',
  MIHOMO_SELECT_PROXY: 'mihomo:select-proxy',
  MIHOMO_TEST_DELAY: 'mihomo:test-delay',
  MIHOMO_CHECK_SERVICES: 'mihomo:check-services',
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
  PROFILE_VALIDATE_CUSTOM_RULES: 'profile:validate-custom-rules',
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
  APP_EXPORT_BACKUP: 'app:export-backup',
  APP_IMPORT_BACKUP: 'app:import-backup',
  APP_EXPORT_DIAGNOSTICS: 'app:export-diagnostics',

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
  APP_ENTER_CORE_ONLY: 'app:enter-core-only',

  // Process Icons & Updates & URLs
  APP_GET_PROCESS_ICON: 'app:get-process-icon',
  APP_GET_APP_VERSION: 'app:get-app-version',
  APP_CHECK_UPDATES: 'app:check-updates',
  APP_GET_UPDATER_STATUS: 'app:get-updater-status',
  APP_DOWNLOAD_UPDATE: 'app:download-update',
  APP_GET_WHATS_NEW: 'app:get-whats-new',
  APP_OPEN_URL: 'app:open-url',
  APP_COPY_TO_CLIPBOARD: 'app:copy-to-clipboard',
  APP_READ_CLIPBOARD: 'app:read-clipboard',
  APP_GET_BOOT_SNAPSHOT: 'app:get-boot-snapshot',
  APP_IMPORT_RENDERER_READY: 'app:import-renderer-ready',
  APP_COMPLETE_PROFILE_IMPORT: 'app:complete-profile-import',

  // Streaming events
  EVENT_TRAFFIC: 'event:traffic',
  EVENT_UPDATER_STATUS: 'event:updater-status',
  EVENT_LOG: 'event:log',
  EVENT_CORE_STATUS: 'event:core-status',
  EVENT_CORE_UPDATE_STATUS: 'event:core-update-status',
  EVENT_CORE_FAILURE: 'event:core-failure',
  EVENT_SETTINGS_CHANGED: 'event:settings-changed',
  EVENT_TUN_ERROR: 'event:tun-error',
  EVENT_WARNING: 'event:warning',
  KERNEL_GET_RULE_WARNING: 'kernel:get-rule-warning',
  EVENT_IMPORT_PROFILE: 'event:import-profile',
  EVENT_WINDOW_VISIBILITY: 'event:window-visibility'
} as const

export interface SysProxyStatus {
  enabled: boolean
  host?: string
  mode: 'manual' | 'pac'
  port: number
}

export interface BootSnapshot {
  coreFailure?: KernelFailure | null
  settings: AppConfig
  profiles: ProfileItem[]
  activeProfile: ProfileItem | null
  coreStatus: CoreState
  sessionStartedAt: number | null
  sysProxy: SysProxyStatus
}

export interface AddProfileDto {
  sendHwid?: boolean
  name?: string
  url?: string
  type: 'remote' | 'local'
  content?: string
  updateViaProxy?: boolean
}

export interface IElectronApi {
  platform?: string
  bootAppearance?: BootAppearance
  kernel: {
    getFailure?: () => Promise<KernelFailure | null>
    getStatus: () => Promise<CoreState>
    getSessionStartedAt: () => Promise<number | null>
    getRuleWarning: () => Promise<string | null>
    start: () => Promise<void>
    stop: () => Promise<void>
    restart: () => Promise<void>
    getVersion: () => Promise<MihomoVersion>
    getCoreInfo?: () => Promise<CoreVersionInfo>
    checkCoreUpdate?: (channel?: CoreChannel) => Promise<CoreUpdateStatus>
    installCoreUpdate?: (channel: CoreChannel) => Promise<CoreVersionInfo>
    switchChannel?: (channel: CoreChannel) => Promise<CoreVersionInfo>
    updateGeoData?: () => Promise<{ success: boolean; updated: string[]; error?: string }>
  }
  mihomo: {
    getConfigs: () => Promise<Record<string, unknown>>
    getEffectiveCore: (patch?: Partial<AppConfig>) => Promise<EffectiveCoreValues>
    getConfigPreview: (patch?: Partial<AppConfig>) => Promise<ConfigPreview>
    patchConfigs: (patch: Record<string, unknown>) => Promise<void>
    getProxies: () => Promise<Record<string, ProxyNode>>
    getProviders: (kind: ProviderKind) => Promise<ProviderSummary[]>
    updateProvider: (kind: ProviderKind, name: string) => Promise<void>
    selectProxy: (group: string, proxy: string) => Promise<void>
    testDelay: (name: string, url?: string, timeout?: number) => Promise<number>
    checkServices: (name: string, targets?: ServiceCheckTarget[]) => Promise<ServiceCheckResult[]>
    getRules: (scope?: 'summary') => Promise<MihomoRule[]>
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
    validateCustomRules: (profileId: string, rules: CustomRuleItem[]) => Promise<CustomRuleItem[]>
    getRawConfig: (profileId: string) => Promise<string | null>
    saveRawConfig: (profileId: string, content: string) => Promise<void>
    updateInfo: (id: string, patch: ProfileInfoPatch) => Promise<ProfileItem>
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
    releaseUnusedMemory?: () => void
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    openFolder: (target: 'logs' | 'appLogs' | 'connectionLogs' | 'data' | 'profiles') => Promise<void>
    setTitleBarOverlay: (overlay: { color?: string; symbolColor?: string }) => Promise<void>
  }
  theme: {
    getCustomThemes: () => Promise<{ themes: CustomThemePack[]; skippedFiles: string[] }>
    saveCustomTheme: (pack: CustomThemePack) => Promise<CustomThemePack[]>
    deleteCustomTheme: (id: string) => Promise<CustomThemePack[]>
    openConfigFile: () => Promise<{ fileName: string; content: string } | null>
    saveConfigFile: (defaultFileName: string, content: string) => Promise<boolean>
  }
  app: {
    exportBackup: () => Promise<boolean>
    importBackup: () => Promise<boolean>
    exportDiagnostics: () => Promise<boolean>
    enterCoreOnly: () => Promise<void>
    isElevated: () => Promise<boolean>
    restartAsAdmin: () => Promise<boolean | void>
    getProcessIcon: (processPath: string) => Promise<string | null>
    getVersion: () => Promise<string>
    checkUpdates: () => Promise<AppUpdaterStatus>
    getUpdaterStatus: () => Promise<AppUpdaterStatus>
    downloadUpdate: () => Promise<void>
    getWhatsNew: () => Promise<WhatsNewPayload | null>
    openUrl: (url: string) => Promise<void>
    copyToClipboard: (text: string) => Promise<boolean>
    readClipboard?: () => Promise<string>
    getBootSnapshot?: () => Promise<BootSnapshot>
    completeProfileImport?: (id: string) => Promise<void>
  }
  events: {
    onCoreFailure?: (callback: (failure: KernelFailure) => void) => () => void
    onUpdaterStatus: (callback: (status: AppUpdaterStatus) => void) => () => void
    onSettingsChanged: (callback: () => void) => () => void
    onTraffic: (callback: (data: TrafficStats) => void) => () => void
    /** @deprecated Use onLogs instead for batch delivery */
    onLog: (callback: (log: LogEntry) => void) => () => void
    onLogs?: (callback: (logs: LogEntry[]) => void) => () => void
    onCoreStatus: (callback: (status: CoreState) => void) => () => void
    onCoreUpdateStatus?: (callback: (status: CoreUpdateStatus) => void) => () => void
    onTunError: (callback: (errorText: string) => void) => () => void
    onWarning: (callback: (message: string) => void) => () => void
    onImportProfile: (callback: (data: { id?: string; url: string; name?: string }) => void) => () => void
    onWindowVisibility: (callback: (visible: boolean) => void) => () => void
  }
}
