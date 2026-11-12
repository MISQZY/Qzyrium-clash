import { useEffect, useState } from 'react'
import type { WhatsNewPayload } from '@shared/updater'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui'
import { useTranslations } from '../i18n'
import { useTour } from '../providers/TourProvider'

export function WhatsNewDialog() {
  const { index: tourIndex } = useTour()
  const [payload, setPayload] = useState<WhatsNewPayload | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const t = useTranslations('app')
  const common = useTranslations('common')
  useEffect(() => {
    let active = true
    if (window.api?.app?.getWhatsNew) void window.api.app.getWhatsNew().then((next) => { if (active) setPayload(next) }).catch(() => {})
    return () => { active = false }
  }, [])
  if (!payload || dismissed || tourIndex !== null) return null
  return <Dialog open onOpenChange={(open) => { if (!open) setDismissed(true) }}>
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{t('whatsNewTitle')}</DialogTitle>
        <DialogDescription>{t('whatsNewDescription', { from: payload.fromVersion, to: payload.toVersion })}</DialogDescription>
      </DialogHeader>
      <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto pr-3 select-text">
        {payload.entries.map((entry) => <section key={entry.version} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">v{entry.version}</h3>
          {entry.notes.length ? <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">{entry.notes.map((note, index) => <li key={index} className="whitespace-pre-wrap break-words">{note}</li>)}</ul>
            : <p className="text-sm text-muted-foreground">{t('whatsNewEmpty')}</p>}
        </section>)}
      </div>
      <DialogFooter><Button onClick={() => setDismissed(true)}>{common('close')}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
