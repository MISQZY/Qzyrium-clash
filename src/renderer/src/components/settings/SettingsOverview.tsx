import { useTranslations } from '../../i18n'
import { useTour } from '../../providers/TourProvider'
import { TourMascot } from '../TourMascot'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Folder, ChevronRight, RefreshCw, Sparkles } from 'lucide-react'
import { Tooltip } from 'radix-ui'
import druseSvg from '../../assets/brand/druse.svg'
import { CoreIcon } from '../../lib/icons'
import type { CoreVersionInfo } from '@shared/core-version'
import type { NavTab } from '../../lib/navigation'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { ToastNotification } from '../ToastNotification'
import type { SettingsDraft } from '../../hooks/useSettingsDraft'
import { BackupSettings } from './BackupSettings'
import { DiagnosticSettings } from './DiagnosticSettings'

export { SettingsNetworkLinks } from './SettingsNetworkLinks'

export function SettingsOverview({ draft, disabled = false, onNavigate }: {
  draft: SettingsDraft; disabled?: boolean; onNavigate?: (tab: NavTab) => void
}) {
  const t = useTranslations('networksettings')
  const tourT = useTranslations('app')
  const { start: startTour } = useTour()
  const { setMessage } = draft
  const [coreVersion, setCoreVersion] = useState<string>('')
  const [coreInfo, setCoreInfo] = useState<CoreVersionInfo | null>(null)
  const [appVersion, setAppVersion] = useState<string>('')
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<{ type: 'latest' | 'available' | 'downloading' | 'downloaded'; version?: string } | null>(null)
  const [toast, setToast] = useState<{ variant: 'warning' | 'destructive' | 'info'; message: string } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (toastData: { variant: 'warning' | 'destructive' | 'info'; message: string }) => {
    setToast(toastData)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 6000)
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const handleCheckUpdates = async () => {
    if (checkingUpdates) return
    setCheckingUpdates(true)
    setUpdateStatus(null)
    setToast(null)
    try {
      if (window.api?.app?.checkUpdates) {
        const result = await window.api.app.checkUpdates()
        if (result.state === 'available') {
          setUpdateStatus({
            type: 'available',
            version: result.version
          })
        } else if (result.state === 'unsupported') {
          showToast({ variant: 'warning', message: t('updateUnsupported') })
        } else if (result.state === 'error') {
          showToast({ variant: 'destructive', message: t('updateCheckFailed') })
        } else if (result.state === 'downloading' || result.state === 'downloaded') {
          setUpdateStatus({ type: result.state })
        } else if (result.state === 'not-available') {
          setUpdateStatus({
            type: 'latest'
          })
        }
      } else {
        showToast({ variant: 'warning', message: t('updateUnsupported') })
      }
    } catch {
      showToast({ variant: 'destructive', message: t('updateCheckFailed') })
    } finally {
      setCheckingUpdates(false)
    }
  }

  useEffect(() => {
    let active = true
    void window.api?.kernel?.getVersion?.().then(value => { if (active && value?.version) setCoreVersion(value.version) }).catch(() => {})
    void window.api?.kernel?.getCoreInfo?.().then(value => { if (active && value) setCoreInfo(value) }).catch(() => {})
    void window.api?.app?.getVersion?.().then(value => { if (active && value) setAppVersion(value) }).catch(() => {})
    return () => { active = false }
  }, [])

  return (
    <Tooltip.Provider delayDuration={200}>
      <Card data-tour="restart-tour">
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div className="tour-settings-mascot"><TourMascot pose="smirk" /></div>
          <div className="min-w-40 flex-1">
            <h2 className="text-sm font-semibold">{tourT('tourSettingsTitle')}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{tourT('tourSettingsDescription')}</p>
          </div>
          <Button size="sm" variant="outline" onClick={startTour} data-tour-restart className="h-auto min-h-8 py-1.5 px-3 text-center leading-snug whitespace-normal">{tourT('tourRestart')}</Button>
        </CardContent>
      </Card>

      {/* Versions Grid */}
      <div className="settings-versions grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Qzyrium App Version Card */}
        <Card>
          <CardContent className="p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3 h-full">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                <img src={druseSvg} alt="Qzyrium" className="size-5 shrink-0 object-contain" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-foreground truncate">{t('appVersionTitle')}</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground font-mono">{appVersion ? `v${appVersion}` : '—'}</span>
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        className="size-6.5 rounded-md border-border/80 bg-muted/40 shadow-2xs hover:bg-muted hover:text-foreground hover:border-primary/50 text-muted-foreground transition-colors cursor-pointer"
                        onClick={() => window.dispatchEvent(new CustomEvent('qzyrium:open-whats-new'))}
                        aria-label={tourT('whatsNewTitle')}
                      >
                        <Sparkles className="size-3.5" />
                      </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content side="top" sideOffset={6} className="sidebar-tooltip">
                        {tourT('whatsNewTitle')}
                        <Tooltip.Arrow className="fill-popover" />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                  {updateStatus && (
                    <span className={`text-[11px] font-medium ${updateStatus.type === 'latest' ? 'text-success' : 'text-primary font-semibold'}`}>
                      • {updateStatus.type === 'available' ? t('updateAvailable', { version: updateStatus.version ?? '' }) : updateStatus.type === 'latest' ? t('latestVersionInstalled') : updateStatus.type === 'downloading' ? t('updateDownloading') : updateStatus.type === 'downloaded' ? t('updateInstalling') : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={checkingUpdates}
              onClick={handleCheckUpdates}
              className="gap-1.5 self-start xl:self-center shrink-0 text-xs cursor-pointer w-full xl:w-56 justify-center h-auto min-h-8 py-1.5 px-3 text-center leading-snug whitespace-normal"
            >
              <RefreshCw className={`size-3.5 shrink-0 text-muted-foreground ${checkingUpdates ? 'animate-spin' : ''}`} />
              <span className="break-words text-center">{checkingUpdates ? t('checkingForUpdates') : t('checkForUpdates')}</span>
            </Button>
          </CardContent>
        </Card>

        {/* Mihomo Core Version Card */}
        <Card>
          <CardContent className="p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3 h-full">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                <CoreIcon className="size-4.5" />
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold text-foreground truncate">{t('mihomoCoreVersion')}</span>
                  {coreInfo && (
                    <span
                      className={`rounded px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider ${
                        coreInfo.channel === 'alpha'
                          ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                          : 'bg-primary/15 text-primary border border-primary/30'
                      }`}
                    >
                      {coreInfo.channel}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground font-mono truncate">
                  {coreInfo?.installedVersion || coreVersion || '—'}
                  {coreInfo?.installedBuild ? ` (${coreInfo.installedBuild})` : ''}
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-nav-target="mihomo"
              onClick={() => onNavigate?.('mihomo')}
              className="gap-1.5 self-start xl:self-center shrink-0 text-xs cursor-pointer w-full xl:w-56 justify-center h-auto min-h-8 py-1.5 px-3 text-center leading-snug whitespace-normal"
            >
              <CoreIcon className="size-3.5 shrink-0" />
              <span className="break-words text-center">{t('coreSettings')}</span>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Maintenance: Application files, Backup, Diagnostics */}
      <Card>
        <CardContent className="p-4 sm:p-5 flex flex-col divide-y divide-border/60">
          {/* Application Files */}
          <div className="pb-4">
            <h2 className="mb-2.5 text-sm font-semibold">{t('applicationFiles')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['data', 'profiles', 'appLogs', 'connectionLogs'] as const).map((target) => (
                <Button
                  key={target}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void window.api?.window.openFolder(target).catch(() => setMessage('couldNotOpenTheFolder'))
                  }}
                  className="w-full justify-center gap-1.5 h-auto min-h-8 py-1.5 px-2 text-center leading-snug whitespace-normal"
                >
                  <Folder className="size-3.5 shrink-0" />
                  <span className="break-words line-clamp-2">{t(`${target}Folder`)}</span>
                </Button>
              ))}
            </div>
          </div>

          <BackupSettings disabled={disabled} />
          <DiagnosticSettings disabled={disabled} />
        </CardContent>
      </Card>

      {toast && createPortal(
        <ToastNotification
          variant={toast.variant}
          message={toast.message}
          onClose={() => setToast(null)}
        />,
        document.body
      )}
    </Tooltip.Provider>
  )
}
