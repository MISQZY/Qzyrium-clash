
import { useTranslations } from '../../i18n'
import { useTour } from '../../providers/TourProvider'
import { TourMascot } from '../TourMascot'
import { useState, useEffect } from 'react'
import { Folder, ChevronRight, RefreshCw } from 'lucide-react'
import druseSvg from '../../assets/brand/druse.svg'
import { SystemProxyIcon, TunIcon, CoreIcon, DnsIcon, SnifferIcon, ResourcesIcon } from '../../lib/icons'
import type { AppConfig } from '@shared/app-config'
import type { SysProxyStatus } from '@shared/ipc'

import type { NavTab } from '../../lib/navigation'

import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'

import { DEFAULT_APP_CONFIG } from '@shared/app-config'

import type { SettingsDraft } from '../../hooks/useSettingsDraft'

export function SettingsOverview({ draft, settings, sysProxy, onNavigate }: {
  draft: SettingsDraft; settings: AppConfig; sysProxy: SysProxyStatus; onNavigate?: (tab: NavTab) => void
}) {
  const t = useTranslations('networksettings')
  const tourT = useTranslations('app')
  const { start: startTour } = useTour()
  const common = useTranslations('common')
  const { form, setMessage } = draft
  const [coreVersion, setCoreVersion] = useState<string>('')
  const [appVersion, setAppVersion] = useState<string>('')
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<{ type: 'latest' | 'available' | 'error' | 'unsupported' | 'downloading' | 'downloaded'; version?: string } | null>(null)
  const handleCheckUpdates = async () => {
    if (checkingUpdates) return
    setCheckingUpdates(true)
    setUpdateStatus(null)
    try {
      if (window.api?.app?.checkUpdates) {
        const result = await window.api.app.checkUpdates()
        if (result.state === 'available') {
          setUpdateStatus({
            type: 'available',
            version: result.version
          })
        } else if (result.state === 'unsupported' || result.state === 'downloading' || result.state === 'downloaded' || result.state === 'error') {
          setUpdateStatus({ type: result.state })
        } else if (result.state === 'not-available') {
          setUpdateStatus({
            type: 'latest'
          })
        }
      } else {
        setUpdateStatus({
          type: 'unsupported'
        })
      }
    } catch {
      setUpdateStatus({
        type: 'error'
      })
    } finally {
      setCheckingUpdates(false)
    }
  }
  useEffect(() => {
    let active = true
    void window.api?.kernel?.getVersion?.().then(value => { if (active && value?.version) setCoreVersion(value.version) }).catch(() => {})
    void window.api?.app?.getVersion?.().then(value => { if (active && value) setAppVersion(value) }).catch(() => {})
    return () => { active = false }
  }, [])

  const links = [
    { target: 'sysproxy', icon: SystemProxyIcon, label: t('systemProxy'), description: `${sysProxy.enabled ? t('enabledValue') : t('disabledValue')} • ${sysProxy.host ?? DEFAULT_APP_CONFIG.sysProxy.host}:${sysProxy.port ?? DEFAULT_APP_CONFIG.kernel.mixedPort}` },
    { target: 'tun', icon: TunIcon, label: t('tUNInterface'), description: `${form.kernel.tun.enable ? t('enabledValue') : t('disabledValue')} • ${form.kernel.tun.stack}` },
    { target: 'dns', icon: DnsIcon, label: common('dns'), description: settings.kernel.dns ? t('overridden') : t('fromSubscription') },
    { target: 'sniffer', icon: SnifferIcon, label: common('sniffer'), description: settings.kernel.sniffer ? t('overridden') : t('fromSubscription') },
    { target: 'resources', icon: ResourcesIcon, label: common('resources'), description: settings.kernel.resources ? t('overridden') : t('fromSubscription') }
  ] as const
  return <>
        <Card data-tour="restart-tour">
          <CardContent className="flex flex-wrap items-center gap-4 p-4">
            <div className="tour-settings-mascot"><TourMascot pose="smirk" /></div>
            <div className="min-w-40 flex-1">
              <h2 className="text-sm font-semibold">{tourT('tourSettingsTitle')}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{tourT('tourSettingsDescription')}</p>
            </div>
            <Button size="sm" variant="outline" onClick={startTour} data-tour-restart>{tourT('tourRestart')}</Button>
          </CardContent>
        </Card>
        {/* Versions Grid */}
        <div className="settings-versions grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Qzyrium App Version Card */}
          <Card>
            <CardContent className="p-5 flex flex-col gap-4 h-full">
              <div className="flex flex-col items-start justify-between gap-4 h-full">
                <div className="flex items-start gap-3 min-w-0 w-full">
                  <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                    <img src={druseSvg} alt="Qzyrium" className="size-5 shrink-0 object-contain" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold text-foreground break-words">{t('appVersionTitle')}</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground font-mono truncate">{appVersion ? `v${appVersion}` : '—'}</span>
                      {updateStatus && (
                        <span className={`text-[11px] font-medium ${updateStatus.type === 'latest' ? 'text-success' : updateStatus.type === 'available' ? 'text-primary font-semibold' : 'text-destructive'}`}>
                          • {updateStatus.type === 'available' ? t('updateAvailable', { version: updateStatus.version ?? '' }) : updateStatus.type === 'latest' ? t('latestVersionInstalled') : updateStatus.type === 'unsupported' ? t('updateUnsupported') : updateStatus.type === 'downloading' ? t('updateDownloading') : updateStatus.type === 'downloaded' ? t('updateInstalling') : t('updateCheckFailed')}
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
                  className="gap-1.5 self-start max-w-full h-auto min-h-7.5 py-1.5 whitespace-normal text-left text-xs cursor-pointer"
                >
                  <RefreshCw className={`size-3.5 shrink-0 text-muted-foreground ${checkingUpdates ? 'animate-spin' : ''}`} />
                  <span>{checkingUpdates ? t('checkingForUpdates') : t('checkForUpdates')}</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Mihomo Core Version Card */}
          <Card>
            <CardContent className="p-5 flex flex-col gap-4 h-full">
              <div className="flex flex-col items-start justify-between gap-4 h-full">
                <div className="flex items-start gap-3 min-w-0 w-full">
                  <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                    <CoreIcon className="size-4.5" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold text-foreground break-words">{t('mihomoCoreVersion')}</span>
                    <span className="text-xs text-muted-foreground font-mono truncate">{coreVersion || '—'}</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-nav-target="mihomo"
                  onClick={() => onNavigate?.('mihomo')}
                  className="gap-1.5 self-start max-w-full h-auto min-h-7.5 py-1.5 whitespace-normal text-left text-xs cursor-pointer"
                >
                  <CoreIcon className="size-3.5 shrink-0" />
                  <span>{t('coreSettings')}</span>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Network Section Card */}
        <Card>
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <SystemProxyIcon className="size-4 text-primary" />
                  {t('networkSection')}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('networkSectionDescription')}
                </p>
              </div>
            </div>

            <div className="divide-y divide-border/50 flex flex-col">
              {links.map(({ target, icon: Icon, label, description }) => <div key={target} className="py-3 flex items-center justify-between gap-3 first:pt-1 last:pb-1">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-8 rounded-md bg-muted/60 text-muted-foreground flex items-center justify-center shrink-0"><Icon className="size-4" /></div>
                  <div className="flex flex-col min-w-0"><span className="text-xs font-medium text-foreground">{label}</span><span className="text-[11px] text-muted-foreground truncate">{description}</span></div>
                </div>
                <Button type="button" variant="outline" size="sm" data-nav-target={target} onClick={() => onNavigate?.(target)} className="gap-1 h-7 text-xs shrink-0">
                  <span>{t('configure')}</span><ChevronRight className="size-3 text-muted-foreground" />
                </Button>
              </div>)}
            </div>
          </CardContent>
        </Card>

        {/* Application Files */}
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-4 text-sm font-semibold">{t('applicationFiles')}</h2>
            <div className="flex flex-wrap gap-2">
              {(['data', 'profiles', 'logs'] as const).map((target) => (
                <Button
                  key={target}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void window.api?.window.openFolder(target).catch(() => setMessage('couldNotOpenTheFolder'))
                  }}
                >
                  <Folder className="size-3.5" />
                  {t(`${target}Folder`)}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </>
}
