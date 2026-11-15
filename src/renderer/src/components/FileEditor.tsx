import type { ReactNode, Ref } from 'react'
import type { EditorView } from '@codemirror/view'
import { LoaderCircle } from 'lucide-react'
import { DialogContent } from './ui/dialog'
import { Switch } from './ui/switch'
import { useTranslations } from '../i18n'
import YamlEditor from './YamlEditor'
import { CodeMirrorDiffEditor, type CodeMirrorDiffEditorProps } from './CodeMirrorDiffEditor'

export function FileEditorDialogContent({ children }: { children: ReactNode }) {
  return <DialogContent className="w-[96vw] max-w-6xl h-[92dvh] min-h-0 flex flex-col p-4 sm:p-5 gap-3 overflow-hidden">
    {children}
  </DialogContent>
}

export interface FileEditorComparisonProps {
  isDiff: boolean
  onIsDiffChange: (checked: boolean) => void
  sideBySide: boolean
  onSideBySideChange: (checked: boolean) => void
  disabled?: boolean
}

export function FileEditorComparisonControls({ isDiff, onIsDiffChange, sideBySide, onSideBySideChange, disabled }: FileEditorComparisonProps) {
  const t = useTranslations('profiles')
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
      <Switch checked={isDiff} disabled={disabled} onCheckedChange={checked => {
        onIsDiffChange(checked)
        if (!checked) onSideBySideChange(false)
      }} />
      <span>{t('showChanges')}</span>
    </label>
    {isDiff && <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
      <Switch checked={sideBySide} disabled={disabled} onCheckedChange={onSideBySideChange} />
      <span>{t('sideBySide')}</span>
    </label>}
  </div>
}

interface FileEditorContentProps {
  original: string
  value: string
  isDiff: boolean
  sideBySide: boolean
  loading?: boolean
  readOnly?: boolean
  isDark?: boolean
  containerRef?: Ref<HTMLDivElement>
  onChange?: (value: string) => void
  onCreateEditor?: (view: EditorView) => void
  onMount?: CodeMirrorDiffEditorProps['onMount']
}

export function FileEditorContent({ original, value, isDiff, sideBySide, loading, readOnly, isDark, containerRef, onChange, onCreateEditor, onMount }: FileEditorContentProps) {
  return <div ref={containerRef} className="relative flex-1 min-h-0 min-w-0 w-full rounded-lg border border-border/70 overflow-hidden bg-background flex flex-col">
    {loading ? <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20" role="status">
      <LoaderCircle className="size-7 animate-spin text-primary" />
    </div> : isDiff ? <CodeMirrorDiffEditor original={original} modified={value} sideBySide={sideBySide}
      readOnly={readOnly} isDark={isDark} onChange={onChange} onMount={onMount} /> :
      <YamlEditor value={value} readOnly={readOnly} theme={isDark === undefined ? undefined : isDark ? 'dark' : 'light'}
        onChange={onChange} onCreateEditor={onCreateEditor} />}
  </div>
}
