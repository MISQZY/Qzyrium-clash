import { useMemo } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { yaml } from '@codemirror/lang-yaml'
import { createEditorTheme } from '../lib/codemirror-theme'

export interface YamlEditorProps {
  value?: string
  onChange?: (value: string) => void
  theme?: string
  className?: string
}

export default function YamlEditor({
  value = '',
  onChange,
  theme,
  className
}: YamlEditorProps) {
  const isDark = theme ? theme.includes('dark') : (typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))

  const extensions = useMemo(() => [
    yaml(),
    EditorView.lineWrapping,
    ...createEditorTheme(isDark)
  ], [isDark])

  return (
    <div className={`monaco-editor cm-editor-wrapper h-full w-full flex-1 min-h-0 overflow-hidden ${className || ''}`}>
      <CodeMirror
        value={value}
        height="100%"
        className="h-full w-full flex-1 min-h-0"
        extensions={extensions}
        onChange={(val) => onChange?.(val)}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          foldGutter: true,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          highlightActiveLine: true
        }}
      />
    </div>
  )
}
