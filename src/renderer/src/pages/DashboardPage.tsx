import { selectedLocalization } from '@shared/custom-localization'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from '../i18n'
import { ArrowDown, ArrowUp, ExternalLink, HelpCircle, LoaderCircle, Megaphone, Power } from 'lucide-react'
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
  const containerRef = useRef<HTMLParagraphElement>(null)
  const [fontSize, setFontSize] = useState(20)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    const update = () => {
      el.style.fontSize = '20px'
      const clientW = el.clientWidth
      const scrollW = el.scrollWidth

      if (clientW > 0 && scrollW > clientW) {
        const ratio = clientW / scrollW
        const fitted = Math.max(12, Math.floor(20 * ratio * 0.95))
        setFontSize(fitted)
        el.style.fontSize = `${fitted}px`
      } else {
        setFontSize(20)
      }
    }

    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [text])

  return (
    <p
      ref={containerRef}
      className="mt-2 w-full font-medium tabular-nums tracking-tight text-center whitespace-nowrap overflow-hidden text-ellipsis select-text"
      style={{ fontSize: `${fontSize}px`, minHeight: '1.75rem', lineHeight: '1.75rem' }}
      title={text}
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

  return <section className="page-scroll overview-page">
    <header className="page-heading">
      <h1 className="text-xl font-semibold tracking-tight">{t('overview')}</h1>
      {activeProfile?.announce && (
        <div className="overview-announce-pill" role="status">
          <span className="overview-announce-text">
            {activeProfile.announce}
          </span>
        </div>
      )}
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

          <div className="overview-panel-section text-center">
            <h3 className="overview-eyebrow text-center">{t('sessionTraffic')}</h3>
            <div className="overview-traffic text-center">
              {[
                { label: t('download'), value: connections.downloadTotal, rate: traffic.down, icon: ArrowDown },
                { label: t('upload'), value: connections.uploadTotal, rate: traffic.up, icon: ArrowUp }
              ].map(({ label, value, rate, icon: Icon }) => (
                <div key={label} className="flex flex-col items-center text-center min-w-0">
                  <span className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                    <Icon className="size-3 text-primary shrink-0" />
                    {label}
                  </span>
                  <AutoFitTrafficText text={formatBytes(value, locale)} />
                  <p className="mt-1 text-[10px] text-muted-foreground tabular-nums text-center whitespace-nowrap overflow-hidden text-ellipsis w-full">
                    {t('rate', { value: formatBytes(rate, locale) })}
                  </p>
                </div>
              ))}
            </div>
          </div>
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
