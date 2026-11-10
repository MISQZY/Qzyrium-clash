import { EditorView, MatchDecorator, ViewPlugin, Decoration, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { Extension } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

export const darkHighlightStyle = HighlightStyle.define([
  { tag: [t.propertyName, t.attributeName, t.definition(t.propertyName)], color: '#38bdf8', fontWeight: '600' }, // Sky blue for YAML keys
  { tag: [t.string, t.character, t.attributeValue], color: '#4ade80' },                                             // Crisp emerald green for quoted strings
  { tag: [t.number, t.integer, t.float], color: '#fb923c', fontWeight: '500' },                                   // Warm amber for numbers
  { tag: [t.bool, t.atom], color: '#c084fc', fontWeight: '600' },                                                 // Bright purple for true/false/null
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#94a3b8', fontStyle: 'italic' },                       // Readable slate for comments
  { tag: [t.keyword, t.modifier], color: '#f43f5e', fontWeight: '600' },                                          // Rose for keywords / types
  { tag: [t.punctuation, t.separator], color: '#cbd5e1' },                                                        // Slate for colons, dashes, brackets
  { tag: [t.operator], color: '#38bdf8' },
  { tag: [t.escape, t.regexp], color: '#ec4899' },
  { tag: [t.labelName], color: '#f472b6', fontWeight: '600' },                                                    // Pink for anchors & aliases
  { tag: [t.content], color: '#f8fafc' },                                                                          // Crisp bright text for unquoted values
  { tag: [t.brace, t.bracket], color: '#cbd5e1' }
])

export const lightHighlightStyle = HighlightStyle.define([
  { tag: [t.propertyName, t.attributeName, t.definition(t.propertyName)], color: '#0284c7', fontWeight: '600' }, // Deep sky blue for YAML keys
  { tag: [t.string, t.character, t.attributeValue], color: '#16a34a' },                                             // Deep forest green for quoted strings
  { tag: [t.number, t.integer, t.float], color: '#ea580c', fontWeight: '500' },                                   // Dark orange for numbers
  { tag: [t.bool, t.atom], color: '#9333ea', fontWeight: '600' },                                                 // Royal purple for true/false/null
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#64748b', fontStyle: 'italic' },                       // Slate for comments
  { tag: [t.keyword, t.modifier], color: '#e11d48', fontWeight: '600' },                                          // Crimson for keywords
  { tag: [t.punctuation, t.separator], color: '#475569' },                                                        // Slate for colons, dashes, brackets
  { tag: [t.operator], color: '#0284c7' },
  { tag: [t.escape, t.regexp], color: '#be185d' },
  { tag: [t.labelName], color: '#db2777', fontWeight: '600' },                                                    // Deep pink for anchors & aliases
  { tag: [t.content], color: '#0f172a' },                                                                          // Dark slate text for unquoted values
  { tag: [t.brace, t.bracket], color: '#475569' }
])

// Decorator to highlight booleans and numbers in unquoted YAML content without regex matching comments or quoted strings
const yamlValueDecorator = new MatchDecorator({
  regexp: /\b(?:true|false|null|yes|no)\b|\b\d+(?:\.\d+)?\b/gi,
  decoration: (match, view, pos) => {
    try {
      const node = syntaxTree(view.state).resolveInner(pos, 1)
      if (node && (node.name === 'Comment' || node.name === 'QuotedLiteral')) {
        return null
      }
    } catch {
      // Safe fallback if syntax tree is not ready
    }
    const val = match[0].toLowerCase()
    if (val === 'true' || val === 'false' || val === 'null' || val === 'yes' || val === 'no') {
      return Decoration.mark({ class: 'cm-yaml-bool' })
    }
    return Decoration.mark({ class: 'cm-yaml-num' })
  }
})

export const yamlValueHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = yamlValueDecorator.createDeco(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = yamlValueDecorator.updateDeco(update, this.decorations)
      }
    }
  },
  {
    decorations: (v) => v.decorations
  }
)

