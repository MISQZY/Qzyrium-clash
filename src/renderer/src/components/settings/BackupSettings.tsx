import { useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { useTranslations } from '../../i18n'
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
  return (
    <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">{t('backupTitle')}</h2>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          {t('backupDescription')}
        </p>
        {status && <p role="status" className="mt-2 text-xs text-muted-foreground">{t(status)}</p>}
      </div>
      <div className="flex flex-col gap-2 shrink-0 w-full sm:w-56">
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-maintenance="export-backup"
          disabled={disabled || pending}
          onClick={() => void run(false)}
          className="w-full gap-2 justify-center h-auto min-h-8 py-1.5 px-3 text-center leading-snug whitespace-normal"
        >
          <Download className="size-3.5 shrink-0" />
          <span className="break-words text-center">{t('exportBackup')}</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-maintenance="import-backup"
          disabled={disabled || pending}
          onClick={() => void run(true)}
          className="w-full gap-2 justify-center h-auto min-h-8 py-1.5 px-3 text-center leading-snug whitespace-normal"
        >
          <Upload className="size-3.5 shrink-0" />
          <span className="break-words text-center">{t('importBackup')}</span>
        </Button>
      </div>
    </div>
  )
}
