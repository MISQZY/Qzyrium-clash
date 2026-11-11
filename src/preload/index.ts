import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { AddProfileDto, IElectronApi, IPC_CHANNELS } from '@shared/ipc'
import { AppConfig } from '@shared/app-config'
import { CoreState, LogEntry, TrafficStats } from '@shared/types'
import type { BootAppearance } from '@shared/appearance'

// No IPC round trip: paint the saved palette before stylesheets or React load.
let appearance: BootAppearance | undefined
try {
  const argument = process.argv.find(value => value.startsWith('--qzyrium-appearance='))
  if (argument) appearance = JSON.parse(decodeURIComponent(argument.slice('--qzyrium-appearance='.length))) as BootAppearance
} catch { /* Use the HTML fallback when no boot palette was supplied. */ }
if (appearance) {
  const palette = appearance
  const apply = () => {
    const root = document.documentElement
    if (!root) return false
    root.classList.toggle('dark', palette.theme.mode === 'dark')
    root.dataset.theme = palette.theme.id
    root.lang = palette.language
    root.style.colorScheme = palette.theme.mode
    for (const [key, value] of Object.entries(palette.theme.colors)) root.style.setProperty(key, value)
    root.style.backgroundColor = 'var(--background)'
    root.style.color = 'var(--foreground)'
    return true
  }
  if (!apply()) {
    const observer = new MutationObserver(() => { if (apply()) observer.disconnect() })
    observer.observe(document, { childList: true })
  }
}

