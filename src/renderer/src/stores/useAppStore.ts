import { useState, useEffect, useCallback } from 'react'
import { AppConfig, DEFAULT_APP_CONFIG } from '@shared/app-config'
import { ConnectionsSnapshot, ProxyNode } from '@shared/mihomo'
import { ProfileItem } from '@shared/profile'
import { CoreState, LogEntry, TrafficStats } from '@shared/types'
import { SysProxyStatus } from '@shared/ipc'

export type NavTab = 'dashboard' | 'proxies' | 'profiles' | 'connections' | 'logs' | 'settings'

export function useAppStore() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard')
  const [coreStatus, setCoreStatus] = useState<CoreState>('stopped')
  const [traffic, setTraffic] = useState<TrafficStats>({ up: 0, down: 0 })
  const [sysProxy, setSysProxy] = useState<SysProxyStatus>({ enabled: false, mode: 'manual', port: 7890 })
  const [profiles, setProfiles] = useState<ProfileItem[]>([])
  const [activeProfile, setActiveProfile] = useState<ProfileItem | null>(null)
  const [settings, setSettings] = useState<AppConfig>(DEFAULT_APP_CONFIG)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [proxies, setProxies] = useState<Record<string, ProxyNode>>({})
  const [connections, setConnections] = useState<ConnectionsSnapshot>({
    downloadTotal: 0,
    uploadTotal: 0,
    connections: []
  })

  // Initial load
  const refreshAll = useCallback(async () => {
    if (!window.api) return
    try {
      const [status, spStatus, pList, actProfile, appSettings] = await Promise.all([
        window.api.kernel.getStatus(),
        window.api.sysproxy.getStatus(),
        window.api.profiles.getList(),
        window.api.profiles.getActive(),
        window.api.settings.get()
      ])
      setCoreStatus(status)
      setSysProxy(spStatus)
      setProfiles(pList)
      setActiveProfile(actProfile)
      setSettings(appSettings)

      if (status === 'running') {
        const [proxyList, connSnapshot] = await Promise.all([
          window.api.mihomo.getProxies(),
          window.api.mihomo.getConnections()
        ])
        setProxies(proxyList)
        setConnections(connSnapshot)
      }
    } catch (err) {
      console.error('Failed to refresh app state:', err)
    }
  }, [])

  useEffect(() => {
    refreshAll()

    if (!window.api) return

    const unsubTraffic = window.api.events.onTraffic((data) => {
      setTraffic(data)
    })

    const unsubCoreStatus = window.api.events.onCoreStatus((status) => {
      setCoreStatus(status)
      if (status === 'running') {
        window.api.mihomo.getProxies().then(setProxies).catch(() => {})
      }
    })

    const unsubLog = window.api.events.onLog((log) => {
      setLogs((prev) => [...prev.slice(-300), log])
    })

    return () => {
      unsubTraffic()
      unsubCoreStatus()
      unsubLog()
    }
  }, [refreshAll])

  const toggleSysProxy = async () => {
    if (!window.api) return
    const nextState = !sysProxy.enabled
    await window.api.sysproxy.set(nextState)
    setSysProxy((prev) => ({ ...prev, enabled: nextState }))
  }

  const restartKernel = async () => {
    if (!window.api) return
    setCoreStatus('starting')
    await window.api.kernel.restart()
    await refreshAll()
  }

  const selectProxyNode = async (group: string, node: string) => {
    if (!window.api) return
    await window.api.mihomo.selectProxy(group, node)
    const updated = await window.api.mihomo.getProxies()
    setProxies(updated)
  }

  const switchActiveProfile = async (id: string) => {
    if (!window.api) return
    await window.api.profiles.setActive(id)
    await refreshAll()
  }

  const clearLogs = () => {
    setLogs([])
  }

  return {
    activeTab,
    setActiveTab,
    coreStatus,
    traffic,
    sysProxy,
    profiles,
    activeProfile,
    settings,
    logs,
    proxies,
    connections,
    refreshAll,
    toggleSysProxy,
    restartKernel,
    selectProxyNode,
    switchActiveProfile,
    clearLogs,
    setSettings
  }
}
