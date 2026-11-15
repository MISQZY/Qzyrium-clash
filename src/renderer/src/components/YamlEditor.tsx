import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import type { EditorView } from '@codemirror/view'
import { createYamlEditorExtensions, yamlEditorBasicSetup } from '../lib/yaml-editor-extensions'
import { useIsDarkTheme } from '../lib/theme'

export interface YamlEditorProps {
  value?: string
  onChange?: (value: string) => void
  theme?: string
  className?: string
  readOnly?: boolean
  onCreateEditor?: (view: EditorView) => void
}

export default function YamlEditor({
  value = '',
  onChange,
  theme,
  className,
  readOnly = false,
  onCreateEditor
}: YamlEditorProps) {
  const activeIsDark = useIsDarkTheme()
  const isDark = theme ? theme.includes('dark') : activeIsDark

  const extensions = useMemo(() => createYamlEditorExtensions(isDark), [isDark])

  return (
    <div className={`monaco-editor cm-editor-wrapper relative h-full w-full flex-1 min-h-0 overflow-hidden ${className || ''}`}>
      <textarea tabIndex={-1} aria-hidden="true" className="sr-only opacity-0 pointer-events-none absolute size-0" readOnly />
      <CodeMirror
        value={value}
        height="100%"
        theme="none"
        readOnly={readOnly}
        editable={!readOnly}
        className="h-full w-full flex-1 min-h-0"
        extensions={extensions}
        onChange={(val) => onChange?.(val)}
        onCreateEditor={onCreateEditor}
        basicSetup={yamlEditorBasicSetup}
      />
    </div>
  )
}
