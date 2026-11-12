import { yaml } from '@codemirror/lang-yaml'
import { EditorView } from '@codemirror/view'
import { createEditorTheme } from './codemirror-theme'

export const yamlEditorBasicSetup = {
  lineNumbers: true,
  highlightActiveLineGutter: true,
  foldGutter: true,
  indentOnInput: true,
  bracketMatching: true,
  closeBrackets: true,
  highlightActiveLine: true
}

export function createYamlEditorExtensions(isDark: boolean) {
  return [yaml(), EditorView.lineWrapping, ...createEditorTheme(isDark)]
}
