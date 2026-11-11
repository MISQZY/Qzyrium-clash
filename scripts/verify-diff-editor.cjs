const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { EditorState } = require('@codemirror/state')
const { keymap } = require('@codemirror/view')
const { unifiedMergeView } = require('@codemirror/merge')
const { undo, redo } = require('@codemirror/commands')

function load(file) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const exportsObject = {}
  new Function('exports', 'require', output)(exportsObject, name =>
    name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name))
  return exportsObject
}
const { createDiffEditorExtensions } = load('src/renderer/src/lib/diff-editor-extensions.ts')
for (const isDark of [true, false]) {
  for (const unified of [true, false]) {
    let state = EditorState.create({ doc: 'rules: []', extensions: [
      ...createDiffEditorExtensions(isDark), ...(unified ? [unifiedMergeView({ original: 'rules: []' })] : [])
    ] })
    state = state.update({ changes: { from: 7, to: 9, insert: '[MATCH,DIRECT]' }, userEvent: 'input.type' }).state
    const editor = { get state() { return state }, dispatch: transaction => { state = transaction.state } }
    assert.equal(undo(editor), true, 'both diff modes must undo typed edits')
    assert.equal(state.doc.toString(), 'rules: []')
    assert.equal(redo(editor), true, 'both diff modes must redo typed edits')
    assert.equal(state.doc.toString(), 'rules: [MATCH,DIRECT]')
    const bindings = state.facet(keymap).flat()
    assert.ok(bindings.some(binding => binding.key === 'Mod-z'))
    assert.ok(bindings.some(binding => binding.key === 'Tab'))
  }
}
console.log('PASS: diff editor undo/redo and keyboard bindings in both layouts and themes')
