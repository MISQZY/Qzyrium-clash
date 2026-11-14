import { useEffect, useState } from 'react'
import type { AppConfig } from '@shared/app-config'
import type { ConfigPreview } from '@shared/effective-core'
import { useTranslations } from '../../i18n'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { Button } from '../ui/button'
import YamlEditor from '../YamlEditor'
import { CodeMirrorDiffEditor } from '../CodeMirrorDiffEditor'

export default function ConfigPreviewDialog({ kernel, onClose }: { kernel: AppConfig['kernel']; onClose: () => void }) {
  const t = useTranslations('networksettings')
  const [preview, setPreview] = useState<ConfigPreview | null>(null)
  const [error, setError] = useState(false)
  const [diff, setDiff] = useState(false)
  useEffect(() => {
    let active = true
    setPreview(null); setError(false)
    void Promise.resolve().then(() => window.api.mihomo.getConfigPreview({ kernel }))
      .then(result => { if (active) setPreview(result) }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [kernel])
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="flex h-[80vh] max-w-5xl flex-col overflow-hidden">
      <DialogHeader className="shrink-0 pr-6">
        <DialogTitle>{t('configPreviewTitle')}</DialogTitle>
        <DialogDescription>{t('configPreviewHint')}</DialogDescription>
        {preview?.profileName && <p className="break-all text-xs text-muted-foreground">{preview.profileName}</p>}
      </DialogHeader>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button size="sm" variant={diff ? 'outline' : 'default'} aria-pressed={!diff} onClick={() => setDiff(false)}>{t('configPreviewYaml')}</Button>
        <Button size="sm" variant={diff ? 'default' : 'outline'} aria-pressed={diff} onClick={() => setDiff(true)}>{t('configPreviewDiff')}</Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{t('configPreviewFailed')}</p> : preview ? <>
        {diff && <div className="flex shrink-0 justify-between text-xs text-muted-foreground"><span>{t('configPreviewOriginal')}</span><span>{t('configPreviewYaml')}</span></div>}
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-border" data-config-preview={diff ? 'diff' : 'yaml'}>
          {diff ? <CodeMirrorDiffEditor original={preview.original} modified={preview.effective} readOnly /> : <YamlEditor value={preview.effective} readOnly />}
        </div>
      </> : <p role="status" className="text-sm text-muted-foreground">{t('effectiveCoreLoading')}</p>}
    </DialogContent>
  </Dialog>
}
