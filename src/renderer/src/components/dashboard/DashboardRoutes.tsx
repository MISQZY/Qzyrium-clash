import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { selectedLocalization } from '@shared/custom-localization'
import type { AppConfig } from '@shared/app-config'
import type { ProfileItem } from '@shared/profile'
import type { GlobeLocations } from '@shared/geo'
import { useLocale, useTranslations } from '../../i18n'
import { useConnections, useProxies, useRules } from '../../stores/useAppStore'
import { connectionRoutes, type GlobeRoute } from '../../lib/globe'
import { ConnectionGlobe } from '../ConnectionGlobe'

const EMPTY_LOCATIONS: GlobeLocations = { origin: null, routes: [] }
const RoutesContext = createContext<{ routes: GlobeRoute[]; pendingNodes?: string[]; statusMessage: string; locating: boolean } | null>(null)

export function DashboardRoutesProvider({ running, connecting, settings, activeProfile, visible, children }: {
  running: boolean
  connecting: boolean
  settings: AppConfig
  activeProfile: ProfileItem | null
  visible: boolean
  children: ReactNode
}) {
  const t = useTranslations('dashboard')
  const locale = useLocale()
  const connections = useConnections((state) => state.connections)
  const { proxies, delays, updateDelays: onUpdateDelays } = useProxies()
  const { rules } = useRules()
  const liteMode = Boolean(settings.general.liteDashboard)
  const [locations, setLocations] = useState<GlobeLocations>(EMPTY_LOCATIONS)
  const [locating, setLocating] = useState(false)
  const selectionKey = useMemo(() => {
    const parts: string[] = []
    for (const name in proxies) {
      const now = proxies[name]?.now
      if (now) parts.push(`${name}:${now}`)
    }
    return parts.sort().join(';')
  }, [proxies])

  useEffect(() => {
    if (!running) {
      setLocations(EMPTY_LOCATIONS)
      setLocating(false)
      return
    }
    if (!visible || liteMode || !window.api?.mihomo.getGlobeLocations) return
    setLocating(true)
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const result = await window.api.mihomo.getGlobeLocations()
        if (!disposed && result) setLocations(result)
      } catch { if (!disposed) setLocations((previous) => ({ ...previous, status: 'geoip-unavailable' })) }
      finally { if (!disposed) setLocating(false) }
      if (!disposed) { timer = setTimeout(poll, running ? 10_000 : 30_000) }
    }
    void poll()
    return () => { disposed = true; clearTimeout(timer) }
  }, [visible, liteMode, running, connecting, activeProfile?.id, activeProfile?.updatedAt, settings.kernel.mode, selectionKey])

  const shouldShowRoutes = !liteMode && running && settings.kernel.mode !== 'direct'
  const routes = useMemo(
    () => shouldShowRoutes ? connectionRoutes(locations, proxies, delays, connections, settings.kernel.mode, rules, locale, undefined, selectedLocalization(settings.general)) : [],
    [shouldShowRoutes, locations, proxies, delays, connections, settings.kernel.mode, rules, locale, settings.general]
  )

  const routeNodes = useMemo(() => {
    const set = new Set<string>()
    for (const route of routes) {
      if (route.node) set.add(route.node)
    }
    return Array.from(set).sort()
  }, [routes])
  const routeKey = routeNodes.join('|')
  const statusMessage = locations.status === 'origin-unavailable'
    ? t('originUnavailable')
    : locations.status === 'server-unavailable'
    ? t('serverUnavailable')
    : locations.status === 'geoip-unavailable'
    ? t('geoipUnavailable')
    : locations.status === 'direct'
    ? t('directConnection')
    : ''

  useEffect(() => {
    if (!visible || liteMode || !running || !window.api || !routeKey) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const measure = async () => {
      const nodes = routeKey.split('|')
      const results: PromiseSettledResult<number>[] = new Array(nodes.length)
      let next = 0
      await Promise.all(Array.from({ length: Math.min(settings.general.delayTestConcurrency ?? 6, nodes.length) }, async () => {
        while (!disposed && next < nodes.length) {
          const index = next++
          try { results[index] = { status: 'fulfilled', value: await window.api.mihomo.testDelay(nodes[index]) } }
          catch (reason) { results[index] = { status: 'rejected', reason } }
        }
      }))
      if (disposed) return
      const measured: Record<string, number> = {}
      results.forEach((result, index) => { measured[nodes[index]] = result.status === 'fulfilled' ? result.value : 0 })
      onUpdateDelays(measured)
      timer = setTimeout(measure, 60_000)
    }
    void measure()
    return () => { disposed = true; clearTimeout(timer) }
  }, [visible, liteMode, running, routeKey, onUpdateDelays, settings.general.delayTestConcurrency])

  const value = useMemo(() => ({ routes, pendingNodes: locations.pendingNodes, statusMessage, locating }),
    [routes, locations.pendingNodes, statusMessage, locating])
  return <RoutesContext.Provider value={value}>{children}</RoutesContext.Provider>
}

function useDashboardRoutes() {
  const value = useContext(RoutesContext)
  if (!value) throw new Error('Dashboard routes must be used within DashboardRoutesProvider')
  return value
}

export function DashboardGlobe({ running }: { running: boolean }) {
  const { routes, pendingNodes } = useDashboardRoutes()
  return <ConnectionGlobe running={running} routes={routes} pendingNodes={pendingNodes} />
}

export function DashboardMapNotes({ running }: { running: boolean }) {
  const { locating, statusMessage } = useDashboardRoutes()
  const t = useTranslations('dashboard')
  const message = locating ? t('locatingRoutes') : statusMessage
  return <div className={`overview-map-notes${running ? '' : ' invisible'}${!message ? ' is-empty' : ''}`} role="status" aria-hidden={!running || !message}>
    <p>{message}</p>
  </div>
}
