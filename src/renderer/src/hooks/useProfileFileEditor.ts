import { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo } from 'react'
import type { EditorView } from '@uiw/react-codemirror'
import { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { createYamlEditorExtensions } from '../lib/yaml-editor-extensions'
import { useIsDarkTheme } from '../lib/theme'
import yamlParser from 'yaml'
import type { ProfileItem } from '@shared/profile'
import { useTranslations } from '../i18n'

export interface EditorHandle {
  getValue: () => string
  setValue: (val: string) => void
  getDomNode?: () => HTMLElement | null
  layout?: () => void
}

export interface UseProfileFileEditorOptions {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: ProfileItem | null
  onSaved: () => void
}

export function useProfileFileEditor({
  open,
  onOpenChange,
  profile,
  onSaved
}: UseProfileFileEditorOptions) {
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
    getValue: () => (activeViewRef.current ? activeViewRef.current.state.doc.toString() : contentRef.current),
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

  return {
    originalContent,
    content,
    contentRef,
    isDiff,
    setIsDiff,
    sideBySide,
    setSideBySide,
    loading,
    saving,
    error,
    setError,
    editorRef,
    containerRef,
    cmRef,
    isDark,
    extensions,
    handleCreateEditor,
    handleSave,
    t
  }
}
