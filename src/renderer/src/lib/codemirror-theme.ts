import { EditorView } from '@codemirror/view'
import { Extension } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'

export function createEditorTheme(isDark: boolean): Extension[] {
  const baseTheme = EditorView.theme(
    {
      '&': {
        height: '100%',
        width: '100%',
        fontSize: '13px',
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)'
      },
      '.cm-scroller': {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
        lineHeight: '1.6',
        overflow: 'auto'
      },
      '.cm-content': {
        caretColor: 'var(--primary)',
        padding: '6px 0'
      },
      '&.cm-focused .cm-cursor': {
        borderLeftColor: 'var(--primary)',
        borderLeftWidth: '2px'
      },
      '&.cm-focused .cm-selectionBackground, ::selection': {
        backgroundColor: isDark ? 'rgba(56, 189, 248, 0.25) !important' : 'rgba(56, 189, 248, 0.2) !important'
      },
      '.cm-gutters': {
        backgroundColor: isDark ? 'var(--background)' : '#f8fafc',
        color: isDark ? '#64748b' : '#94a3b8',
        borderRight: '1px solid var(--border)',
        paddingRight: '6px',
        minWidth: '40px'
      },
      '.cm-activeLineGutter': {
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
        color: 'var(--foreground)'
      },
      '.cm-activeLine': {
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)'
      },
      // Diff Merge View Styles
      '.cm-mergeView': {
        height: '100%',
        overflow: 'hidden'
      },
      '.cm-mergeViewEditors': {
        height: '100%'
      },
      '.cm-mergeViewEditor': {
        height: '100%',
        overflow: 'hidden'
      },
      '.cm-merge-a .cm-changedLine': {
        backgroundColor: 'rgba(244, 63, 94, 0.15) !important'
      },
      '.cm-merge-b .cm-changedLine': {
        backgroundColor: 'rgba(16, 185, 129, 0.15) !important'
      },
      '.cm-changeGutter': {
        width: '4px'
      },
      '.cm-changedLineGutter': {
        backgroundColor: 'transparent'
      },
      '.cm-merge-a .cm-changedLineGutter': {
        borderLeft: '3px solid #f43f5e'
      },
      '.cm-merge-b .cm-changedLineGutter': {
        borderLeft: '3px solid #10b981'
      },
      '.cm-merge-revert button': {
        background: 'var(--muted)',
        border: '1px solid var(--border)',
        color: 'var(--foreground)',
        borderRadius: '4px',
        padding: '0 4px',
        cursor: 'pointer'
      }
    },
    { dark: isDark }
  )

  return isDark ? [baseTheme, oneDark] : [baseTheme]
}
