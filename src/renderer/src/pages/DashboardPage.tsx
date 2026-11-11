import { selectedLocalization } from '@shared/custom-localization'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from '../i18n'
import { ArrowDown, ArrowUp, ExternalLink, HelpCircle, LoaderCircle, Power } from 'lucide-react'
import type { CoreState, TrafficStats, TunnelMode } from '@shared/types'
import type { ProfileItem } from '@shared/profile'
import type { AppConfig } from '@shared/app-config'
import type { ConnectionsSnapshot, MihomoRule, ProxyNode } from '@shared/mihomo'
import type { GlobeLocations } from '@shared/geo'
import type { SysProxyStatus } from '@shared/ipc'
import type { NavTab } from '../lib/navigation'
import { formatBytes, formatDuration } from '../lib/format'
import { connectionRoutes } from '../lib/globe'
import { ConnectionGlobe } from '../components/ConnectionGlobe'
import { Button } from '../components/ui/button'
import { Tooltip } from 'radix-ui'

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

function SessionDuration({ startedAt, running, ariaLabel }: { startedAt: number | null; running: boolean; ariaLabel: string }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!running) return
    const sync = () => setNow(Date.now())
    sync()
    const timer = setInterval(sync, 1000)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [running])

  return (
    <output aria-label={ariaLabel} className="overview-session-duration">
      {formatDuration(startedAt ? now - startedAt : 0)}
    </output>
  )
}

function AutoFitTrafficText({ text }: { text: string }) {
  const fontSize = useMemo(() => {
    if (text.length <= 13) return 20
    if (text.length <= 16) return 17
    if (text.length <= 19) return 15
    if (text.length <= 22) return 13
    return 12
  }, [text])

  return (
    <p
      className="mt-2 w-full font-medium tabular-nums tracking-tight text-center whitespace-nowrap overflow-hidden text-ellipsis select-text"
      style={{ fontSize: `${fontSize}px`, minHeight: '1.75rem', lineHeight: '1.75rem' }}
    >
      {text}
    </p>
  )
}

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
  onNavigate,
  onToggleOnlyVpn,
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

  return <section className="page-scroll overview-page">
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

          {(() => {
            const onlyVpn = settings.general.onlyVpnTraffic !== false
            const vpnDownload = connections.vpnDownloadTotal ?? 0
            const vpnUpload = connections.vpnUploadTotal ?? 0
            const trafficMetrics = [
              {
                label: t('download'),
                value: onlyVpn ? vpnDownload : connections.downloadTotal,
                vpnValue: vpnDownload,
                totalValue: connections.downloadTotal,
                rate: traffic.down,
                icon: ArrowDown
              },
              {
                label: t('upload'),
                value: onlyVpn ? vpnUpload : connections.uploadTotal,
                vpnValue: vpnUpload,
                totalValue: connections.uploadTotal,
                rate: traffic.up,
                icon: ArrowUp
              }
            ]

            return (
              <Tooltip.Provider delayDuration={150}>
                <div className="overview-panel-section text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-2">
                    <h3 className="overview-eyebrow !mb-0 text-center">{t('sessionTraffic')}</h3>
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center text-muted-foreground/60 hover:text-foreground transition-colors cursor-help rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          aria-label={onlyVpn ? t('trafficExplanationVpn') : t('trafficExplanationAll')}
                        >
                          <HelpCircle className="size-3 shrink-0" />
                        </button>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content side="top" sideOffset={6} className="sidebar-tooltip max-w-56 text-center">
                          <p className="text-[11px] leading-snug">
                            {onlyVpn ? t('trafficExplanationVpn') : t('trafficExplanationAll')}
                          </p>
                          <Tooltip.Arrow className="fill-popover" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  </div>
                  <div className="overview-traffic text-center">
                    {trafficMetrics.map(({ label, value, vpnValue, totalValue, rate, icon: Icon }) => (
                      <Tooltip.Root key={label}>
                        <Tooltip.Trigger asChild>
                          <div className="flex flex-col items-center text-center min-w-0 cursor-help select-none">
                            <span className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                              <Icon className="size-3 text-primary shrink-0" />
                              {label}
                            </span>
                            <AutoFitTrafficText text={formatBytes(value, locale)} />
                            <p className="mt-1 text-[10px] text-muted-foreground tabular-nums text-center whitespace-nowrap overflow-hidden text-ellipsis w-full">
                              {t('rate', { value: formatBytes(rate, locale) })}
                            </p>
                          </div>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content side="top" sideOffset={8} className="sidebar-tooltip">
                            <div className="flex flex-col gap-1 text-[11px] min-w-36 text-left">
                              <div className="flex items-center gap-1 font-semibold text-foreground/90 border-b border-border/50 pb-1">
                                <span>{label}</span>
                                <span>·</span>
                                <span>{t('trafficBreakdown')}</span>
                              </div>
                              <div className="flex justify-between gap-3 text-muted-foreground">
                                <span>{t('trafficVpn')}</span>
                                <span className="font-mono text-foreground font-medium">{formatBytes(vpnValue, locale)}</span>
                              </div>
                              <div className="flex justify-between gap-3 text-muted-foreground">
                                <span>{t('trafficTotal')}</span>
                                <span className="font-mono text-foreground font-medium">{formatBytes(totalValue, locale)}</span>
                              </div>
                            </div>
                            <Tooltip.Arrow className="fill-popover" />
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    ))}
                  </div>
                </div>
              </Tooltip.Provider>
            )
          })()}
          {activeProfile?.supportUrl?.startsWith('https://') && (
            <div className="overview-panel-section overview-support-section p-3">
              <Button
                variant="secondary"
                className="w-full gap-2.5 text-xs font-semibold h-10 rounded-xl bg-secondary/80 hover:bg-secondary text-secondary-foreground border border-border/80 shadow-xs hover:shadow transition-all active:scale-[0.98] cursor-pointer"
                onClick={() => {
                  if (window.api?.app?.openUrl) {
                    void window.api.app.openUrl(activeProfile.supportUrl!)
                  } else {
                    window.open(activeProfile.supportUrl, '_blank')
                  }
                }}
              >
                <HelpCircle className="size-4 text-primary shrink-0" />
                <span className="font-medium tracking-wide">{t('support')}</span>
                <ExternalLink className="size-3.5 ml-auto text-muted-foreground opacity-75" />
              </Button>
            </div>
          )}
        </aside>
        {!liteMode && running && <div className="overview-map-notes" role="status"><p>{locating ? t('locatingRoutes') : statusMessage}</p></div>}
      </div>
    </div>
  </section>
}
