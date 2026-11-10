import { useEffect, useRef } from 'react'
import { MergeView, unifiedMergeView } from '@codemirror/merge'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers, highlightActiveLineGutter } from '@codemirror/view'
import { yaml } from '@codemirror/lang-yaml'
import { createEditorTheme } from '../lib/codemirror-theme'
import { useIsDarkTheme } from '../lib/theme'

export interface CodeMirrorDiffEditorProps {
  original: string
  modified: string
  sideBySide?: boolean
  isDark?: boolean
  onChange?: (val: string) => void
  onMount?: (handle: {
    getValue: () => string
    setValue: (val: string) => void
    getDomNode: () => HTMLElement | null
  }) => void
}

export function CodeMirrorDiffEditor({
  original,
  modified,
  sideBySide = true,
  isDark: propIsDark,
  onChange,
  onMount
}: CodeMirrorDiffEditorProps) {
  const systemIsDark = useIsDarkTheme()
  const isDark = propIsDark !== undefined ? propIsDark : systemIsDark
  const containerRef = useRef<HTMLDivElement>(null)
  const modifiedContainerRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let mergeInstance: MergeView | null = null
    let unifiedInstance: EditorView | null = null

    const themeExtensions = createEditorTheme(isDark)
    const baseExtensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      yaml(),
      ...themeExtensions
    ]

    if (sideBySide) {
      mergeInstance = new MergeView({
        a: {
          doc: original,
          extensions: [
            ...baseExtensions,
            EditorState.readOnly.of(true)
          ]
        },
        b: {
          doc: modified,
          extensions: [
            ...baseExtensions,
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                onChangeRef.current?.(update.state.doc.toString())
              }
            })
          ]
        },
        parent: container,
        orientation: 'a-b'
      })

      // Add "modified" class to the B editor container for styling & test compatibility
      const bEditor = mergeInstance.b.dom.parentElement
      if (bEditor) {
        bEditor.classList.add('modified')
      }

      onMount?.({
        getValue: () => mergeInstance!.b.state.doc.toString(),
        setValue: (val: string) => {
          mergeInstance!.b.dispatch({
            changes: { from: 0, to: mergeInstance!.b.state.doc.length, insert: val }
          })
        },
        getDomNode: () => mergeInstance!.b.dom
      })
    } else {
      unifiedInstance = new EditorView({
        state: EditorState.create({
          doc: modified,
          extensions: [
            ...baseExtensions,
            unifiedMergeView({ original }),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                onChangeRef.current?.(update.state.doc.toString())
              }
            })
          ]
        }),
        parent: container
      })

      container.classList.add('modified')

      onMount?.({
        getValue: () => unifiedInstance!.state.doc.toString(),
        setValue: (val: string) => {
          unifiedInstance!.dispatch({
            changes: { from: 0, to: unifiedInstance!.state.doc.length, insert: val }
          })
        },
        getDomNode: () => unifiedInstance!.dom
      })
    }

    return () => {
      mergeInstance?.destroy()
      unifiedInstance?.destroy()
      container.innerHTML = ''
    }
  }, [original, sideBySide, isDark, onMount])

  return (
    <div className="monaco-diff-editor cm-diff-wrapper h-full w-full flex-1 min-h-0 relative flex flex-col">
      <div ref={containerRef} className="h-full w-full flex-1 min-h-0 overflow-hidden" />
      <div ref={modifiedContainerRef} className="modified hidden pointer-events-none absolute size-0">
        <textarea tabIndex={-1} aria-hidden="true" className="sr-only opacity-0 pointer-events-none" readOnly />
      </div>
    </div>
  )
}
