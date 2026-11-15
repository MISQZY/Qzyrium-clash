import { useEffect, useState } from 'react'
import type { AppConfig } from '@shared/app-config'
import type { ConfigPreview } from '@shared/effective-core'
import { useTranslations } from '../../i18n'
import { Dialog, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { Button } from '../ui/button'
import { FileEditorComparisonControls, FileEditorContent, FileEditorDialogContent } from '../FileEditor'

export default function ConfigPreviewDialog({ kernel, onClose }: { kernel: AppConfig['kernel']; onClose: () => void }) {
  const t = useTranslations('networksettings')
  const common = useTranslations('common')
  const [preview, setPreview] = useState<ConfigPreview | null>(null)
  const [error, setError] = useState(false)
  const [diff, setDiff] = useState(false)
  const [sideBySide, setSideBySide] = useState(true)
  useEffect(() => {
    let active = true
    setPreview(null); setError(false)
    void Promise.resolve().then(() => window.api.mihomo.getConfigPreview({ kernel }))
      .then(result => { if (active) setPreview(result) }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [kernel])
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <FileEditorDialogContent>
      <DialogHeader className="shrink-0 border-b border-border/60 pb-2 pr-6">
        <DialogTitle>{t('configPreviewTitle')}</DialogTitle>
        <DialogDescription>{t('configPreviewHint')}</DialogDescription>
        {preview?.profileName && <p className="truncate text-xs text-muted-foreground" title={preview.profileName}>{preview.profileName}</p>}
      </DialogHeader>
      {error ? <p role="alert" className="text-sm text-destructive">{t('configPreviewFailed')}</p> : <>
        {preview && diff && sideBySide && <div className="grid shrink-0 grid-cols-2 gap-3 text-xs text-muted-foreground"><span>{t('configPreviewOriginal')}</span><span>{t('configPreviewYaml')}</span></div>}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-config-preview={diff ? 'diff' : 'yaml'}>
          <FileEditorContent original={preview?.original ?? ''} value={preview?.effective ?? ''}
            isDiff={diff} sideBySide={sideBySide} loading={!preview} readOnly />
        </div>
      </>}
      <DialogFooter className="shrink-0 flex flex-wrap items-center justify-between gap-2 pt-1 sm:justify-between">
        <FileEditorComparisonControls isDiff={diff} onIsDiffChange={setDiff} sideBySide={sideBySide}
          onSideBySideChange={setSideBySide} disabled={!preview} />
        <Button type="button" size="sm" variant="outline" onClick={onClose}>{common('close')}</Button>
      </DialogFooter>
    </FileEditorDialogContent>
  </Dialog>
}
