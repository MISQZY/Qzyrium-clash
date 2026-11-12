import { useMemo, useState, useCallback, useEffect } from 'react'
import type { ProxyNode } from '@shared/mihomo'
import type { StoreCoordinator } from './types'
import { loadDataset } from './loadDataset'

export interface ProxiesStore {
  proxies: Record<string, ProxyNode>
  setProxies: React.Dispatch<React.SetStateAction<Record<string, ProxyNode>>>
  delays: Record<string, number>
  setDelays: React.Dispatch<React.SetStateAction<Record<string, number>>>
  updateDelays: (updates: Record<string, number>) => void
  selectProxyNode: (group: string, node: string) => Promise<boolean>
}

export function useProxiesStore(
  coord: StoreCoordinator,
  busy: boolean,
  refreshing: boolean,
  loading: boolean
): ProxiesStore {
  const { perform, coreStatus, statusRevision, actionInProgress, reportError, dataRevision } = coord
  const [proxies, setProxies] = useState<Record<string, ProxyNode>>({})
  const [delays, setDelays] = useState<Record<string, number>>({})

  const updateDelays = useCallback((updates: Record<string, number>) => {
    setDelays((prev) => ({ ...prev, ...updates }))
  }, [])

  const selectProxyNode = useCallback(
    (group: string, node: string) => {
      return perform(() => window.api.mihomo.selectProxy(group, node))
    },
    [perform]
  )

  useEffect(() => {
    if (!window.api || coreStatus === 'starting' || busy || refreshing || loading) return
    return loadDataset(
      { statusRevision, actionInProgress, reportError },
      () => window.api.mihomo.getProxies(),
      setProxies
    )
  }, [
    coreStatus,
    busy,
    refreshing,
    loading,
    dataRevision,
    reportError,
    statusRevision,
    actionInProgress
  ])

  return useMemo(() => ({
    proxies,
    setProxies,
    delays,
    setDelays,
    updateDelays,
    selectProxyNode
  }), [proxies, setProxies, delays, setDelays, updateDelays, selectProxyNode])
}
