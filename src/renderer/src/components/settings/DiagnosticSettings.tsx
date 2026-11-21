import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { useTranslations } from '../../i18n'
import { Button } from '../ui/button'

export function DiagnosticSettings({ disabled }: { disabled: boolean }) {
  const t = useTranslations('networksettings')
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState<'diagnosticsSaved' | 'diagnosticsFailed' | null>(null)
  const save = async () => {
    if (pending) return
    setPending(true); setStatus(null)
    try { if (await window.api.app.exportDiagnostics()) setStatus('diagnosticsSaved') }
    catch { setStatus('diagnosticsFailed') }
    finally { setPending(false) }
  }
  return (
    <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">{t('diagnosticsTitle')}</h2>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          {t('diagnosticsDescription')}
        </p>
        {status && <p role="status" className="mt-2 text-xs text-muted-foreground">{t(status)}</p>}
      </div>
      <div className="flex flex-col gap-2 shrink-0 w-full sm:w-56">
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-maintenance="diagnostics"
          disabled={disabled || pending}
          onClick={() => void save()}
          className="w-full gap-2 justify-center h-auto min-h-8 py-1.5 px-3 text-center leading-snug whitespace-normal"
        >
          <FileDown className="size-3.5 shrink-0" />
          <span className="break-words text-center">{t('exportDiagnostics')}</span>
        </Button>
      </div>
    </div>
  )
}
