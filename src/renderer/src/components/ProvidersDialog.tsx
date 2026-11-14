import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Database, Layers, RefreshCw } from 'lucide-react'
import type { ProviderKind, ProviderSummary } from '@shared/mihomo'
import { useTranslations, useLocale } from '../i18n'
import { Button } from './ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'
import { cn } from '../lib/utils'

export interface ProvidersDialogProps {
  kind: ProviderKind
  running: boolean
  onUpdated?: () => void | Promise<unknown>
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ProvidersDialog({
  kind,
  running,
  onUpdated,
  className,
  open: openProp,
  onOpenChange
}: ProvidersDialogProps) {
  const t = useTranslations('common')
  const locale = useLocale()
  const isProxies = kind === 'proxies'

  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = openProp !== undefined
  const open = isControlled ? openProp : internalOpen

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )

  const [providers, setProviders] = useState<ProviderSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const revision = useRef(0)

  const load = useCallback(
    async (current: number) => {
      const items = await window.api.mihomo.getProviders(kind)
      if (revision.current === current) setProviders(items)
    },
    [kind]
  )

  useEffect(() => {
    const current = ++revision.current
    setProviders([])
    setError(null)
    setUpdating(null)
    setLoading(false)

    if (open && running) {
      setLoading(true)
      void load(current)
        .catch(() => {
          if (revision.current === current) setError(t('providerLoadFailed'))
        })
        .finally(() => {
          if (revision.current === current) setLoading(false)
        })
    }

    return () => {
      revision.current = current + 1
    }
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
      if (revision.current === current) {
        setError(t(name !== undefined ? 'providerUpdateFailed' : 'providerLoadFailed'))
      }
    } finally {
      if (revision.current === current) {
        setLoading(false)
        setUpdating(null)
      }
    }
  }

  const title = t(isProxies ? 'proxyProviders' : 'ruleProviders')
  const description = t(isProxies ? 'proxyProvidersDescription' : 'ruleProvidersDescription')

  const formatVehicleType = (type: string) => {
    const normalized = type.toLowerCase()
    if (normalized === 'http') return t('providerVehicleHttp')
    if (normalized === 'file') return t('providerVehicleFile')
    if (normalized === 'compatible') return t('providerVehicleCompatible')
    if (normalized === 'inline') return t('providerVehicleInline')
    return type
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        data-providers-trigger={kind}
        aria-label={title}
        onClick={() => setOpen(true)}
        className={cn('text-xs gap-1.5', className)}
      >
        {isProxies ? (
          <Database className="size-3.5 text-muted-foreground" />
        ) : (
          <Layers className="size-3.5 text-muted-foreground" />
        )}
        <span>{title}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden rounded-xl border border-border shadow-2xl flex flex-col max-h-[85vh]">
          <DialogHeader className="p-5 pb-4 border-b border-border/60 bg-muted/20 shrink-0">
            <div className="flex items-center gap-3 pr-8 min-w-0">
              <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                {isProxies ? <Database className="size-4.5" /> : <Layers className="size-4.5" />}
              </div>
              <div className="min-w-0 text-left">
                <DialogTitle className="text-base font-semibold truncate">
                  {title}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {description}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {running && (
            <div className="flex items-center justify-between px-5 py-2.5 border-b border-border/40 bg-muted/10 shrink-0">
              <span className="text-xs text-muted-foreground font-medium">
                {providers.length > 0 ? t('providerItems', { count: providers.length }) : ''}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={loading || updating !== null || !running}
                onClick={() => void refresh()}
                className="h-7 text-xs gap-1.5"
              >
                <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
                <span>{t('providerRefresh')}</span>
              </Button>
            </div>
          )}

          <div
            className="flex-1 overflow-y-auto p-5 space-y-3 min-h-[160px]"
            aria-busy={loading || updating !== null}
          >
            {!running ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <div className="size-10 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground">
                  <AlertCircle className="size-5" />
                </div>
                <p className="text-xs text-muted-foreground max-w-xs">
                  {t('providersRequireCore')}
                </p>
              </div>
            ) : (
              <>
                {loading && providers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2 text-xs text-muted-foreground">
                    <RefreshCw className="size-5 animate-spin text-primary" />
                  </div>
                ) : !loading && !error && providers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <div className="size-10 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground">
                      {isProxies ? <Database className="size-5" /> : <Layers className="size-5" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{t('noProviders')}</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {providers.map((provider) => {
                      const timestamp = provider.updatedAt ? Date.parse(provider.updatedAt) : NaN
                      const hasUpdated = Number.isFinite(timestamp) && timestamp > 0
                      const isHttp = provider.vehicleType.toLowerCase() === 'http'

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
                              onClick={() => void refresh(provider.name)}
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
                    })}
                  </div>
                )}

                {error && (
                  <div
                    role="alert"
                    className="p-3 rounded-lg bg-destructive/10 text-destructive text-xs border border-destructive/20 flex items-start gap-2"
                  >
                    <AlertCircle className="size-4 shrink-0 mt-0.5" />
                    <p className="flex-1">{error}</p>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="p-3 px-5 border-t border-border/60 bg-muted/10 shrink-0">
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-dialog-close="true" className="h-8 text-xs">
                {t('close')}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
