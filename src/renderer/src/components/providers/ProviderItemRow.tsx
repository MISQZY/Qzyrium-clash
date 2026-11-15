import { RefreshCw } from 'lucide-react'
import type { ProviderSummary } from '@shared/mihomo'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { useLocale, useTranslations } from '../../i18n'

export interface ProviderItemRowProps {
  provider: ProviderSummary
  loading: boolean
  updating: string | null
  onRefresh: (name: string) => void | Promise<void>
}

export function ProviderItemRow({
  provider,
  loading,
  updating,
  onRefresh
}: ProviderItemRowProps) {
  const t = useTranslations('common')
  const locale = useLocale()

  const timestamp = provider.updatedAt ? Date.parse(provider.updatedAt) : NaN
  const hasUpdated = Number.isFinite(timestamp) && timestamp > 0
  const isHttp = provider.vehicleType.toLowerCase() === 'http'

  const formatVehicleType = (type: string) => {
    const normalized = type.toLowerCase()
    if (normalized === 'http') return t('providerVehicleHttp')
    if (normalized === 'file') return t('providerVehicleFile')
    if (normalized === 'compatible') return t('providerVehicleCompatible')
    if (normalized === 'inline') return t('providerVehicleInline')
    return type
  }

  return (
    <div
      key={provider.name}
      className="flex items-center justify-between gap-3 p-3.5 rounded-lg border border-border/80 bg-card/60 hover:bg-muted/40 transition-colors"
    >
      <div className="min-w-0 space-y-1.5 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="break-all font-medium text-xs text-foreground">
            {provider.name}
          </span>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
            {formatVehicleType(provider.vehicleType)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/80">
            {t('providerItems', { count: provider.itemCount })}
          </span>
          {hasUpdated ? (
            <span>
              {t('providerUpdated', {
                date: new Date(timestamp).toLocaleString(locale)
              })}
            </span>
          ) : isHttp ? (
            <span>{t('providerNeverUpdated')}</span>
          ) : null}
        </div>
      </div>

      {isHttp && (
        <Button
          size="sm"
          variant="outline"
          aria-label={t('providerUpdateNamed', { name: provider.name })}
          disabled={loading || updating !== null}
          onClick={() => void onRefresh(provider.name)}
          className="shrink-0 h-8 px-2.5 text-xs gap-1.5"
        >
          <RefreshCw
            className={cn('size-3', updating === provider.name && 'animate-spin')}
          />
          <span>{t('providerUpdate')}</span>
        </Button>
      )}
    </div>
  )
}