export function createEditorTheme(isDark: boolean): Extension[] {
  const highlight = syntaxHighlighting(isDark ? darkHighlightStyle : lightHighlightStyle)

  const themeSpec = EditorView.theme(
    {
      '&': {
        height: '100%',
        width: '100%',
        fontSize: '13px',
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)'
      },
      '&.cm-focused': {
        outline: 'none'
      },
      '.cm-scroller': {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
        lineHeight: '1.6',
        overflow: 'auto'
      },
      '.cm-content': {
        caretColor: 'var(--primary)',
        padding: '8px 0',
        minHeight: '100%'
      },
      '.cm-line': {
        padding: '0 8px'
      },
      '&.cm-focused .cm-cursor': {
        borderLeftColor: 'var(--primary)',
        borderLeftWidth: '2px'
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
        backgroundColor: isDark
          ? 'rgba(56, 189, 248, 0.28) !important'
          : 'rgba(2, 132, 199, 0.2) !important'
      },
      '.cm-gutters': {
        backgroundColor: isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.03)',
        color: isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.45)',
        borderRight: '1px solid var(--border)',
        paddingRight: '6px',
        paddingLeft: '4px',
        userSelect: 'none'
      },
      '.cm-gutterElement': {
        padding: '0 4px',
        minWidth: '22px',
        textAlign: 'right'
      },
      '.cm-activeLineGutter': {
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.07)',
        color: 'var(--foreground)',
        fontWeight: '600'
      },
      '.cm-activeLine': {
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)'
      },
      '.cm-foldPlaceholder': {
        backgroundColor: 'var(--muted)',
        border: '1px solid var(--border)',
        color: 'var(--muted-foreground)',
        borderRadius: '3px',
        padding: '0 4px',
        margin: '0 2px'
      },
      '.cm-foldGutter .cm-gutterElement': {
        color: 'var(--muted-foreground)',
        cursor: 'pointer'
      },
      '.cm-foldGutter .cm-gutterElement:hover': {
        color: 'var(--foreground)'
      },

      // Custom value classes applied by yamlValueDecorator
      '.cm-yaml-bool': {
        color: isDark ? '#c084fc' : '#9333ea',
        fontWeight: '600'
      },
      '.cm-yaml-num': {
        color: isDark ? '#fb923c' : '#ea580c',
        fontWeight: '500'
      },

      // Panels (Find & Replace)
      '.cm-panels': {
        backgroundColor: 'var(--card)',
        color: 'var(--card-foreground)',
        borderBottom: '1px solid var(--border)',
        borderTop: '1px solid var(--border)',
        padding: '4px 8px'
      },
      '.cm-panels.cm-panels-top': {
        borderBottom: '1px solid var(--border)'
      },
      '.cm-panels.cm-panels-bottom': {
        borderTop: '1px solid var(--border)'
      },
      '.cm-search': {
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '6px'
      },
      '.cm-textfield': {
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
        border: '1px solid var(--border)',
        borderRadius: 'calc(var(--radius) - 2px)',
        padding: '2px 8px',
        fontSize: '12px',
        outline: 'none'
      },
      '.cm-textfield:focus': {
        borderColor: 'var(--primary)',
        boxShadow: '0 0 0 1px var(--primary)'
      },
      '.cm-button': {
        backgroundColor: 'var(--secondary)',
        color: 'var(--secondary-foreground)',
        border: '1px solid var(--border)',
        borderRadius: 'calc(var(--radius) - 2px)',
        padding: '2px 8px',
        fontSize: '12px',
        cursor: 'pointer'
      },
      '.cm-button:hover': {
        backgroundColor: 'var(--accent)',
        color: 'var(--accent-foreground)'
      },
      '.cm-searchMatch': {
        backgroundColor: isDark ? 'rgba(250, 204, 21, 0.3)' : 'rgba(234, 179, 8, 0.35)',
        outline: '1px solid rgba(234, 179, 8, 0.6)'
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: isDark ? 'rgba(56, 189, 248, 0.45)' : 'rgba(2, 132, 199, 0.45)',
        outline: '1px solid var(--primary)'
      },

      // Tooltips & autocomplete
      '.cm-tooltip': {
        backgroundColor: 'var(--popover)',
        color: 'var(--popover-foreground)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
      },
      '.cm-tooltip-autocomplete > ul > li': {
        padding: '3px 8px'
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: 'var(--accent)',
        color: 'var(--accent-foreground)'
      },

      // Merge / Diff Editor Styling
      '.cm-mergeView': {
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        backgroundColor: 'var(--background)'
      },
      '.cm-mergeViewEditors': {
        height: '100%',
        width: '100%',
        display: 'flex'
      },
      '.cm-mergeViewEditor': {
        height: '100%',
        flex: '1 1 50%',
        overflow: 'hidden'
      },
      '.cm-mergeViewEditor:first-child': {
        borderRight: '1px solid var(--border)'
      },
      // Deleted lines (A / Original side)
      '.cm-merge-a .cm-changedLine': {
        backgroundColor: isDark ? 'rgba(244, 63, 94, 0.16) !important' : 'rgba(239, 68, 68, 0.12) !important'
      },
      // Added lines (B / Modified side)
      '.cm-merge-b .cm-changedLine': {
        backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16) !important' : 'rgba(34, 197, 94, 0.12) !important'
      },
      '.cm-deletedChunk': {
        backgroundColor: isDark ? 'rgba(244, 63, 94, 0.16) !important' : 'rgba(239, 68, 68, 0.12) !important'
      },
      '.cm-insertedChunk': {
        backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16) !important' : 'rgba(34, 197, 94, 0.12) !important'
      },
      '.cm-changedChunk': {
        backgroundColor: isDark ? 'rgba(244, 63, 94, 0.08)' : 'rgba(239, 68, 68, 0.06)'
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
      '.cm-merge-revert': {
        width: '22px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      },
      '.cm-merge-revert button': {
        background: 'var(--card)',
        border: '1px solid var(--border)',
        color: 'var(--foreground)',
        borderRadius: '4px',
        padding: '1px 5px',
        cursor: 'pointer',
        fontSize: '11px',
        transition: 'all 0.15s ease'
      },
      '.cm-merge-revert button:hover': {
        background: 'var(--primary)',
        color: 'var(--primary-foreground)',
        borderColor: 'var(--primary)'
      }
    },
    { dark: isDark }
  )

  return [themeSpec, highlight, yamlValueHighlighter]
}
