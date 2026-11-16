import { useTranslations } from '../i18n'
import { ExternalLink, HelpCircle, LoaderCircle, Power } from 'lucide-react'
import type { CoreState } from '@shared/types'
import type { ProfileItem } from '@shared/profile'
import type { AppConfig } from '@shared/app-config'
import type { SysProxyStatus } from '@shared/ipc'
import type { NavTab } from '../lib/navigation'
import { Button } from '../components/ui/button'
import { SessionDuration } from '../components/dashboard/SessionDuration'
import { DashboardTrafficMetrics, DashboardQuota } from '../components/dashboard/DashboardTraffic'
import { DashboardRoutesProvider, DashboardGlobe, DashboardMapNotes } from '../components/dashboard/DashboardRoutes'

interface DashboardPageProps {
  visible?: boolean
  coreStatus: CoreState
  activeProfile: ProfileItem | null
  sessionStartedAt: number | null
  settings: AppConfig
  sysProxy: SysProxyStatus
  busy: boolean
  onToggleKernel: () => void
  onToggleSysProxy: () => void
  onNavigate?: (tab: NavTab) => void
}

export function DashboardPage({
  coreStatus,
  sessionStartedAt,
  activeProfile,
  settings,
  sysProxy,
  busy,
  onToggleKernel,
  onToggleSysProxy,
  onNavigate,
  visible = true
}: DashboardPageProps) {
  const t = useTranslations('dashboard')
  const running = coreStatus === 'running'
  const connecting = coreStatus === 'starting'
  const switching = busy || connecting
  const powerState = switching ? 'pending' : coreStatus === 'error' ? 'error' : running ? 'running' : 'stopped'
  const liteMode = Boolean(settings.general.liteDashboard)
  // The core can be running before the configured system proxy finishes enabling.
  const isTrafficUnprotected = running && !switching && !settings.kernel.tun.enable && !settings.sysProxy.enable && !sysProxy.enabled
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
    <DashboardRoutesProvider running={running} connecting={connecting} settings={settings} activeProfile={activeProfile} visible={visible}>
    <section className="page-scroll overview-page">
      <header className="page-heading">
        <h1 className="text-xl font-semibold tracking-tight">{t('overview')}</h1>
        {!liteMode && announcePill}
      </header>
      <div className={`overview-layout${liteMode ? ' is-lite' : ''}`}>
        {!liteMode && visible && (
          <DashboardGlobe running={running} />
        )}
        <div className="overview-panel-column">
          {liteMode && announcePill}
          <aside className="overview-panel" aria-label={t('connectionControls')}>
            <div className="overview-power-section" data-power-state={powerState}>
              <p className="overview-power-status text-sm font-medium" role="status">
                {statusLabel}
              </p>
              <button
                data-tour="connect"
                className={`overview-power ${running ? 'is-running' : ''}`}
                onClick={onToggleKernel}
                disabled={switching}
                aria-label={running ? t('stopCore') : t('startCore')}
                aria-pressed={running}
                aria-busy={switching}
              >
                {switching ? <LoaderCircle className="size-12 animate-spin" aria-hidden="true" /> : <Power className="size-12" strokeWidth={1.8} aria-hidden="true" />}
              </button>
              <div className={`overview-duration-slot${running ? '' : ' invisible'}`} aria-hidden={!running}>
                <SessionDuration startedAt={sessionStartedAt} running={running} ariaLabel={t('sessionDuration')} />
              </div>
            </div>

            {isTrafficUnprotected && (
              <div className="overview-panel-section overview-capture-notice rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs flex flex-col gap-2" role="status">
                <span>{t('localProxyIsAvailableEnableACaptureModeBelow')}</span>
                <div className="overview-capture-actions">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs border-amber-500/30 text-amber-500 hover:bg-amber-500/20"
                    onClick={onToggleSysProxy}
                  >
                    {t('systemProxy')}
                  </Button>
                  {onNavigate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-amber-500 hover:bg-amber-500/10"
                      onClick={() => onNavigate('settings')}
                    >
                      {t('connectionSettings')}
                    </Button>
                  )}
                </div>
              </div>
            )}

            <DashboardTrafficMetrics onlyVpnTraffic={settings.general.onlyVpnTraffic !== false} />
            <DashboardQuota activeProfile={activeProfile} />

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
          {!liteMode && (
            <DashboardMapNotes running={running} />
          )}
        </div>
      </div>
    </section>
    </DashboardRoutesProvider>
  )
}
