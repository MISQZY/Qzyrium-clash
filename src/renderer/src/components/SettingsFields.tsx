import { NativeSelect } from './ui/native-select'
import { useEffect, useRef, useState } from 'react'
import yaml from 'yaml'
import { HelpCircle, RotateCcw } from 'lucide-react'
import type { ConfigValues, SettingsField } from '@shared/settings-fields'
import { useTranslations } from '../i18n'
import { settingsFieldKey } from '../i18n/catalogs'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Switch } from './ui/switch'
import { Button } from './ui/button'

function MappingInput({ id, label, value, onChange, placeholder }: { id: string; label: string; value: unknown; onChange: (value: unknown) => void; placeholder?: string }) {
  const [text, setText] = useState(() => value ? yaml.stringify(value) : '')
  const [error, setError] = useState('')
  const lastValue = useRef(JSON.stringify(value))
  const input = useRef<HTMLTextAreaElement>(null)
  const t = useTranslations('networksettings')
  useEffect(() => {
    const encoded = JSON.stringify(value)
    if (encoded !== lastValue.current) { setText(value ? yaml.stringify(value) : ''); setError(''); input.current?.setCustomValidity(''); lastValue.current = encoded }
  }, [value])
  return <><Textarea ref={input} id={id} aria-label={label} aria-invalid={!!error} placeholder={placeholder} className="font-mono text-xs" rows={5} value={text} onChange={(event) => {
    const next = event.target.value
    setText(next)
    try {
      const parsed: unknown = next.trim() ? yaml.parse(next, { maxAliasCount: 100 }) : undefined
      if (parsed !== undefined && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) throw new Error(t('invalidMapping'))
      event.currentTarget.setCustomValidity('')
      setError('')
      lastValue.current = JSON.stringify(parsed)
      onChange(parsed)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('invalidMapping')
      event.currentTarget.setCustomValidity(message)
      setError(message)
    }
  }} />{error && <span role="alert" className="text-xs text-destructive">{error}</span>}</>
}

export function SettingsFields({ fields, value, onChange, prefix, inherit = true }: { fields: readonly SettingsField[]; value: ConfigValues; onChange: (value: ConfigValues) => void; prefix: string; inherit?: boolean }) {
  const fieldT = useTranslations('settingsfields')
  const t = useTranslations('networksettings')
  const optionLabels: Record<string, string> = {
    always: t('optionAlways'), strict: t('optionStrict'), off: t('optionOff'),
    random: t('optionRandom'), randomized: t('optionRandomized'),
    blacklist: t('optionBlacklist'), whitelist: t('optionWhitelist'), rule: t('optionRule'),
    standard: t('optionStandard'), memconservative: t('optionMemoryConservative')
  }
  const update = (key: string, next: unknown) => {
    const values = { ...value }
    if (next === undefined && inherit) delete values[key]
    else values[key] = next
    onChange(values)
  }
  return <div className={`settings-fields flex flex-col ${!inherit && fields.every(field => field.type === 'boolean') ? 'gap-0' : 'gap-4'}`}>{fields.map((field) => {
    const id = `${prefix}-${field.key}`
    const label = fieldT(`${settingsFieldKey(field)}.label`)
    const current = value[field.key]

    if (field.type === 'boolean' && !inherit) {
      return (
        <div key={field.key} className="setting-row">
          <div className="min-w-0">
            <label htmlFor={id} className="text-sm font-medium cursor-pointer">{label}</label>
            {field.description && (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {fieldT(`${settingsFieldKey(field)}.description`)}
              </p>
            )}
          </div>
          <div className="shrink-0">
            <Switch
              id={id}
              aria-label={label}
              checked={!!current}
              onCheckedChange={(next) => update(field.key, next)}
            />
          </div>
        </div>
      )
    }

    return <div key={field.key} className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <label htmlFor={id} className="text-xs font-medium">{label}</label>
          {field.description && (
            <span
              className="text-muted-foreground/60 hover:text-foreground cursor-help transition-colors"
              title={fieldT(`${settingsFieldKey(field)}.description`)}
              aria-label={fieldT(`${settingsFieldKey(field)}.description`)}
            >
              <HelpCircle className="size-3.5" />
            </span>
          )}
        </div>
        {inherit && current !== undefined && <Button type="button" size="icon-sm" variant="ghost" aria-label={t('resetField', { name: label })} onClick={() => update(field.key, undefined)}><RotateCcw className="size-3" /></Button>}
      </div>
      {field.type === 'boolean' && <NativeSelect className="w-full" id={id} aria-label={label} value={current === undefined ? '' : String(current)} onChange={(event) => update(field.key, event.target.value === '' ? undefined : event.target.value === 'true')}><option value="">{t('inheritProfile')}</option><option value="true">{t('enabledValue')}</option><option value="false">{t('disabledValue')}</option></NativeSelect>}
      {field.type === 'select' && <NativeSelect className="w-full" id={id} aria-label={label} value={current === undefined ? '' : String(current)} onChange={(event) => update(field.key, event.target.value || undefined)}><option value="">{t('inheritProfile')}</option>{field.options?.map((option) => <option key={option} value={option}>{optionLabels[option] ?? option}</option>)}</NativeSelect>}
      {(field.type === 'text' || field.type === 'number') && <Input id={id} aria-label={label} type={field.type === 'number' ? 'number' : 'text'} min={field.min} max={field.max} step={field.type === 'number' ? 1 : undefined} value={typeof current === 'number' || typeof current === 'string' ? current : ''} placeholder={inherit ? t('inheritProfile') : undefined} onChange={(event) => update(field.key, event.target.value === '' ? undefined : field.type === 'number' ? Number(event.target.value) : event.target.value)} />}
      {field.type === 'list' && <Textarea id={id} aria-label={label} rows={3} className="font-mono text-xs" placeholder={t('onePerLine')} value={Array.isArray(current) ? current.join('\n') : ''} onChange={(event) => update(field.key, event.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))} />}
      {field.type === 'map' && <MappingInput id={id} label={label} value={current} placeholder={field.placeholder} onChange={(next) => update(field.key, next)} />}
    </div>
  })}</div>
}
