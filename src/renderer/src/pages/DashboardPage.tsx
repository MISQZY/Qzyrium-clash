import { selectedLocalization } from '@shared/custom-localization'
import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from '../i18n'
import { ExternalLink, HelpCircle, LoaderCircle, Power } from 'lucide-react'
import type { CoreState, TrafficStats, TunnelMode } from '@shared/types'
import type { ProfileItem } from '@shared/profile'
import type { AppConfig } from '@shared/app-config'
import type { ConnectionsSnapshot, MihomoRule, ProxyNode } from '@shared/mihomo'
import type { GlobeLocations } from '@shared/geo'
import type { SysProxyStatus } from '@shared/ipc'
import type { NavTab } from '../lib/navigation'
import { connectionRoutes } from '../lib/globe'
import { ConnectionGlobe } from '../components/ConnectionGlobe'
import { Button } from '../components/ui/button'
import { SubscriptionUsageBar } from '../components/SubscriptionUsageBar'
import { subscriptionUsage } from '@shared/subscription-health'
import { SessionDuration } from '../components/dashboard/SessionDuration'
import { SessionTrafficMetrics } from '../components/dashboard/SessionTrafficMetrics'

interface DashboardPageProps {
  visible?: boolean
  coreStatus: CoreState; traffic: TrafficStats; activeProfile: ProfileItem | null
  sessionStartedAt: number | null
  profiles: ProfileItem[]; proxies: Record<string, ProxyNode>; delays: Record<string, number>
  settings: AppConfig; connections: ConnectionsSnapshot; sysProxy: SysProxyStatus; busy: boolean
  rules?: MihomoRule[]
  onRestart: () => void; onToggleKernel: () => void; onToggleSysProxy: () => void
  onToggleTun: () => void; onUpdateMode: (mode: TunnelMode) => void; onNavigate?: (tab: NavTab) => void
  onSwitchProfile: (id: string) => unknown; onUpdateDelays: (delays: Record<string, number>) => void
  onToggleOnlyVpn?: () => void
}
const EMPTY_LOCATIONS: GlobeLocations = { origin: null, routes: [] }

export function DashboardPage({
  coreStatus,
  sessionStartedAt,
  traffic,
  activeProfile,
  proxies,
  delays,
  settings,
  connections,
  busy,
  rules,
  onToggleKernel,
  onUpdateDelays,
  visible = true
}: DashboardPageProps) {
  const t = useTranslations('dashboard')
  const locale = useLocale()
  const running = coreStatus === 'running'
  const connecting = coreStatus === 'starting'
  const liteMode = Boolean(settings.general.liteDashboard)
  const [locations, setLocations] = useState<GlobeLocations>(EMPTY_LOCATIONS)
  const [locating, setLocating] = useState(false)
  const selectionKey = JSON.stringify(Object.entries(proxies).filter(([, node]) => node.now).map(([name, node]) => [name, node.now]))

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

  const shouldShowRoutes = running && settings.kernel.mode !== 'direct'
  const routes = useMemo(
    () => shouldShowRoutes ? connectionRoutes(locations, proxies, delays, connections, settings.kernel.mode, rules, locale, undefined, selectedLocalization(settings.general)) : [],
    [shouldShowRoutes, locations, proxies, delays, connections, settings.kernel.mode, rules, locale, settings.general]
  )

  const routeNames = JSON.stringify(routes.map((route) => route.node).sort())
  const statusMessage = locations.status === 'origin-unavailable' ? t('originUnavailable') : locations.status === 'server-unavailable' ? t('serverUnavailable') : locations.status === 'geoip-unavailable' ? t('geoipUnavailable') : locations.status === 'direct' ? t('directConnection') : routes.length ? routes.some((route) => route.approximate) ? t('localGeoipLocations') : t('geoipLocations') : t('noLocatedRoutes')

  useEffect(() => {
    if (!visible || liteMode || !running || !window.api || routeNames === '[]') return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const measure = async () => {
      const nodes = JSON.parse(routeNames) as string[]
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
  }, [visible, liteMode, running, routeNames, onUpdateDelays, settings.general.delayTestConcurrency])

  const statusLabel =
    connecting || (busy && !running)
      ? t('pleaseWait')
      : busy && running
      ? t('pleaseWait')
      : coreStatus === 'error'
      ? t('connectionError')
      : running
      ? t('connectedState')
      : t('disconnectedState')

  const announcePill = activeProfile?.announce ? (
    <div className={`overview-announce-pill${liteMode ? ' is-lite' : ''}`} role="status">
      <span className="overview-announce-text">
        {activeProfile.announce}
      </span>
    </div>
  ) : null

  return (
    <section className="page-scroll overview-page">
      <header className="page-heading">
        <h1 className="text-xl font-semibold tracking-tight">{t('overview')}</h1>
        {!liteMode && announcePill}
      </header>
      <div className={`overview-layout${liteMode ? ' is-lite' : ''}`}>
        {!liteMode && visible && (
          <ConnectionGlobe
            running={running}
            routes={routes}
            pendingNodes={locations.pendingNodes}
          />
        )}
        <div className="overview-panel-column">
          {liteMode && announcePill}
          <aside className="overview-panel" aria-label={t('connectionControls')}>
            <div className="overview-power-section">
              <p className={`text-sm font-medium ${coreStatus === 'error' ? 'text-destructive' : ''}`} role="status">
                {statusLabel}
              </p>
              <button
                data-tour="connect"
                className={`overview-power ${running ? 'is-running' : ''} ${coreStatus === 'error' ? 'border-destructive text-destructive' : ''}`}
                onClick={onToggleKernel}
                disabled={busy || connecting}
                aria-label={running ? t('stopCore') : t('startCore')}
                aria-pressed={running}
              >
                {busy || connecting ? <LoaderCircle className="size-12 animate-spin" /> : <Power className="size-12" strokeWidth={1.5} />}
              </button>
              <div className="overview-duration-slot">
                {running && <SessionDuration startedAt={sessionStartedAt} running={running} ariaLabel={t('sessionDuration')} />}
              </div>
            </div>

            <SessionTrafficMetrics
              connections={connections}
              traffic={traffic}
              onlyVpnTraffic={settings.general.onlyVpnTraffic !== false}
            />

            {subscriptionUsage(activeProfile?.userInfo) && (
              <div className="overview-panel-section overview-quota-section">
                <SubscriptionUsageBar info={activeProfile?.userInfo} compact />
              </div>
            )}

            {activeProfile?.supportUrl?.startsWith('https://') && (
              <div className="overview-panel-section overview-support-section">
                <Button
                  variant="secondary"
                  className="w-full gap-2.5 text-xs font-semibold h-9 rounded-xl bg-secondary/80 hover:bg-secondary text-secondary-foreground border border-border/80 transition-[color,background-color,border-color,transform] active:scale-[0.98] cursor-pointer"
                  onClick={() => {
                    if (window.api?.app?.openUrl) {
                      void window.api.app.openUrl(activeProfile.supportUrl!)
                    } else {
                      window.open(activeProfile.supportUrl, '_blank')
                    }
                  }}
                >
                  <HelpCircle className="size-4 text-muted-foreground shrink-0" />
                  <span className="font-medium">{t('support')}</span>
                  <ExternalLink className="size-3.5 ml-auto text-muted-foreground opacity-75" />
                </Button>
              </div>
            )}
          </aside>
          {!liteMode && running && (
            <div className="overview-map-notes" role="status">
              <p>{locating ? t('locatingRoutes') : statusMessage}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
