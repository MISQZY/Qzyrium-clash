import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import type { ConnectionsSnapshot } from '@shared/mihomo'
import { EMPTY_CONNECTIONS, type StoreCoordinator } from './types'

export interface ConnectionsStore {
  connections: ConnectionsSnapshot
  subscriptionTraffic: ConnectionsSnapshot['subscriptionTraffic']
  setConnections: React.Dispatch<React.SetStateAction<ConnectionsSnapshot>>
  refreshConnections: () => void
}

export function useConnectionsStore(
  coord: StoreCoordinator,
  busy: boolean,
  refreshing: boolean,
  loading: boolean
): ConnectionsStore {
  const [connections, setConnections] = useState<ConnectionsSnapshot>(EMPTY_CONNECTIONS)
  const [subscriptionTraffic, setSubscriptionTraffic] = useState<ConnectionsSnapshot['subscriptionTraffic']>()
  const connectionRequest = useRef<Promise<ConnectionsSnapshot> | null>(null)
  const [refreshRevision, setRefreshRevision] = useState(0)
  const refreshConnections = useCallback(() => setRefreshRevision(value => value + 1), [])

  useEffect(() => {
    if (!coord.visible || (coord.activeTab !== 'dashboard' && coord.activeTab !== 'connections')) {
      setConnections(EMPTY_CONNECTIONS)
    }
  }, [coord.visible, coord.activeTab])

  useEffect(() => {
    if (coord.coreStatus === 'running' || coord.coreStatus === 'starting') return
    setConnections(EMPTY_CONNECTIONS)
  }, [coord.coreStatus])

  useEffect(() => {
    if (
      !window.api ||
      coord.coreStatus === 'starting' ||
      busy ||
      refreshing ||
      loading ||
      !coord.visible ||
      (coord.activeTab !== 'dashboard' && coord.activeTab !== 'connections')
    ) {
      return
    }

    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const revision = coord.statusRevision.current

    const poll = async () => {
      try {
        if (connectionRequest.current) {
          await connectionRequest.current.catch(() => {})
          if (disposed) return
        }
        const request = window.api.mihomo.getConnections()
        connectionRequest.current = request
        let snapshot: ConnectionsSnapshot
        try {
          snapshot = await request
        } finally {
          if (connectionRequest.current === request) connectionRequest.current = null
        }
        if (
          !disposed &&
          !coord.actionInProgress.current &&
          revision === coord.statusRevision.current
        ) {
          if (coord.coreStatus === 'running') setConnections(snapshot)
          setSubscriptionTraffic(snapshot.subscriptionTraffic)
        }
      } catch {
        /* A restarting core can briefly reject a snapshot. */
      }
      if (!disposed && coord.coreStatus === 'running') {
        timer = setTimeout(poll, coord.settings.general.connectionInterval ?? 2000)
      }
    }

    void poll()
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [
    coord.coreStatus,
    busy,
    refreshing,
    loading,
    coord.visible,
    coord.activeTab,
    coord.dataRevision,
    refreshRevision,
    coord.settings.general.connectionInterval,
    coord.statusRevision,
    coord.actionInProgress
  ])

  return useMemo(() => ({
    connections,
    subscriptionTraffic,
    setConnections,
    refreshConnections
  }), [connections, subscriptionTraffic, setConnections, refreshConnections])
}