const api: IElectronApi = {
  bootAppearance: appearance,
  kernel: {
    getRuleWarning: () => ipcRenderer.invoke(IPC_CHANNELS.KERNEL_GET_RULE_WARNING),
    getSessionStartedAt: () => ipcRenderer.invoke(IPC_CHANNELS.KERNEL_GET_SESSION_STARTED_AT),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.KERNEL_GET_STATUS),
    start: () => ipcRenderer.invoke(IPC_CHANNELS.KERNEL_START),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.KERNEL_STOP),
    restart: () => ipcRenderer.invoke(IPC_CHANNELS.KERNEL_RESTART),
    getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.KERNEL_GET_VERSION)
  },
  mihomo: {
    getConfigs: () => ipcRenderer.invoke(IPC_CHANNELS.MIHOMO_GET_CONFIGS),
    patchConfigs: (patch) => ipcRenderer.invoke(IPC_CHANNELS.MIHOMO_PATCH_CONFIGS, patch),
    getProxies: () => ipcRenderer.invoke(IPC_CHANNELS.MIHOMO_GET_PROXIES),
    selectProxy: (group, proxy) =>
      ipcRenderer.invoke(IPC_CHANNELS.MIHOMO_SELECT_PROXY, group, proxy),
    testDelay: (name, url, timeout) =>
      ipcRenderer.invoke(IPC_CHANNELS.MIHOMO_TEST_DELAY, name, url, timeout),
    getRules: (scope) => ipcRenderer.invoke(IPC_CHANNELS.MIHOMO_GET_RULES, scope),
    getConnections: () => ipcRenderer.invoke(IPC_CHANNELS.MIHOMO_GET_CONNECTIONS),
    getGlobeLocations: () => ipcRenderer.invoke(IPC_CHANNELS.MIHOMO_GET_GLOBE_LOCATIONS),
    closeConnection: (id) => ipcRenderer.invoke(IPC_CHANNELS.MIHOMO_CLOSE_CONNECTION, id),
    closeAllConnections: () => ipcRenderer.invoke(IPC_CHANNELS.MIHOMO_CLOSE_ALL_CONNECTIONS)
  },
  profiles: {
    getList: () => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_GET_LIST),
    getActive: () => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_GET_ACTIVE),
    setActive: (id) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_SET_ACTIVE, id),
    add: (dto: AddProfileDto) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_ADD, dto),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_DELETE, id),
    update: (id) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_UPDATE, id),
    getCustomRules: (profileId) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROFILE_GET_CUSTOM_RULES, profileId),
    saveCustomRules: (profileId, rules) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROFILE_SAVE_CUSTOM_RULES, profileId, rules),
    validateCustomRules: (profileId, rules) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROFILE_VALIDATE_CUSTOM_RULES, profileId, rules),
    getRawConfig: (profileId) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROFILE_GET_RAW_CONFIG, profileId),
    saveRawConfig: (profileId, content) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROFILE_SAVE_RAW_CONFIG, profileId, content),
    updateInfo: (id, patch) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROFILE_UPDATE_INFO, id, patch)
  },
  sysproxy: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.SYSPROXY_GET_STATUS),
    set: (enable: boolean) => ipcRenderer.invoke(IPC_CHANNELS.SYSPROXY_SET, enable)
  },
  settings: {
    setShortcutRecording: (recording) => ipcRenderer.invoke(IPC_CHANNELS.APP_SET_SHORTCUT_RECORDING, recording),
    get: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_SETTINGS),
    update: (patch: Partial<AppConfig>) =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_UPDATE_SETTINGS, patch)
  },
  window: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.APP_MINIMIZE),
    maximize: () => ipcRenderer.invoke(IPC_CHANNELS.APP_MAXIMIZE),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.APP_CLOSE),
    openFolder: (target) => ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_FOLDER, target),
    setTitleBarOverlay: (overlay) =>
      ipcRenderer.invoke(IPC_CHANNELS.WINDOW_SET_TITLEBAR_OVERLAY, overlay)
  },
  theme: {
    getCustomThemes: () => ipcRenderer.invoke(IPC_CHANNELS.THEME_GET_CUSTOM_THEMES),
    saveCustomTheme: (pack) => ipcRenderer.invoke(IPC_CHANNELS.THEME_SAVE_CUSTOM_THEME, pack),
    deleteCustomTheme: (id) => ipcRenderer.invoke(IPC_CHANNELS.THEME_DELETE_CUSTOM_THEME, id),
    openConfigFile: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_OPEN_JSON_FILE),
    saveConfigFile: (defaultFileName, content) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SAVE_TEXT_FILE, defaultFileName, content)
  },
  app: {
    enterCoreOnly: () => ipcRenderer.invoke(IPC_CHANNELS.APP_ENTER_CORE_ONLY),
    isElevated: () => ipcRenderer.invoke(IPC_CHANNELS.APP_IS_ELEVATED),
    restartAsAdmin: () => ipcRenderer.invoke(IPC_CHANNELS.APP_RESTART_AS_ADMIN),
    getProcessIcon: (processPath: string) => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_PROCESS_ICON, processPath),
    getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_APP_VERSION),
    checkUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.APP_CHECK_UPDATES),
    getUpdaterStatus: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_UPDATER_STATUS),
    downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.APP_DOWNLOAD_UPDATE),
    getWhatsNew: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_WHATS_NEW),
    openUrl: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_URL, url),
    copyToClipboard: (text: string) => ipcRenderer.invoke(IPC_CHANNELS.APP_COPY_TO_CLIPBOARD, text),
    getBootSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_BOOT_SNAPSHOT)
  },
  events: {
    onWarning: (callback) => {
      const listener = (_: IpcRendererEvent, message: string): void => callback(message)
      ipcRenderer.on(IPC_CHANNELS.EVENT_WARNING, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_WARNING, listener)
    },
    onUpdaterStatus: (callback) => {
      const listener = (_: IpcRendererEvent, status: Parameters<typeof callback>[0]): void => callback(status)
      ipcRenderer.on(IPC_CHANNELS.EVENT_UPDATER_STATUS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_UPDATER_STATUS, listener)
    },
    onSettingsChanged: (callback) => {
      const listener = () => callback()
      ipcRenderer.on(IPC_CHANNELS.EVENT_SETTINGS_CHANGED, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_SETTINGS_CHANGED, listener)
    },
    onTraffic: (callback: (data: TrafficStats) => void) => {
      const listener = (_: IpcRendererEvent, data: TrafficStats): void => callback(data)
      ipcRenderer.on(IPC_CHANNELS.EVENT_TRAFFIC, listener)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.EVENT_TRAFFIC, listener)
      }
    },
    onLog: (callback: (log: LogEntry) => void) => {
      const listener = (_: IpcRendererEvent, log: LogEntry | LogEntry[]): void => {
        if (Array.isArray(log)) {
          for (let i = 0; i < log.length; i++) callback(log[i])
        } else {
          callback(log)
        }
      }
      ipcRenderer.on(IPC_CHANNELS.EVENT_LOG, listener)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.EVENT_LOG, listener)
      }
    },
    onCoreStatus: (callback: (status: CoreState) => void) => {
      const listener = (_: IpcRendererEvent, status: CoreState): void => callback(status)
      ipcRenderer.on(IPC_CHANNELS.EVENT_CORE_STATUS, listener)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.EVENT_CORE_STATUS, listener)
      }
    },
    onTunError: (callback: (errorText: string) => void) => {
      const listener = (_: IpcRendererEvent, errorText: string): void => callback(errorText)
      ipcRenderer.on(IPC_CHANNELS.EVENT_TUN_ERROR, listener)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.EVENT_TUN_ERROR, listener)
      }
    },
    onImportProfile: (callback) => {
      const listener = (_: IpcRendererEvent, data: { url: string; name?: string }) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.EVENT_IMPORT_PROFILE, listener)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.EVENT_IMPORT_PROFILE, listener)
      }
    },
    onWindowVisibility: (callback: (visible: boolean) => void) => {
      const listener = (_: IpcRendererEvent, visible: boolean): void => callback(visible)
      ipcRenderer.on(IPC_CHANNELS.EVENT_WINDOW_VISIBILITY, listener)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.EVENT_WINDOW_VISIBILITY, listener)
      }
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('Failed to expose api bridge:', error)
  }
} else {
  Object.assign(window, { api })
}
