import Editor, { loader, type EditorProps } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/languages/definitions/yaml/register.js'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'

// This module is imported only when a YAML editor is requested.
self.MonacoEnvironment = { getWorker: () => new EditorWorker() }
loader.config({ monaco })

export default function YamlEditor(props: Pick<EditorProps, 'value' | 'onChange' | 'theme'>) {
  return <Editor
    {...props}
    height="100%"
    width="100%"
    language="yaml"
    className="h-full w-full flex-1 min-h-0"
    options={{
      minimap: { enabled: true, maxColumn: 45 },
      lineNumbers: 'on',
      wordWrap: 'on',
      scrollBeyondLastLine: false,
      automaticLayout: true,
      fontSize: 13,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
      tabSize: 2
    }}
  />
}
