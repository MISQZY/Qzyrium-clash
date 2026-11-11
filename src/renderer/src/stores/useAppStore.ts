import { useWorkspaceRefresh } from './useWorkspaceRefresh'
import { useWorkspaceEvents } from './useWorkspaceEvents'
import { createContext, useContext, useState, useCallback, useRef, useMemo, createElement, type ReactNode } from 'react'

import type { NavTab } from '../lib/navigation'

import { StoreCoordinator, NavigationStore, useNavigationStore, KernelStore, useKernelStore, TrafficStore, useTrafficStore, ProfilesStore, useProfilesStore, SettingsStore, useSettingsStore, ProxiesStore, useProxiesStore, RulesStore, useRulesStore, ConnectionsStore, useConnectionsStore, LogsStore, useLogsStore } from './domains'

export type { NavTab } from '../lib/navigation'
export * from './domains'

// Domain Contexts for Granular Subscriptions
const RefreshContext = createContext<(() => Promise<boolean>) | null>(null)

export function useRefreshAll() {
  const refresh = useContext(RefreshContext)
  if (!refresh) throw new Error('useRefreshAll must be used within an AppStoreProvider')
  return refresh
}
export const NavigationContext = createContext<NavigationStore | null>(null)
export const KernelContext = createContext<KernelStore | null>(null)
export const TrafficContext = createContext<TrafficStore | null>(null)
export const ProfilesContext = createContext<ProfilesStore | null>(null)
export const SettingsContext = createContext<SettingsStore | null>(null)
export const ProxiesContext = createContext<ProxiesStore | null>(null)
export const RulesContext = createContext<RulesStore | null>(null)
export const ConnectionsContext = createContext<ConnectionsStore | null>(null)
export const LogsContext = createContext<LogsStore | null>(null)

export const useNavigation = () => {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useNavigation must be used within an AppStoreProvider')
  return ctx
}
export const useKernel = () => {
  const ctx = useContext(KernelContext)
  if (!ctx) throw new Error('useKernel must be used within an AppStoreProvider')
  return ctx
}
export const useTraffic = () => {
  const ctx = useContext(TrafficContext)
  if (!ctx) throw new Error('useTraffic must be used within an AppStoreProvider')
  return ctx
}
export const useProfiles = () => {
  const ctx = useContext(ProfilesContext)
  if (!ctx) throw new Error('useProfiles must be used within an AppStoreProvider')
  return ctx
}
export const useSettings = () => {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within an AppStoreProvider')
  return ctx
}
export const useProxies = () => {
  const ctx = useContext(ProxiesContext)
  if (!ctx) throw new Error('useProxies must be used within an AppStoreProvider')
  return ctx
}
export const useRules = () => {
  const ctx = useContext(RulesContext)
  if (!ctx) throw new Error('useRules must be used within an AppStoreProvider')
  return ctx
}
export const useConnections = () => {
  const ctx = useContext(ConnectionsContext)
  if (!ctx) throw new Error('useConnections must be used within an AppStoreProvider')
  return ctx
}
export const useLogs = () => {
  const ctx = useContext(LogsContext)
  if (!ctx) throw new Error('useLogs must be used within an AppStoreProvider')
  return ctx
}

export function useAppStoreInternal(): {
  navigation: NavigationStore
  kernel: KernelStore
  traffic: TrafficStore
  profiles: ProfilesStore
  settings: SettingsStore
  proxies: ProxiesStore
  rules: RulesStore
  connections: ConnectionsStore
  logs: LogsStore
  refreshAll: () => Promise<boolean>
} {
  const nav = useNavigationStore()
  const { activeTab, visible, loading, busy, reportError, dataRevision, actionInProgress, statusRevision, mounted, createPerform } = nav

  const [refreshing, setRefreshing] = useState(false)

  const refreshAllRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const perform = useMemo(() => {
    return createPerform(() => refreshAllRef.current())
  }, [createPerform])

  const actions = useMemo(() => ({ perform }), [perform])
  const kernel = useKernelStore(actions)
  const settingsStore = useSettingsStore(actions)

  const coord: StoreCoordinator = useMemo(
    () => ({
      activeTab,
      visible,
      coreStatus: kernel.coreStatus,
      settings: settingsStore.settings,
      dataRevision,
      statusRevision,
      mounted,
      actionInProgress,
      reportError,
      perform,
      refreshAll: () => refreshAllRef.current()
    }),
    [
      activeTab,
      visible,
      kernel.coreStatus,
      settingsStore.settings,
      dataRevision,
      statusRevision,
      mounted,
      actionInProgress,
      reportError,
      perform
    ]
  )

  const traffic = useTrafficStore(coord)
  const profiles = useProfilesStore(coord)
  const proxies = useProxiesStore(coord, busy, refreshing, loading)
  const rules = useRulesStore(coord, busy, refreshing, loading)
  const connections = useConnectionsStore(coord, busy, refreshing, loading)
  const logs = useLogsStore(coord)

  const refreshAll = useWorkspaceRefresh(nav, settingsStore, profiles, kernel, setRefreshing)

  refreshAllRef.current = refreshAll

  useWorkspaceEvents(nav, kernel, settingsStore.settings.general, refreshAll)

  const refreshWorkspace = useCallback(() => perform(async () => {}), [perform])

  return {
    navigation: nav,
    kernel,
    traffic,
    profiles,
    settings: settingsStore,
    proxies,
    rules,
    connections,
    logs,
    refreshAll: refreshWorkspace
  }
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const domainStores = useAppStoreInternal()
  return createElement(
    RefreshContext.Provider,
    { value: domainStores.refreshAll },
    createElement(
      NavigationContext.Provider,
      { value: domainStores.navigation },
      createElement(
        KernelContext.Provider,
        { value: domainStores.kernel },
        createElement(
          TrafficContext.Provider,
          { value: domainStores.traffic },
          createElement(
            ProfilesContext.Provider,
            { value: domainStores.profiles },
            createElement(
              SettingsContext.Provider,
              { value: domainStores.settings },
              createElement(
                ProxiesContext.Provider,
                { value: domainStores.proxies },
                createElement(
                  RulesContext.Provider,
                  { value: domainStores.rules },
                  createElement(
                    ConnectionsContext.Provider,
                    { value: domainStores.connections },
                    createElement(LogsContext.Provider, { value: domainStores.logs }, children)
                  )
                )
              )
            )
          )
        )
      )
    )
  )
}
