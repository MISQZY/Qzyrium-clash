import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { ProviderKind, ProviderSummary } from '@shared/mihomo'
import { useTranslations, useLocale } from '../i18n'
import { Button } from './ui/button'

export function ProvidersPanel({ kind, running, onUpdated }: {
  kind: ProviderKind; running: boolean; onUpdated?: () => void | Promise<unknown>
}) {
  const t = useTranslations('common')
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [providers, setProviders] = useState<ProviderSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const revision = useRef(0)
  const load = useCallback(async (current: number) => {
    const items = await window.api.mihomo.getProviders(kind)
    if (revision.current === current) setProviders(items)
  }, [kind])

  useEffect(() => {
    const current = ++revision.current
    setProviders([]); setError(null); setUpdating(null); setLoading(false)
    if (open && running) {
      setLoading(true)
      void load(current).catch(() => {
        if (revision.current === current) setError(t('providerLoadFailed'))
      }).finally(() => { if (revision.current === current) setLoading(false) })
    }
    return () => { revision.current = current + 1 }
  }, [load, open, running, t])

  const refresh = async (name?: string) => {
    if (loading || updating !== null || !running) return
    const current = revision.current
    setError(null)
    if (name !== undefined) setUpdating(name)
    else setLoading(true)
    try {
      if (name !== undefined) {
        await window.api.mihomo.updateProvider(kind, name)
        if (revision.current !== current) return
        await onUpdated?.()
      }
      if (revision.current === current) await load(current)
    } catch {
      if (revision.current === current) setError(t(name !== undefined ? 'providerUpdateFailed' : 'providerLoadFailed'))
    } finally {
      if (revision.current === current) { setLoading(false); setUpdating(null) }
    }
  }

  return <details className="rounded-lg border border-border bg-card p-3" open={open}
    onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-sm font-medium">{t(kind === 'proxies' ? 'proxyProviders' : 'ruleProviders')}</summary>
    {open && <div className="mt-3 space-y-3" aria-busy={loading || updating !== null}>
      {!running ? <p className="text-xs text-muted-foreground">{t('providersRequireCore')}</p> : <>
        <Button size="sm" variant="outline" disabled={loading || updating !== null} onClick={() => void refresh()}>
          <RefreshCw className={loading ? 'size-3 animate-spin' : 'size-3'} />{t('providerRefresh')}
        </Button>
        {!loading && !error && providers.length === 0 && <p className="text-xs text-muted-foreground">{t('noProviders')}</p>}
        {providers.map(provider => {
          const timestamp = provider.updatedAt ? Date.parse(provider.updatedAt) : NaN
          const updated = Number.isFinite(timestamp) && timestamp > 0
            ? new Date(timestamp).toLocaleString(locale) : t('providerNeverUpdated')
          return <div key={provider.name} className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <div className="min-w-0 text-xs">
              <p className="break-all font-medium">{provider.name}</p>
              <p className="mt-1 text-muted-foreground">{provider.vehicleType} · {t('providerItems', { count: provider.itemCount })}</p>
              <p className="mt-1 text-muted-foreground">{t('providerUpdated', { date: updated })}</p>
            </div>
            {provider.vehicleType.toLowerCase() === 'http' && <Button size="sm" variant="outline"
              aria-label={t('providerUpdateNamed', { name: provider.name })}
              disabled={loading || updating !== null} onClick={() => void refresh(provider.name)}>
              <RefreshCw className={updating === provider.name ? 'size-3 animate-spin' : 'size-3'} />{t('providerUpdate')}
            </Button>}
          </div>
        })}
      </>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>}
  </details>
}
