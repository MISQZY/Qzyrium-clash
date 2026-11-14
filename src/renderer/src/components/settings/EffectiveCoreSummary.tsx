import { lazy, Suspense, useEffect, useState } from 'react'
import type { AppConfig } from '@shared/app-config'
import { CORE_PORT_KEYS, type EffectiveCoreValues } from '@shared/effective-core'
import { useTranslations } from '../../i18n'
import { useProfiles } from '../../stores/useAppStore'
import { Button } from '../ui/button'

const ConfigPreviewDialog = lazy(() => import('./ConfigPreviewDialog'))

export function EffectiveCoreSummary({ kernel }: { kernel: AppConfig['kernel'] }) {
  const t = useTranslations('networksettings')
  const { activeProfile } = useProfiles()
  const [values, setValues] = useState<EffectiveCoreValues | null>(null)
  const [error, setError] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  useEffect(() => {
    let active = true
    setValues(null); setError(false)
    const timer = setTimeout(() => {
      void Promise.resolve().then(() => window.api.mihomo.getEffectiveCore({ kernel })).then(result => {
        if (active) setValues(result)
      }).catch(() => { if (active) setError(true) })
    }, 150)
    return () => { active = false; clearTimeout(timer) }
  }, [kernel, activeProfile?.id, activeProfile?.updatedAt])
  const source = (value: 'profile' | 'override' | 'default') => t(value === 'profile' ? 'valueFromProfile' : value === 'override' ? 'valueOverride' : 'valueFallback')
  return <><section className="mt-4 rounded-lg border border-border p-3" aria-label={t('effectiveCoreTitle')}>
    <p className="text-sm font-medium">{t('effectiveCoreTitle')}</p>
    <p className="mt-1 text-xs text-muted-foreground">{t('effectiveCoreHint')}</p>
    {error ? <p role="alert" className="mt-2 text-xs text-destructive">{t('effectiveCoreFailed')}</p> : values ?
      <dl className="mt-3 space-y-2 text-xs">
        {CORE_PORT_KEYS.map(key => <div key={key} className="flex flex-wrap justify-between gap-2" data-effective-setting={key}>
          <dt>{key}</dt><dd>{values.ports[key].value} · {source(values.ports[key].source)}</dd>
        </div>)}
        <div className="flex flex-wrap justify-between gap-2" data-effective-setting="log-level"><dt>{t('logLevel')}</dt>
          <dd>{values.logLevel.value} · {source(values.logLevel.source)}</dd></div>
      </dl> : <p role="status" className="mt-2 text-xs text-muted-foreground">{t('effectiveCoreLoading')}</p>}
    <Button type="button" size="sm" variant="outline" className="mt-3" disabled={!values} onClick={() => setPreviewOpen(true)}>{t('configPreviewTitle')}</Button>
  </section>
    {previewOpen && <Suspense fallback={<p role="status">{t('effectiveCoreLoading')}</p>}>
      <ConfigPreviewDialog kernel={kernel} onClose={() => setPreviewOpen(false)} />
    </Suspense>}
  </>
}
