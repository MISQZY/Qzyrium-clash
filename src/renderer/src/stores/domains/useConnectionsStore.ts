import { useEffect, useRef, useCallback } from 'react'
import { create } from 'zustand'
import type { ConnectionsSnapshot } from '@shared/mihomo'
import { EMPTY_CONNECTIONS, type StoreCoordinator } from './types'

export interface ConnectionsStoreState {
  connections: ConnectionsSnapshot
  subscriptionTraffic: ConnectionsSnapshot['subscriptionTraffic']
  setConnections: (connections: ConnectionsSnapshot | ((prev: ConnectionsSnapshot) => ConnectionsSnapshot)) => void
  setSubscriptionTraffic: (traffic: ConnectionsSnapshot['subscriptionTraffic']) => void
  refreshConnections: () => void
}

export const useConnectionsStore = create<ConnectionsStoreState>((set) => ({
  connections: EMPTY_CONNECTIONS,
  subscriptionTraffic: undefined,
  setConnections: (connections) =>
    set((state) => ({
      connections: typeof connections === 'function' ? connections(state.connections) : connections
    })),
  setSubscriptionTraffic: (subscriptionTraffic) => set({ subscriptionTraffic }),
  refreshConnections: () => {}
}))

export type ConnectionsStore = ConnectionsStoreState

export const useConnections = useConnectionsStore

/**
 * Syncs Mihomo active connections to Zustand outside the React root context lifecycle.
 * Prevents 2-second connection polling ticks from causing cascading re-renders in useAppStoreInternal.
 */
export function useConnectionsSync(
  coord: StoreCoordinator,
  busy: boolean,
  refreshing: boolean,
  loading: boolean
): ConnectionsStoreState {
  const connectionRequest = useRef<Promise<ConnectionsSnapshot> | null>(null)
  const refreshRevision = useRef(0)

  const refreshConnections = useCallback(() => {
    refreshRevision.current += 1
  }, [])

  useEffect(() => {
    useConnectionsStore.setState({ refreshConnections })
  }, [refreshConnections])

  useEffect(() => {
    if (!coord.visible || (coord.activeTab !== 'dashboard' && coord.activeTab !== 'connections')) {
      useConnectionsStore.getState().setConnections(EMPTY_CONNECTIONS)
    }
  }, [coord.visible, coord.activeTab])

  useEffect(() => {
    if (coord.coreStatus === 'running' || coord.coreStatus === 'starting') return
    useConnectionsStore.getState().setConnections(EMPTY_CONNECTIONS)
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
          if (coord.coreStatus === 'running') {
            useConnectionsStore.getState().setConnections(snapshot)
          }
          useConnectionsStore.getState().setSubscriptionTraffic(snapshot.subscriptionTraffic)
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
    coord.settings.general.connectionInterval,
    coord.statusRevision,
    coord.actionInProgress
  ])

  return useConnectionsStore.getState()
}
