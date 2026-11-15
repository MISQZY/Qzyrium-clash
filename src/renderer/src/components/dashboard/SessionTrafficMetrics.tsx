import { ArrowDown, ArrowUp, HelpCircle } from 'lucide-react'
import { Tooltip } from 'radix-ui'
import type { TrafficStats } from '@shared/types'
import type { ConnectionsSnapshot } from '@shared/mihomo'
import { useLocale, useTranslations } from '../../i18n'
import { formatBytes } from '../../lib/format'
import { AutoFitTrafficText } from './AutoFitTrafficText'

export interface SessionTrafficMetricsProps {
  connections: ConnectionsSnapshot
  traffic: TrafficStats
  onlyVpnTraffic?: boolean
}

export function SessionTrafficMetrics({
  connections,
  traffic,
  onlyVpnTraffic = true
}: SessionTrafficMetricsProps) {
  const t = useTranslations('dashboard')
  const locale = useLocale()

  const onlyVpn = onlyVpnTraffic !== false
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
                  <span className="flex items-center justify-center gap-1.5 text-xs leading-4 text-muted-foreground">
                    <Icon className="size-4 text-muted-foreground shrink-0" />
                    {label}
                  </span>
                  <AutoFitTrafficText text={formatBytes(value, locale)} />
                  <p className="mt-1 text-xs leading-4 text-muted-foreground tabular-nums text-center whitespace-nowrap overflow-hidden text-ellipsis w-full">
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
}
