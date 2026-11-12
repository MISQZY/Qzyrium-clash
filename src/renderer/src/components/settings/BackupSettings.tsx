import { useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { useTranslations } from '../../i18n'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'

export function BackupSettings({ disabled }: { disabled: boolean }) {
  const t = useTranslations('networksettings')
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState<'backupSaved' | 'backupRestoring' | 'backupFailed' | null>(null)
  const run = async (restore: boolean) => {
    if (pending) return
    setPending(true); setStatus(null)
    try {
      const saved = await (restore ? window.api.app.importBackup() : window.api.app.exportBackup())
      if (saved) setStatus(restore ? 'backupRestoring' : 'backupSaved')
    } catch { setStatus('backupFailed') }
    finally { setPending(false) }
  }
  return <Card><CardContent className="p-5">
    <h2 className="text-sm font-semibold">{t('backupTitle')}</h2>
    <p className="mt-1 text-xs text-muted-foreground">{t('backupDescription')}</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" disabled={disabled || pending} onClick={() => void run(false)}><Download className="size-3.5" />{t('exportBackup')}</Button>
      <Button type="button" size="sm" variant="outline" disabled={disabled || pending} onClick={() => void run(true)}><Upload className="size-3.5" />{t('importBackup')}</Button>
    </div>
    {status && <p role="status" className="mt-3 text-xs text-muted-foreground">{t(status)}</p>}
  </CardContent></Card>
}
