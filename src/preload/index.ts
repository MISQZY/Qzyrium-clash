import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { AddProfileDto, IElectronApi, IPC_CHANNELS } from '@shared/ipc'
import { AppConfig } from '@shared/app-config'
import { CoreState, LogEntry, TrafficStats } from '@shared/types'

const api: IElectronApi = {
  kernel: {
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
    getRules: () => ipcRenderer.invoke(IPC_CHANNELS.MIHOMO_GET_RULES),
    getConnections: () => ipcRenderer.invoke(IPC_CHANNELS.MIHOMO_GET_CONNECTIONS),
    closeConnection: (id) => ipcRenderer.invoke(IPC_CHANNELS.MIHOMO_CLOSE_CONNECTION, id),
    closeAllConnections: () => ipcRenderer.invoke(IPC_CHANNELS.MIHOMO_CLOSE_ALL_CONNECTIONS)
  },
  profiles: {
    getList: () => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_GET_LIST),
    getActive: () => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_GET_ACTIVE),
    setActive: (id) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_SET_ACTIVE, id),
    add: (dto: AddProfileDto) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_ADD, dto),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_DELETE, id),
    update: (id) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_UPDATE, id)
  },
  sysproxy: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.SYSPROXY_GET_STATUS),
    set: (enable: boolean) => ipcRenderer.invoke(IPC_CHANNELS.SYSPROXY_SET, enable)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_SETTINGS),
    update: (patch: Partial<AppConfig>) =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_UPDATE_SETTINGS, patch)
  },
  window: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.APP_MINIMIZE),
    maximize: () => ipcRenderer.invoke(IPC_CHANNELS.APP_MAXIMIZE),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.APP_CLOSE),
    openFolder: (target) => ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_FOLDER, target)
  },
  events: {
    onTraffic: (callback: (data: TrafficStats) => void) => {
      const listener = (_: IpcRendererEvent, data: TrafficStats): void => callback(data)
      ipcRenderer.on(IPC_CHANNELS.EVENT_TRAFFIC, listener)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.EVENT_TRAFFIC, listener)
      }
    },
    onLog: (callback: (log: LogEntry) => void) => {
      const listener = (_: IpcRendererEvent, log: LogEntry): void => callback(log)
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
  // @ts-ignore (fallback)
  window.api = api
}
