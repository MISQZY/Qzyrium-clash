import { useWorkspaceRefresh } from './useWorkspaceRefresh'
import { useWorkspaceEvents } from './useWorkspaceEvents'
import { useState, useCallback, useRef, useMemo } from 'react'

import {
  type StoreCoordinator,
  useNavigationStore,
  useKernelStore,
  useTrafficStore,
  useProfilesStore,
  useSettingsStore,
  useProxiesStore,
  useRulesStore,
  useConnectionsStore,
  useLogsStore
} from './domains'

export function useAppStoreInternal() {
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

export type DomainStores = ReturnType<typeof useAppStoreInternal>
