import React, { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react'
import Editor, { DiffEditor, loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/languages/definitions/yaml/register.js'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'
import yaml from 'yaml'
import { FileCode, Check, AlertCircle, LoaderCircle } from 'lucide-react'
import type { ProfileItem } from '@shared/profile'
import { useLocale, useTranslations } from '../i18n'
import { EmojiText } from './EmojiText'
import { profileName } from '../lib/profile-name'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from './ui/dialog'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Switch } from './ui/switch'

if (typeof window !== 'undefined') {
  self.MonacoEnvironment = {
    getWorker() {
      return new editorWorker()
    }
  }
}
loader.config({ monaco })

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
  const locale = useLocale()

  const [originalContent, setOriginalContent] = useState('')
  const [content, setContent] = useState('')
  const [isDiff, setIsDiff] = useState(false)
  const [sideBySide, setSideBySide] = useState(true)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef(content)
  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  useEffect(() => {
    return () => {
      if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current)
    }
  }, [])

  // Detach diff models before the React Monaco wrapper disposes them in its passive cleanup.
  useLayoutEffect(() => () => {
    diffEditorRef.current?.setModel(null)
    diffEditorRef.current = null
    editorRef.current = null
  }, [isDiff])

  useEffect(() => {
    if (!open || !containerRef.current) return
    let animId: number
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(animId)
      animId = requestAnimationFrame(() => {
        editorRef.current?.layout()
      })
    })
    ro.observe(containerRef.current)
    return () => {
      cancelAnimationFrame(animId)
      ro.disconnect()
    }
  }, [open, isDiff])

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
        if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current)
        layoutTimerRef.current = setTimeout(() => {
          editorRef.current?.layout()
        }, 50)
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
        yaml.parse(textToSave)
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
      <DialogContent className="w-[96vw] max-w-6xl h-[92vh] max-h-[94vh] flex flex-col p-4 sm:p-5 gap-3 overflow-hidden">
        {/* Header */}
        <DialogHeader className="pb-2 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-8 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <FileCode className="size-4.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-sm font-semibold truncate">
                    <EmojiText text={profileName(profile, locale)} />
                  </DialogTitle>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
                    {profile.type}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{t('editProfileFile')}</p>
              </div>
            </div>
          </div>
        </DialogHeader>

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
          className="relative flex-1 min-h-0 w-full rounded-lg border border-border/70 overflow-hidden bg-[#1e1e1e] flex flex-col"
        >
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20">
              <LoaderCircle className="size-7 animate-spin text-primary" />
            </div>
          ) : isDiff ? (
            <DiffEditor
              height="100%"
              width="100%"
              language="yaml"
              theme={isDark ? 'vs-dark' : 'light'}
              original={originalContent}
              modified={contentRef.current}
              onMount={(editor) => {
                diffEditorRef.current = editor
                const modifiedEditor = editor.getModifiedEditor()
                editorRef.current = modifiedEditor
                modifiedEditor.onDidChangeModelContent(() => {
                  contentRef.current = modifiedEditor.getValue()
                })
              }}
              className="h-full w-full flex-1 min-h-0"
              options={{
                renderSideBySide: sideBySide,
                readOnly: false,
                fontSize: 13,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
                automaticLayout: true
              }}
            />
          ) : (
            <Editor
              height="100%"
              width="100%"
              language="yaml"
              theme={isDark ? 'vs-dark' : 'light'}
              defaultValue={contentRef.current}
              className="h-full w-full flex-1 min-h-0"
              onMount={(editor) => {
                editorRef.current = editor
                editor.layout()
              }}
              onChange={(value) => {
                contentRef.current = value || ''
                if (error) setError(null)
              }}
              options={{
                minimap: { enabled: false },
                lineNumbers: 'on',
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                fontSize: 13,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
                tabSize: 2
              }}
            />
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="gap-2 sm:gap-2 pt-1 shrink-0 flex items-center justify-between sm:justify-between">
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
