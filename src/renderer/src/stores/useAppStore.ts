import { selectedLocalization } from '@shared/custom-localization'
import { useState, useEffect, useCallback, useRef } from 'react'
import { AppConfig, DEFAULT_APP_CONFIG } from '@shared/app-config'
import { ConnectionsSnapshot, MihomoRule, ProxyNode } from '@shared/mihomo'
import { ProfileItem, CustomRuleItem } from '@shared/profile'
import { CoreState, LogEntry, TrafficStats } from '@shared/types'
import { SysProxyStatus } from '@shared/ipc'
import type { NavTab } from '../lib/navigation'
import { translate } from '../i18n/catalogs'
export type { NavTab } from '../lib/navigation'

const EMPTY_CONNECTIONS: ConnectionsSnapshot = { downloadTotal: 0, uploadTotal: 0, connections: [] }

export function useAppStore() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard')
  const [coreStatus, setCoreStatus] = useState<CoreState>('stopped')
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null)
  const [traffic, setTraffic] = useState<TrafficStats>({ up: 0, down: 0 })
  const [sysProxy, setSysProxy] = useState<SysProxyStatus>({ enabled: false, mode: 'manual', port: 7895 })
  const [profiles, setProfiles] = useState<ProfileItem[]>([])
  const [activeProfile, setActiveProfile] = useState<ProfileItem | null>(null)
  const [settings, setSettings] = useState<AppConfig>(() => {
    const boot = window.api?.bootAppearance
    return boot ? { ...DEFAULT_APP_CONFIG, general: { ...DEFAULT_APP_CONFIG.general, theme: boot.preference, language: boot.language } } : DEFAULT_APP_CONFIG
  })
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [proxies, setProxies] = useState<Record<string, ProxyNode>>({})
  const [delays, setDelays] = useState<Record<string, number>>({})
  const [connections, setConnections] = useState<ConnectionsSnapshot>(EMPTY_CONNECTIONS)
  const [rules, setRules] = useState<MihomoRule[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden')
  const [dataRevision, setDataRevision] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const actionInProgress = useRef(false)
  const refreshSequence = useRef(0)
  const pendingRefresh = useRef<Promise<void> | null>(null)
  const statusRevision = useRef(0)
  const mounted = useRef(false)
  const logBuffer = useRef<LogEntry[]>([])
  const latestTraffic = useRef<TrafficStats>({ up: 0, down: 0 })
  const connectionRequest = useRef<Promise<ConnectionsSnapshot> | null>(null)
  const activeView = useRef({ activeTab, visible })
  activeView.current = { activeTab, visible }
  const preferences = useRef(settings.general)
  preferences.current = settings.general
  useEffect(() => {
    const limit = settings.general.maxLogs ?? 300
    if (logBuffer.current.length <= limit) return
    logBuffer.current.splice(0, logBuffer.current.length - limit)
    if (activeView.current.activeTab === 'logs' && activeView.current.visible) setLogs([...logBuffer.current])
  }, [settings.general.maxLogs])

  const reportError = useCallback((err: unknown) => {
    setError(err instanceof Error ? err.message : String(err))
  }, [])

  const refreshAll = useCallback((): Promise<void> => {
    if (!window.api) { setLoading(false); return Promise.resolve() }
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
      // Proxy synchronization can wait for Windows registry/PAC operations.
      // Preserve action completion semantics while displaying local data early.
      const proxyResult = Promise.allSettled([apply(window.api.sysproxy.getStatus(), setSysProxy)])
      const results = await Promise.allSettled([
        apply(window.api.kernel.getStatus(), (status) => {
          if (revision !== statusRevision.current) return
          setCoreStatus(status)
        }),
        apply(window.api.kernel.getSessionStartedAt?.() ?? Promise.resolve(null), (startedAt) => {
          if (revision === statusRevision.current) setSessionStartedAt(startedAt)
        }),
        apply(window.api.profiles.getList(), setProfiles),
        apply(window.api.profiles.getActive(), setActiveProfile),
        apply(window.api.settings.get(), setSettings)
      ])
      if (!current()) return
      setLoading(false)
      results.push(...await proxyResult)
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
  }, [])

  useEffect(() => {
    mounted.current = true
    const visibility = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', visibility)
    void refreshAll().catch((err) => { if (mounted.current) reportError(err) })
    if (!window.api) return () => { mounted.current = false; document.removeEventListener('visibilitychange', visibility) }
    const unsubTraffic = window.api.events.onTraffic((stats) => {
      latestTraffic.current = stats
      if (activeView.current.visible && activeView.current.activeTab === 'dashboard') setTraffic(stats)
    })
    const unsubStatus = window.api.events.onCoreStatus((status) => {
      statusRevision.current++
      setCoreStatus(status)
      if (status === 'error') {
        reportError(translate(preferences.current.language, 'app', 'coreUnexpectedError', {}, selectedLocalization(preferences.current)))
      }
      if (status !== 'running') setSessionStartedAt(null)
      else {
        const revision = statusRevision.current
        void (window.api.kernel.getSessionStartedAt?.() ?? Promise.resolve(Date.now())).then((startedAt) => {
          if (mounted.current && revision === statusRevision.current) setSessionStartedAt(startedAt)
        }).catch(reportError)
      }
      if (status === 'running' && !actionInProgress.current) void refreshAll().catch(reportError)
    })
    const unsubSettings = window.api.events.onSettingsChanged?.(() => { void refreshAll().catch(reportError) })
    const unsubTunError = window.api.events.onTunError?.(() => {
      reportError(translate(preferences.current.language, 'app', 'tunStartRequiresAdmin', {}, selectedLocalization(preferences.current)))
    })
    const unsubVisibility = window.api.events.onWindowVisibility?.((isWinVisible) => {
      setVisible(isWinVisible)
      if (isWinVisible) {
        void refreshAll().catch(reportError)
      }
    })
    const unsubLog = window.api.events.onLog((log) => {
      logBuffer.current.push(log)
      const limit = preferences.current.maxLogs ?? 300
      if (logBuffer.current.length > limit) logBuffer.current.splice(0, logBuffer.current.length - limit)
    })
    return () => {
      mounted.current = false
      document.removeEventListener('visibilitychange', visibility)
      unsubTraffic(); unsubStatus(); unsubLog(); unsubSettings?.(); unsubTunError?.(); unsubVisibility?.()
    }
  }, [refreshAll, reportError])

  useEffect(() => {
    if (!visible) {
      setConnections(EMPTY_CONNECTIONS)
      setLogs([])
      return
    }
    if (activeTab === 'dashboard') setTraffic(latestTraffic.current)
    if (activeTab !== 'logs') return
    let lastEntry: LogEntry | undefined
    const flush = () => {
      const latest = logBuffer.current.at(-1)
      if (latest === lastEntry) return
      lastEntry = latest
      setLogs([...logBuffer.current])
    }
    // Publish the accumulated buffer immediately when returning to the logs page.
    setLogs([...logBuffer.current])
    lastEntry = logBuffer.current.at(-1)
    const timer = setInterval(flush, 250)
    return () => clearInterval(timer)
  }, [activeTab, visible])

  useEffect(() => {
    if (coreStatus === 'running' || coreStatus === 'starting') return
    latestTraffic.current = { up: 0, down: 0 }
    setTraffic({ up: 0, down: 0 })
    setConnections(EMPTY_CONNECTIONS)
  }, [coreStatus])

  useEffect(() => {
    if (!window.api || coreStatus === 'starting' || busy || refreshing || loading) return
    let disposed = false
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const revision = statusRevision.current
    const current = () => !disposed && !actionInProgress.current && revision === statusRevision.current
    // Each dataset publishes independently and retries without hiding the workspace.
    const load = async <T,>(request: () => Promise<T>, publish: (value: T) => void, attempt = 0): Promise<void> => {
      try {
        const value = await request()
        if (current()) publish(value)
      } catch (err) {
        if (!current()) return
        if (attempt < 2) {
          const timer = setTimeout(() => { timers.delete(timer); void load(request, publish, attempt + 1) }, 1000 * 2 ** attempt)
          timers.add(timer)
        } else reportError(err)
      }
    }
    void load(() => window.api.mihomo.getProxies(), setProxies)
    void load(() => window.api.mihomo.getRules(), setRules)
    return () => { disposed = true; timers.forEach(clearTimeout) }
  }, [coreStatus, busy, refreshing, loading, dataRevision, reportError])

  useEffect(() => {
    if (!window.api || coreStatus !== 'running' || busy || refreshing || loading || !visible || (activeTab !== 'dashboard' && activeTab !== 'connections')) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const revision = statusRevision.current
    const poll = async () => {
      try {
        // An old view may still own a request. Wait for it before starting another.
        if (connectionRequest.current) {
          await connectionRequest.current.catch(() => {})
          if (disposed) return
        }
        const request = window.api.mihomo.getConnections()
        connectionRequest.current = request
        let snapshot: ConnectionsSnapshot
        try { snapshot = await request }
        finally { if (connectionRequest.current === request) connectionRequest.current = null }
        if (!disposed && !actionInProgress.current && revision === statusRevision.current) setConnections(snapshot)
      } catch { /* A restarting core can briefly reject a snapshot. */ }
      if (!disposed) timer = setTimeout(poll, settings.general.connectionInterval ?? 2000)
    }
    void poll()
    return () => { disposed = true; clearTimeout(timer) }
  }, [coreStatus, busy, refreshing, loading, visible, activeTab, dataRevision, settings.general.connectionInterval])

  const perform = async (task: () => Promise<unknown>): Promise<boolean> => {
    if (!window.api || actionInProgress.current) return false
    actionInProgress.current = true
    refreshSequence.current++
    setBusy(true)
    setError(null)
    try {
      await task()
      // A refresh begun before the mutation cannot satisfy its refresh afterwards.
      if (pendingRefresh.current) await pendingRefresh.current.catch(() => {})
      await refreshAll()
      return true
    } catch (err) {
      reportError(err)
      // A failed mutation may still have changed backend state, or invalidated startup.
      if (pendingRefresh.current) await pendingRefresh.current.catch(() => {})
      await refreshAll().catch(() => {})
      return false
    } finally {
      actionInProgress.current = false
      setBusy(false)
    }
  }

  const saveSettings = async (patch: Partial<AppConfig>) => {
    const success = await perform(async () => {
      const updated = await window.api.settings.update(patch)
      setSettings(updated)
    })
    if (!success) throw new Error(translate(settings.general.language, 'common', 'saveError', {}, selectedLocalization(settings.general)))
  }

  const updateDelays = useCallback((updates: Record<string, number>) => {
    setDelays((prev) => ({ ...prev, ...updates }))
  }, [])

  return {
    activeTab, setActiveTab, coreStatus, sessionStartedAt, traffic, sysProxy, profiles, activeProfile,
    settings, logs, proxies, delays, updateDelays, connections, rules, loading, busy, error, visible,
    dismissError: () => setError(null), saveSettings,
    refreshAll: () => perform(async () => {}),
    toggleSysProxy: () => perform(() => window.api.sysproxy.set(!sysProxy.enabled)),
    restartKernel: () => perform(() => window.api.kernel.restart()),
    toggleKernel: () => perform(() => coreStatus === 'running' ? window.api.kernel.stop() : window.api.kernel.start()),
    selectProxyNode: (group: string, node: string) => perform(() => window.api.mihomo.selectProxy(group, node)),
    switchActiveProfile: (id: string) => perform(() => window.api.profiles.setActive(id)),
    updateActiveProfile: () => perform(async () => {
      if (activeProfile?.url) await window.api.profiles.update(activeProfile.id)
    }),
    saveCustomRules: (rules: CustomRuleItem[]) =>
      perform(async () => {
        if (!activeProfile) return
        await window.api.profiles.saveCustomRules(activeProfile.id, rules)
      }),
    saveRawConfig: (content: string) =>
      perform(async () => {
        if (!activeProfile) return
        await window.api.profiles.saveRawConfig(activeProfile.id, content)
      }),
    clearLogs: () => { logBuffer.current = []; setLogs([]) }
  }
}
