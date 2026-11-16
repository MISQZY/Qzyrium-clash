import { Globe, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { DEFAULT_SERVICE_CHECK_TARGETS, MAX_SERVICE_CHECK_TARGETS, editableServiceCheckTargets, validateServiceCheckTargets, type ServiceCheckTarget } from '@shared/service-check'
import { useTranslations } from '../../i18n'
import type { SettingsDraft } from '../../hooks/useSettingsDraft'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { NativeSelect } from '../ui/native-select'
import { SettingsGroup } from './SettingsGroup'

export function ServiceCheckSettings({ draft, busy }: { draft: SettingsDraft; busy: boolean }) {
  const t = useTranslations('networksettings')
  const targets = editableServiceCheckTargets(draft.form.general.serviceCheckTargets ?? DEFAULT_SERVICE_CHECK_TARGETS)
  const update = (targets: ServiceCheckTarget[]) => draft.updateGeneral({ serviceCheckTargets: targets })
  const edit = (id: string, patch: Partial<ServiceCheckTarget>) => update(targets.map(target => target.id === id ? { ...target, ...patch } : target))
  let invalid = false
  try { validateServiceCheckTargets(targets) } catch { invalid = true }

  return <SettingsGroup title={t('serviceChecksGroup')} description={t('serviceChecksDescription')} icon={<Globe />} collapsible>
    <fieldset disabled={busy} className="flex min-w-0 flex-col gap-2">
      {targets.length > 0 && <div data-service-settings-list className="max-h-80 overflow-y-auto rounded-lg border border-border/70 divide-y divide-border/60">
      {targets.map((target, index) => <div key={target.id} data-service-settings-row className="flex flex-col gap-1.5 p-2">
        <div className="grid grid-cols-[minmax(0,1fr)_144px_28px] items-center gap-1.5">
          <Input required maxLength={80} value={target.name} aria-label={t('serviceNameAt', { index: index + 1 })}
            title={t('serviceName')} placeholder={t('serviceName')} className="h-7 text-xs"
            onChange={event => edit(target.id, { name: event.target.value })} />
          <NativeSelect className="h-7 w-full whitespace-nowrap px-2 text-[11px]" aria-label={t('serviceCheckTypeAt', { index: index + 1 })}
            title={t('serviceCheckType')} value={target.kind === 'content' ? target.content?.source : 'http'}
            onChange={event => {
              const value = event.target.value
              if (value === 'http') edit(target.id, { kind: 'http', preset: undefined, content: undefined })
              else edit(target.id, { kind: 'content', preset: undefined, content: { source: value as 'text' | 'json', path: value === 'json' ? 'status' : undefined, available: 'ok', blocked: '' } })
            }}>
            <option value="http">{t('serviceCheckHttp')}</option>
            <option value="text">{t('serviceCheckText')}</option>
            <option value="json">{t('serviceCheckJson')}</option>
          </NativeSelect>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('removeService', { name: target.name || index + 1 })}
            onClick={() => update(targets.filter(item => item.id !== target.id))}><Trash2 className="size-4" /></Button>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-1.5">
            <Input required type="url" maxLength={2048} pattern="https://.*" value={target.url}
              aria-label={t('serviceUrlAt', { index: index + 1 })} placeholder={t('serviceUrlExample')}
              title={t('serviceUrl')} className="h-7 text-xs" onChange={event => edit(target.id, { url: event.target.value })} />
            <Input required maxLength={223} value={target.expected} aria-label={t('serviceExpectedAt', { index: index + 1 })}
              title={t('serviceExpected')} className="h-7 font-mono text-xs" placeholder={t('serviceCodesExample')} onChange={event => edit(target.id, { expected: event.target.value })} />
        </div>
        {target.kind === 'content' && target.content && <div className="grid gap-1.5 sm:grid-cols-2">
          {target.content.source === 'json' && <label className="text-xs sm:col-span-2">{t('serviceJsonPath')}
            <Input required maxLength={256} className="mt-1 h-7 font-mono text-xs" value={target.content.path ?? ''}
              aria-label={t('serviceJsonPathAt', { index: index + 1 })}
              onChange={event => edit(target.id, { content: { ...target.content!, path: event.target.value } })} />
          </label>}
          <label className="text-xs">{t('serviceAvailableMatch')}
            <Input required maxLength={512} className="mt-1 h-7 text-xs" value={target.content.available}
              aria-label={t('serviceAvailableMatchAt', { index: index + 1 })}
              onChange={event => edit(target.id, { content: { ...target.content!, available: event.target.value } })} />
          </label>
          <label className="text-xs">{t('serviceBlockedMatch')}
            <Input maxLength={512} className="mt-1 h-7 text-xs" value={target.content.blocked ?? ''}
              aria-label={t('serviceBlockedMatchAt', { index: index + 1 })}
              onChange={event => edit(target.id, { content: { ...target.content!, blocked: event.target.value } })} />
          </label>
        </div>}
      </div>)}
      </div>}
      {targets.length === 0 && <p className="text-xs text-muted-foreground">{t('serviceChecksEmpty')}</p>}
      <p className="text-xs leading-relaxed text-muted-foreground">{t('serviceExpectedHint')}</p>
      {invalid && <p role="alert" className="text-xs text-destructive">{t('serviceChecksInvalid')}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={targets.length >= MAX_SERVICE_CHECK_TARGETS}
          onClick={() => update([...targets, { id: crypto.randomUUID(), name: '', url: '', expected: '200-299' }])}>
          <Plus className="size-3.5" />{t('addService')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => update(DEFAULT_SERVICE_CHECK_TARGETS.map(target => ({ ...target })))}>
          <RotateCcw className="size-3.5" />{t('resetServices')}
        </Button>
      </div>
    </fieldset>
  </SettingsGroup>
}
