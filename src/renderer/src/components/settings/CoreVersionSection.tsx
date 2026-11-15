import { useEffect, useState } from 'react'
import { RefreshCw, Download, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { CoreChannel, CoreUpdateStatus, CoreVersionInfo } from '@shared/core-version'
import { useTranslations } from '../../i18n'
import { Button } from '../ui/button'
import { NativeSelect } from '../ui/native-select'

interface CoreVersionSectionProps {
  channel: CoreChannel
  onChannelChange: (channel: CoreChannel) => void
}

export function CoreVersionSection({ channel, onChannelChange }: CoreVersionSectionProps) {
  const t = useTranslations('networksettings')
  const [info, setInfo] = useState<CoreVersionInfo | null>(null)
  const [updateStatus, setUpdateStatus] = useState<CoreUpdateStatus>({ state: 'idle' })
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reloadInfo = async () => {
    try {
      if (window.api?.kernel?.getCoreInfo) {
        const data = await window.api.kernel.getCoreInfo()
        setInfo(data)
      }
    } catch (err) {
      console.error('Failed to load core info', err)
    }
  }

  useEffect(() => {
    void reloadInfo()

    const unsubscribe = window.api?.events?.onCoreUpdateStatus?.((status) => {
      setUpdateStatus(status)
      if (status.state === 'installed' || status.state === 'error') {
        void reloadInfo()
      }
    })

    return () => {
      unsubscribe?.()
    }
  }, [])

  const handleCheckUpdates = async () => {
    if (busy) return
    setBusy(true)
    setActionError(null)
    try {
      if (window.api?.kernel?.checkCoreUpdate) {
        const result = await window.api.kernel.checkCoreUpdate(channel)
        setUpdateStatus(result)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setActionError(message)
    } finally {
      setBusy(false)
    }
  }

  const handleInstallOrSwitch = async (targetChannel: CoreChannel, install = false) => {
    if (busy) return
    setBusy(true)
    setActionError(null)
    try {
      if (window.api?.kernel?.switchChannel) {
        const operation = install ? window.api.kernel.installCoreUpdate : window.api.kernel.switchChannel
        if (!operation) throw new Error('Core installation is unavailable')
        const newInfo = await operation(targetChannel)
        setInfo(newInfo)
        onChannelChange(targetChannel)
        setUpdateStatus({ state: 'installed', version: newInfo.installedVersion, build: newInfo.installedBuild })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setActionError(message)
    } finally {
      setBusy(false)
      void reloadInfo()
    }
  }

  const isAlpha = channel === 'alpha'
  const isTargetAlphaInstalled = info?.alphaInstalled ?? false

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span>{t('coreChannelTitle')}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                isAlpha
                  ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                  : 'bg-primary/15 text-primary border border-primary/30'
              }`}
            >
              {isAlpha ? t('channelAlpha') : t('channelStable')}
            </span>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('coreChannelExplanation')}</p>
        </div>

        <NativeSelect
          aria-label={t('coreChannelTitle')}
          value={channel}
          disabled={busy || updateStatus.state === 'downloading' || updateStatus.state === 'testing'}
          onChange={(event) => {
            const nextChannel = event.target.value as CoreChannel
            if (nextChannel !== channel) {
              void handleInstallOrSwitch(nextChannel)
            }
          }}
          className="w-36 text-xs"
        >
          <option value="stable">{t('channelStable')}</option>
          <option value="alpha">{t('channelAlpha')}</option>
        </NativeSelect>
      </div>

      {/* Installed Version Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md bg-background/50 p-3 text-xs border border-border/40">
        <div>
          <span className="text-muted-foreground">{t('installedCoreVersion')}: </span>
          <span className="font-mono font-medium text-foreground">{info?.installedVersion || '—'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">{t('installedCoreBuild')}: </span>
          <span className="font-mono text-foreground">{info?.installedBuild || t('bundledBuild')}</span>
        </div>
        {info?.isBundled && (
          <div className="col-span-full text-[11px] text-muted-foreground italic">
            {t('usingBundledSidecarCore')}
          </div>
        )}
      </div>

      {/* Action / Progress Area */}
      {updateStatus.state === 'downloading' && (
        <div className="flex flex-col gap-1.5 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs">
          <div className="flex items-center justify-between font-medium text-primary">
            <span>{t('downloadingCoreBinary')}</span>
            <span>{updateStatus.percent ?? 0}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${updateStatus.percent ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {updateStatus.state === 'testing' && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
          <RefreshCw className="size-4 shrink-0 animate-spin" />
          <span>{t('validatingConfigAndTestingCore')}</span>
        </div>
      )}

      {updateStatus.state === 'available' && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/10 p-3 text-xs">
          <div className="flex flex-col">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Download className="size-3.5 text-primary" />
              {t('coreUpdateAvailable')}
            </span>
            <span className="text-muted-foreground font-mono mt-0.5">
              {updateStatus.version} {updateStatus.build ? `(${updateStatus.build})` : ''}
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void handleInstallOrSwitch(channel, true)}
            className="gap-1.5 text-xs h-7.5"
          >
            <Download className="size-3.5" />
            <span>{t('downloadAndInstallCore')}</span>
          </Button>
        </div>
      )}

      {updateStatus.state === 'up-to-date' && (
        <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 p-2.5 text-xs text-success">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{t('coreIsUpToDate')} ({updateStatus.version})</span>
        </div>
      )}

      {(actionError || (updateStatus.state === 'error' && updateStatus.message)) && (
        <div className="flex flex-col gap-1 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 shrink-0" />
            <span>{updateStatus.state === 'error' && updateStatus.rolledBack ? t('coreUpdateFailedRolledBack') : t('coreOperationFailed')}</span>
          </div>
          <p className="font-mono text-[11px] break-words whitespace-pre-wrap mt-0.5">
            {actionError || (updateStatus.state === 'error' ? updateStatus.message : '')}
          </p>
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || updateStatus.state === 'downloading' || updateStatus.state === 'testing'}
          onClick={handleCheckUpdates}
          className="gap-1.5 text-xs cursor-pointer"
        >
          <RefreshCw className={`size-3.5 text-muted-foreground ${busy || updateStatus.state === 'checking' ? 'animate-spin' : ''}`} />
          <span>{busy || updateStatus.state === 'checking' ? t('checkingForCoreUpdates') : t('checkForCoreUpdates')}</span>
        </Button>

        {isAlpha && !isTargetAlphaInstalled && (
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={busy || updateStatus.state === 'downloading' || updateStatus.state === 'testing'}
            onClick={() => void handleInstallOrSwitch('alpha')}
            className="gap-1.5 text-xs cursor-pointer"
          >
            <Download className="size-3.5" />
            <span>{t('installAlphaCore')}</span>
          </Button>
        )}
      </div>
    </div>
  )
}
