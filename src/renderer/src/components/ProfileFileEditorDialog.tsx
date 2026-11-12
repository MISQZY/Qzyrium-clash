import React, { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo } from 'react'
import CodeMirror, { ReactCodeMirrorRef, EditorView } from '@uiw/react-codemirror'
import { createYamlEditorExtensions, yamlEditorBasicSetup } from '../lib/yaml-editor-extensions'
import { useIsDarkTheme } from '../lib/theme'
import { CodeMirrorDiffEditor } from './CodeMirrorDiffEditor'
import yamlParser from 'yaml'
import { FileCode, Check, AlertCircle, LoaderCircle } from 'lucide-react'
import type { ProfileItem } from '@shared/profile'
import { useTranslations } from '../i18n'
import { ProfileEditorHeader } from './ProfileEditorHeader'
import {
  Dialog,
  DialogContent,
  DialogFooter
} from './ui/dialog'
import { Button } from './ui/button'
import { Switch } from './ui/switch'

interface EditorHandle {
  getValue: () => string
  setValue: (val: string) => void
  getDomNode?: () => HTMLElement | null
  layout?: () => void
}

interface ProfileFileEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: ProfileItem | null
  onSaved: () => void
}

export const ProfileFileEditorDialog: React.FC<ProfileFileEditorDialogProps> = ({
  open,
  onOpenChange,
  profile,
  onSaved
}) => {
  const t = useTranslations('profiles')

  const [originalContent, setOriginalContent] = useState('')
  const [content, setContent] = useState('')
  const [isDiff, setIsDiff] = useState(false)
  const [sideBySide, setSideBySide] = useState(true)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const contentRef = useRef(content)
  const containerRef = useRef<HTMLDivElement>(null)
  const cmRef = useRef<ReactCodeMirrorRef>(null)
  const activeViewRef = useRef<EditorView | null>(null)

  const editorRef = useRef<EditorHandle>({
    getValue: () => activeViewRef.current ? activeViewRef.current.state.doc.toString() : contentRef.current,
    setValue: (val: string) => {
      contentRef.current = val
      if (activeViewRef.current) {
        activeViewRef.current.dispatch({
          changes: { from: 0, to: activeViewRef.current.state.doc.length, insert: val }
        })
      }
    },
    getDomNode: () => activeViewRef.current?.dom || containerRef.current
  })

  const isDark = useIsDarkTheme()

  const extensions = useMemo(() => createYamlEditorExtensions(isDark), [isDark])

  useLayoutEffect(() => () => {
    activeViewRef.current = null
  }, [isDiff])

  const handleCreateEditor = useCallback((view: EditorView) => {
    activeViewRef.current = view
    editorRef.current = {
      getValue: () => view.state.doc.toString(),
      setValue: (val: string) => {
        contentRef.current = val
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: val }
        })
      },
      getDomNode: () => view.dom,
      layout: () => view.requestMeasure()
    }
  }, [])

  useEffect(() => {
    if (!open || !profile || !window.api) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setIsDiff(false)

    window.api.profiles
      .getRawConfig(profile.id)
      .then((raw) => {
        if (cancelled) return
        const val = raw || ''
        setOriginalContent(val)
        setContent(val)
        contentRef.current = val
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, profile])

  const handleSave = useCallback(async () => {
    if (!profile || !window.api || saving) return
    const textToSave = contentRef.current
    setError(null)
    setSaving(true)

    try {
      try {
        yamlParser.parse(textToSave)
      } catch (yamlErr) {
        setError(
          t('invalidYaml', {
            error: yamlErr instanceof Error ? yamlErr.message : String(yamlErr)
          })
        )
        setSaving(false)
        return
      }

      await window.api.profiles.saveRawConfig(profile.id, textToSave)
      setContent(textToSave)
      contentRef.current = textToSave
      onSaved()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [profile, saving, onSaved, onOpenChange, t])

  if (!profile) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-6xl h-[92dvh] flex flex-col p-4 sm:p-5 gap-3 overflow-hidden">
        {/* Header */}
        <ProfileEditorHeader profile={profile} icon={FileCode} description={t('editProfileFile')} />

        {/* Error notification */}
        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-1.5 rounded-md shrink-0">
            <AlertCircle className="size-4 shrink-0" />
            <span className="font-mono truncate">{error}</span>
          </div>
        )}

        {/* Editor Container */}
        <div
          ref={containerRef}
          className="relative flex-1 min-h-0 w-full rounded-lg border border-border/70 overflow-hidden bg-background flex flex-col"
        >
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20">
              <LoaderCircle className="size-7 animate-spin text-primary" />
            </div>
          ) : isDiff ? (
            <CodeMirrorDiffEditor
              original={originalContent}
              modified={contentRef.current}
              sideBySide={sideBySide}
              isDark={isDark}
              onChange={(val) => {
                contentRef.current = val
                if (error) setError(null)
              }}
              onMount={(handle) => {
                editorRef.current = handle
              }}
            />
          ) : (
            <div className="monaco-editor cm-editor-wrapper h-full w-full flex-1 min-h-0 relative">
              <textarea tabIndex={-1} aria-hidden="true" className="sr-only opacity-0 pointer-events-none absolute size-0" readOnly />
              <CodeMirror
                ref={cmRef}
                value={contentRef.current}
                height="100%"
                theme="none"
                className="h-full w-full flex-1 min-h-0"
                extensions={extensions}
                onCreateEditor={handleCreateEditor}
                onChange={(value) => {
                  contentRef.current = value || ''
                  if (error) setError(null)
                }}
                basicSetup={yamlEditorBasicSetup}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="gap-2 sm:gap-2 pt-1 border-t border-border/40 shrink-0 flex items-center justify-between sm:justify-between">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <Switch
                checked={isDiff}
                onCheckedChange={(checked) => {
                  setIsDiff(checked)
                  if (!checked) setSideBySide(false)
                }}
              />
              <span>{t('showChanges')}</span>
            </label>
            {isDiff && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <Switch checked={sideBySide} onCheckedChange={setSideBySide} />
                <span>{t('sideBySide')}</span>
              </label>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="glow"
              size="sm"
              onClick={handleSave}
              disabled={loading || saving}
              className="gap-1.5"
            >
              {saving ? (
                <>
                  <LoaderCircle className="size-3.5 animate-spin" />
                  <span>{t('saving')}</span>
                </>
              ) : (
                <>
                  <Check className="size-3.5" />
                  <span>{t('saveAndApply')}</span>
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
export default ProfileFileEditorDialog
