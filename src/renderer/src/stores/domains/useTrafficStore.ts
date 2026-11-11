import { useMemo, useState, useEffect, useRef } from 'react'
import type { TrafficStats } from '@shared/types'
import type { StoreCoordinator } from './types'

export interface TrafficStore {
  traffic: TrafficStats
  setTraffic: React.Dispatch<React.SetStateAction<TrafficStats>>
}

export function useTrafficStore(coord: StoreCoordinator): TrafficStore {
  const [traffic, setTraffic] = useState<TrafficStats>({ up: 0, down: 0 })
  const latestTraffic = useRef<TrafficStats>({ up: 0, down: 0 })
  const activeView = useRef({ activeTab: coord.activeTab, visible: coord.visible })
  activeView.current = { activeTab: coord.activeTab, visible: coord.visible }

  useEffect(() => {
    if (!window.api?.events?.onTraffic) return
    const unsub = window.api.events.onTraffic((stats) => {
      latestTraffic.current = stats
      if (activeView.current.visible && activeView.current.activeTab === 'dashboard') {
        setTraffic(stats)
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    if (coord.visible && coord.activeTab === 'dashboard') {
      setTraffic(latestTraffic.current)
    }
  }, [coord.activeTab, coord.visible])

  useEffect(() => {
    if (coord.coreStatus === 'running' || coord.coreStatus === 'starting') return
    latestTraffic.current = { up: 0, down: 0 }
    setTraffic({ up: 0, down: 0 })
  }, [coord.coreStatus])

  return useMemo(() => ({
    traffic,
    setTraffic
  }), [traffic, setTraffic])
}
