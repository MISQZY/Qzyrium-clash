import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import type { TrafficStats } from '@shared/types'
import type { StoreCoordinator } from './types'

export interface TrafficStoreState {
  traffic: TrafficStats
  setTraffic: (stats: TrafficStats | ((prev: TrafficStats) => TrafficStats)) => void
  resetTraffic: () => void
}

export const useTrafficStore = create<TrafficStoreState>((set) => ({
  traffic: { up: 0, down: 0 },
  setTraffic: (stats) =>
    set((state) => ({
      traffic: typeof stats === 'function' ? stats(state.traffic) : stats
    })),
  resetTraffic: () => set({ traffic: { up: 0, down: 0 } })
}))

export type TrafficStore = TrafficStoreState

export const useTraffic = useTrafficStore

/**
 * Syncs Mihomo traffic events to Zustand outside the React root context lifecycle.
 * Prevents 1-second traffic ticks from causing cascading re-renders in useAppStoreInternal.
 */
export function useTrafficSync(coord: StoreCoordinator): TrafficStoreState {
  const latestTraffic = useRef<TrafficStats>({ up: 0, down: 0 })
  const activeView = useRef({ activeTab: coord.activeTab, visible: coord.visible })
  activeView.current = { activeTab: coord.activeTab, visible: coord.visible }

  useEffect(() => {
    if (!window.api?.events?.onTraffic) return
    const unsub = window.api.events.onTraffic((stats) => {
      latestTraffic.current = stats
      if (activeView.current.visible && activeView.current.activeTab === 'dashboard') {
        useTrafficStore.getState().setTraffic(stats)
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    if (coord.visible && coord.activeTab === 'dashboard') {
      useTrafficStore.getState().setTraffic(latestTraffic.current)
    }
  }, [coord.activeTab, coord.visible])

  useEffect(() => {
    if (coord.coreStatus === 'running' || coord.coreStatus === 'starting') return
    latestTraffic.current = { up: 0, down: 0 }
    useTrafficStore.getState().resetTraffic()
  }, [coord.coreStatus])

  return useTrafficStore.getState()
}
