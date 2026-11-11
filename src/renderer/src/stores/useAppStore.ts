import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, createElement, type ReactNode } from 'react'
import { selectedLocalization } from '@shared/custom-localization'

import type { NavTab } from '../lib/navigation'
import { translate } from '../i18n/catalogs'

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
  const {
    activeTab,
    visible,
    loading,
    setLoading,
    busy,
    error,
    dismissError,
    reportError,
    dataRevision,
    setDataRevision,
    actionInProgress,
    refreshSequence,
    pendingRefresh,
    statusRevision,
    mounted,
    createPerform,
    setActiveTab,
    setVisible
  } = nav

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

  const preferences = useRef(settingsStore.settings.general)
  preferences.current = settingsStore.settings.general

  const { setSettings, setSysProxy } = settingsStore
  const { setProfiles, setActiveProfile } = profiles
  const { setCoreStatus, setSessionStartedAt } = kernel

  const refreshAll = useCallback((): Promise<void> => {
    if (!window.api) {
      setLoading(false)
      return Promise.resolve()
    }
    if (pendingRefresh.current) return pendingRefresh.current
    setRefreshing(true)
    const sequence = ++refreshSequence.current
    const revision = statusRevision.current
    const current = () => mounted.current && sequence === refreshSequence.current
    const apply = async <T,>(request: Promise<T>, update: (value: T) => void) => {
      const value = await request
      if (current()) update(value)
    }

    const request = (async () => {
      if (window.api?.app?.getBootSnapshot) {
        try {
          const boot = await window.api.app.getBootSnapshot()
          if (!current()) return
          setSettings(boot.settings)
          setProfiles(boot.profiles)
          setActiveProfile(boot.activeProfile)
          if (revision === statusRevision.current) {
            setCoreStatus(boot.coreStatus)
            setSessionStartedAt(boot.sessionStartedAt)
          }
          setSysProxy(boot.sysProxy)
          setLoading(false)
          setDataRevision((value) => value + 1)
          return
        } catch {
          // Fall back to individual requests if batched snapshot fails
        }
      }

      const proxyResult = Promise.allSettled([
        apply(window.api.sysproxy.getStatus(), setSysProxy)
      ])
      const results = await Promise.allSettled([
        apply(window.api.kernel.getStatus(), (status) => {
          if (revision !== statusRevision.current) return
          setCoreStatus(status)
        }),
        apply(
          window.api.kernel.getSessionStartedAt?.() ?? Promise.resolve(null),
          (startedAt) => {
            if (revision === statusRevision.current) setSessionStartedAt(startedAt)
          }
        ),
        apply(window.api.profiles.getList(), setProfiles),
        apply(window.api.profiles.getActive(), setActiveProfile),
        apply(window.api.settings.get(), setSettings)
      ])
      if (!current()) return
      setLoading(false)
      results.push(...(await proxyResult))
      if (!current()) return
      setDataRevision((value) => value + 1)
      const failure = results.find((result) => result.status === 'rejected')
      if (failure?.status === 'rejected') throw failure.reason
    })()

    pendingRefresh.current = request
    const clear = () => {
      if (pendingRefresh.current === request) {
        pendingRefresh.current = null
        if (mounted.current) setRefreshing(false)
      }
    }
    void request.then(clear, clear)
    return request
  }, [mounted, pendingRefresh, refreshSequence, statusRevision, setLoading, setDataRevision,
    setProfiles, setActiveProfile, setCoreStatus, setSessionStartedAt, setSettings, setSysProxy])

  refreshAllRef.current = refreshAll

  useEffect(() => {
    mounted.current = true
    const visibility = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', visibility)
    void refreshAll().catch((err) => {
      if (mounted.current) reportError(err)
    })
    if (!window.api) {
      return () => {
        mounted.current = false
        document.removeEventListener('visibilitychange', visibility)
      }
    }

    const unsubStatus = window.api.events.onCoreStatus((status) => {
      statusRevision.current++
      setCoreStatus(status)
      if (status === 'error') {
        reportError(
          translate(
            preferences.current.language,
            'app',
            'coreUnexpectedError',
            {},
            selectedLocalization(preferences.current)
          )
        )
      }
      if (status !== 'running') setSessionStartedAt(null)
      else {
        const revision = statusRevision.current
        void (window.api.kernel.getSessionStartedAt?.() ?? Promise.resolve(Date.now()))
          .then((startedAt) => {
            if (mounted.current && revision === statusRevision.current) {
              setSessionStartedAt(startedAt)
            }
          })
          .catch(reportError)
      }
      if (status === 'running' && !actionInProgress.current) {
        void refreshAll().catch(reportError)
      }
    })

    const unsubSettings = window.api.events.onSettingsChanged?.(() => {
      void refreshAll().catch(reportError)
    })

    const unsubTunError = window.api.events.onTunError?.(() => {
      reportError(
        translate(
          preferences.current.language,
          'app',
          'tunStartRequiresAdmin',
          {},
          selectedLocalization(preferences.current)
        )
      )
    })

    const unsubVisibility = window.api.events.onWindowVisibility?.((isWinVisible) => {
      setVisible(isWinVisible)
      if (isWinVisible) {
        void refreshAll().catch(reportError)
      }
    })

    return () => {
      mounted.current = false
      document.removeEventListener('visibilitychange', visibility)
      unsubStatus()
      unsubSettings?.()
      unsubTunError?.()
      unsubVisibility?.()
    }
  }, [refreshAll, reportError, actionInProgress, mounted, statusRevision, setCoreStatus, setSessionStartedAt, setVisible])

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
