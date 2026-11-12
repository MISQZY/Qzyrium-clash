import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { useTranslations } from '../../i18n'
import { Card, CardContent } from '../ui/card'
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
  return <Card><CardContent className="p-5">
    <h2 className="text-sm font-semibold">{t('diagnosticsTitle')}</h2>
    <p className="mt-1 text-xs text-muted-foreground">{t('diagnosticsDescription')}</p>
    <Button type="button" size="sm" variant="outline" data-maintenance="diagnostics" className="mt-4" disabled={disabled || pending} onClick={() => void save()}><FileDown className="size-3.5" />{t('exportDiagnostics')}</Button>
    {status && <p role="status" className="mt-3 text-xs text-muted-foreground">{t(status)}</p>}
  </CardContent></Card>
}
