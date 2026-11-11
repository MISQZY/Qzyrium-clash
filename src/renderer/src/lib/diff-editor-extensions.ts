import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { yaml } from '@codemirror/lang-yaml'
import { highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'
import { createEditorTheme } from './codemirror-theme'

export function createDiffEditorExtensions(isDark: boolean) {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    yaml(),
    ...createEditorTheme(isDark)
  ]
}
