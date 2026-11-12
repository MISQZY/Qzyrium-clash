import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { createYamlEditorExtensions, yamlEditorBasicSetup } from '../lib/yaml-editor-extensions'
import { useIsDarkTheme } from '../lib/theme'

export interface YamlEditorProps {
  value?: string
  onChange?: (value: string) => void
  theme?: string
  className?: string
  readOnly?: boolean
}

export default function YamlEditor({
  value = '',
  onChange,
  theme,
  className,
  readOnly = false
}: YamlEditorProps) {
  const activeIsDark = useIsDarkTheme()
  const isDark = theme ? theme.includes('dark') : activeIsDark

  const extensions = useMemo(() => createYamlEditorExtensions(isDark), [isDark])

  return (
    <div className={`monaco-editor cm-editor-wrapper h-full w-full flex-1 min-h-0 overflow-hidden ${className || ''}`}>
      <CodeMirror
        value={value}
        height="100%"
        theme="none"
        readOnly={readOnly}
        className="h-full w-full flex-1 min-h-0"
        extensions={extensions}
        onChange={(val) => onChange?.(val)}
        basicSetup={yamlEditorBasicSetup}
      />
    </div>
  )
}
