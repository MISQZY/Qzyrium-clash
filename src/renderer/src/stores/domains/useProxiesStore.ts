import { useState, useCallback, useEffect } from 'react'
import type { ProxyNode } from '@shared/mihomo'
import type { StoreCoordinator } from './types'

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
  const [proxies, setProxies] = useState<Record<string, ProxyNode>>({})
  const [delays, setDelays] = useState<Record<string, number>>({})

  const updateDelays = useCallback((updates: Record<string, number>) => {
    setDelays((prev) => ({ ...prev, ...updates }))
  }, [])

  const selectProxyNode = useCallback(
    (group: string, node: string) => {
      return coord.perform(() => window.api.mihomo.selectProxy(group, node))
    },
    [coord]
  )

  useEffect(() => {
    if (!window.api || coord.coreStatus === 'starting' || busy || refreshing || loading) return
    let disposed = false
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const revision = coord.statusRevision.current
    const current = () =>
      !disposed && !coord.actionInProgress.current && revision === coord.statusRevision.current

    const load = async (attempt = 0): Promise<void> => {
      try {
        const value = await window.api.mihomo.getProxies()
        if (current()) setProxies(value)
      } catch (err) {
        if (!current()) return
        if (attempt < 2) {
          const timer = setTimeout(
            () => {
              timers.delete(timer)
              void load(attempt + 1)
            },
            1000 * 2 ** attempt
          )
          timers.add(timer)
        } else {
          coord.reportError(err)
        }
      }
    }

    void load()
    return () => {
      disposed = true
      timers.forEach(clearTimeout)
    }
  }, [
    coord.coreStatus,
    busy,
    refreshing,
    loading,
    coord.dataRevision,
    coord.reportError,
    coord.statusRevision,
    coord.actionInProgress
  ])

  return {
    proxies,
    setProxies,
    delays,
    setDelays,
    updateDelays,
    selectProxyNode
  }
}
