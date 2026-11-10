import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { SHORTCUT_ACTIONS, shortcutIdentity, type ShortcutAction } from '@shared/shortcuts'
import { useTranslations } from '../i18n'
import { shortcutFromKey } from '../lib/shortcut-recorder'
import { Button } from './ui/button'

const LABELS = {
  showWindow: 'shortcutShowWindow', sysProxy: 'shortcutSysProxy', tun: 'shortcutTun',
  ruleMode: 'shortcutRuleMode', globalMode: 'shortcutGlobalMode', directMode: 'shortcutDirectMode'
} as const

export function ShortcutSettings({ value, onChange, disabled }: {
  value: Record<string, string>
  onChange: (value: Record<string, string>) => void
  disabled: boolean
}) {
  const t = useTranslations('networksettings')
  const [recording, setRecording] = useState<ShortcutAction | null>(null)
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')
  const latest = useRef({ value, onChange, t })
  latest.current = { value, onChange, t }

  useEffect(() => { if (disabled) setRecording(null) }, [disabled])
  useEffect(() => {
    if (!recording) return
    let cancelled = false
    let armed = false
    let pending: { code: string; accelerator: string } | undefined
    const cancel = () => setRecording(null)
    const onVisibility = () => { if (document.hidden) cancel() }
    const capture = (event: KeyboardEvent) => {
      if (event.key === 'Tab') { cancel(); return }
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.key === 'Escape') { setError(''); cancel(); return }
      if (!armed || event.repeat) return
      const accelerator = shortcutFromKey(event)
      if (!accelerator) return
      const { value, t } = latest.current
      const duplicate = SHORTCUT_ACTIONS.find(action => action !== recording && value[action] && shortcutIdentity(value[action]) === shortcutIdentity(accelerator))
      if (duplicate) {
        pending = undefined
        setPreview('')
        setError(t('shortcutConflict', { action: t(LABELS[duplicate]) }))
        return
      }
      setError('')
      setPreview(accelerator)
      pending = { code: event.code, accelerator }
    }
    const release = (event: KeyboardEvent) => {
      event.stopImmediatePropagation()
      if (!pending || event.code !== pending.code) return
      latest.current.onChange({ ...latest.current.value, [recording]: pending.accelerator })
      cancel()
    }
    window.addEventListener('keydown', capture, true)
    window.addEventListener('keyup', release, true)
    window.addEventListener('blur', cancel)
    document.addEventListener('visibilitychange', onVisibility)
    const timer = window.setTimeout(cancel, 30_000)
    // Registered global combinations must reach the recorder instead of executing
    // their current action. Restore them on completion, cancellation or navigation.
    void (window.api?.settings.setShortcutRecording?.(true) ?? Promise.resolve()).then(() => {
      if (!cancelled) armed = true
    }).catch(() => {
      if (!cancelled) { setError(latest.current.t('shortcutRecordFailed')); cancel() }
    })
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.removeEventListener('keydown', capture, true)
      window.removeEventListener('keyup', release, true)
      window.removeEventListener('blur', cancel)
      document.removeEventListener('visibilitychange', onVisibility)
      void window.api?.settings.setShortcutRecording?.(false).catch(() => {})
    }
  }, [recording])

  return <div>
    <div className="">
      {SHORTCUT_ACTIONS.map(action => {
        const label = t(LABELS[action])
        const active = recording === action
        return <div key={action} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0" data-shortcut-action={action}>
          <span className="min-w-40 flex-1 text-xs font-medium">{label}</span>
          <div className="flex min-w-0 max-w-full items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" className={`h-8 min-w-36 max-w-64 ${active ? 'border-primary text-primary' : ''}`} disabled={disabled}
              aria-label={t('shortcutAssign', { action: label })} aria-pressed={active}
              onClick={() => { setError(''); setPreview(''); setRecording(active ? null : action) }}>
              <span className="truncate font-mono text-[11px]">{active ? preview || t('shortcutListening') : value[action] || t('shortcutUnassigned')}</span>
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" className="hover:text-destructive" disabled={disabled || !value[action]}
              aria-label={t('shortcutClear', { action: label })}
              title={t('shortcutClear', { action: label })}
              onClick={() => {
                setRecording(null)
                const next = { ...value }; delete next[action]; onChange(next); setError('')
              }}><Trash2 className="size-3.5" /></Button>
          </div>
        </div>
      })}
    </div>
    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{t(recording ? 'shortcutRecordingHint' : 'shortcutSaveHint')}</p>
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </div>
}
