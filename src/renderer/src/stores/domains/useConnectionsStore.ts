import { useState, useEffect, useRef } from 'react'
import type { ConnectionsSnapshot } from '@shared/mihomo'
import { EMPTY_CONNECTIONS, type StoreCoordinator } from './types'

export interface ConnectionsStore {
  connections: ConnectionsSnapshot
  setConnections: React.Dispatch<React.SetStateAction<ConnectionsSnapshot>>
}

export function useConnectionsStore(
  coord: StoreCoordinator,
  busy: boolean,
  refreshing: boolean,
  loading: boolean
): ConnectionsStore {
  const [connections, setConnections] = useState<ConnectionsSnapshot>(EMPTY_CONNECTIONS)
  const connectionRequest = useRef<Promise<ConnectionsSnapshot> | null>(null)

  useEffect(() => {
    if (!coord.visible) {
      setConnections(EMPTY_CONNECTIONS)
    }
  }, [coord.visible])

  useEffect(() => {
    if (coord.coreStatus === 'running' || coord.coreStatus === 'starting') return
    setConnections(EMPTY_CONNECTIONS)
  }, [coord.coreStatus])

  useEffect(() => {
    if (
      !window.api ||
      coord.coreStatus !== 'running' ||
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
          setConnections(snapshot)
        }
      } catch {
        /* A restarting core can briefly reject a snapshot. */
      }
      if (!disposed) {
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
    coord.settings.general.connectionInterval,
    coord.statusRevision,
    coord.actionInProgress
  ])

  return {
    connections,
    setConnections
  }
}
