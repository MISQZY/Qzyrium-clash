import { Download, LoaderCircle, RefreshCw } from 'lucide-react'
import { Tooltip } from 'radix-ui'
import { useUpdaterStatus } from '../providers/UpdaterProvider'
import { useTranslations } from '../i18n'

export function UpdateIndicator() {
  const status = useUpdaterStatus()
  const t = useTranslations('app')
  if (!['available', 'downloading', 'downloaded', 'error'].includes(status.state)) return null
  const downloading = status.state === 'downloading'
  const busy = downloading || status.state === 'downloaded'
  const label = status.state === 'available' ? t('updateInstall', { version: status.version })
    : status.state === 'downloading' ? t('updateDownloading', { percent: status.percent })
      : status.state === 'downloaded' ? t('updateInstalling') : t('updateRetry')
  const Icon = busy ? LoaderCircle : status.state === 'error' ? RefreshCw : Download
  return <Tooltip.Root><Tooltip.Trigger asChild>
    <button type="button" className="sidebar-update" aria-label={label} disabled={busy} data-state={status.state} onClick={() => {
      if (status.state === 'available') void window.api.app.downloadUpdate().catch(() => {})
      else if (status.state === 'error') void window.api.app.checkUpdates().catch(() => {})
    }}>
      <Icon className={`size-4 shrink-0 ${busy ? 'animate-spin' : ''}`} />
      <span className="sidebar-label sidebar-update-label">{label}</span>
      {downloading && <span className="sidebar-update-percent">{status.percent}%</span>}
    </button>
  </Tooltip.Trigger><Tooltip.Portal><Tooltip.Content side="top" sideOffset={8} className="sidebar-tooltip">{label}<Tooltip.Arrow className="fill-popover" /></Tooltip.Content></Tooltip.Portal></Tooltip.Root>
}
