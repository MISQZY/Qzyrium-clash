const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function load(file, dependencies = {}) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText
  const requireModule = (name) => {
    if (dependencies[name]) return dependencies[name]
    const target = name.startsWith('@shared/')
      ? path.resolve('src/shared', name.slice(8) + '.ts')
      : name.startsWith('.')
        ? path.resolve(path.dirname(file), name + '.ts')
        : null
    return target && fs.existsSync(target) ? load(target) : require(name)
  }
  vm.runInThisContext(`(function(exports, require, process) {\n${code}\n})`, { filename: file })(exports, requireModule, process)
  return exports
}

const tmpDir = path.resolve(__dirname, '../artifacts/theme-test')
fs.rmSync(tmpDir, { recursive: true, force: true })
fs.mkdirSync(tmpDir, { recursive: true })

const { ThemeStore } = load('src/main/services/ThemeStore.ts')
const { BUILTIN_THEMES, DEFAULT_DARK_THEME_ID } = load('src/shared/theme.ts')
const { cssColorToHex, deriveTitleBarOverlay } = load('src/renderer/src/lib/color.ts')
const { slugify, uniqueUrlKey } = load('src/renderer/src/lib/slug.ts')
const { deepMerge, normalizeThemePack, resolveTheme } = load('src/renderer/src/lib/theme.ts')

// 1. Test color utilities
assert.equal(cssColorToHex('#123'), '#112233')
assert.equal(cssColorToHex('#123456'), '#123456')
assert.ok(cssColorToHex('oklch(0.155 0.003 165)')?.startsWith('#'))
assert.equal(cssColorToHex('invalid'), null)

const derived = deriveTitleBarOverlay({
  '--sidebar': '#202020',
  '--muted-foreground': '#808080'
}, { color: '#000', symbolColor: '#fff' })
assert.equal(derived.color, '#202020')
assert.equal(derived.symbolColor, '#808080')

// 2. Test slugify and uniqueUrlKey
assert.equal(slugify('My Super Cool Theme!'), 'my-super-cool-theme')
assert.equal(slugify('   '), 'theme')
assert.equal(uniqueUrlKey('My Theme', ['my-theme']), 'my-theme-2')
assert.equal(uniqueUrlKey('My Theme', ['my-theme', 'my-theme-2']), 'my-theme-3')

// 3. Test deepMerge and normalizeThemePack
const merged = deepMerge({ a: 1, nested: { b: 2, c: 3 } }, { nested: { c: 4, d: 5 }, e: 6 })
assert.deepEqual(merged, { a: 1, nested: { b: 2, c: 4, d: 5 }, e: 6 })

const pack = {
  id: 'custom-neon',
  name: 'Neon Cyber',
  mode: 'dark',
  colors: {
    '--primary': '#00ffcc',
    '--background': '#050505'
  }
}
const normalized = normalizeThemePack(pack)
assert.equal(normalized.colors['--primary'], '#00ffcc')
assert.equal(normalized.colors['--background'], '#050505')
// Should inherit missing fields from dark base theme
assert.ok(normalized.colors['--foreground'])
assert.ok(normalized.titleBarOverlay)

// 4. Test resolveTheme
assert.equal(resolveTheme('dark', BUILTIN_THEMES).id, 'dark')
assert.equal(resolveTheme('light', BUILTIN_THEMES).id, 'light')
const allThemes = [...BUILTIN_THEMES, normalized]
assert.equal(resolveTheme('custom-neon', allThemes).id, 'custom-neon')
assert.equal(resolveTheme('non-existent', allThemes).id, DEFAULT_DARK_THEME_ID)

// 5. Test ThemeStore persistence
const store = new ThemeStore(tmpDir)
assert.deepEqual(store.listThemes(), [])

store.saveTheme(pack)
const loadedThemes = store.listThemes()
assert.equal(loadedThemes.length, 1)
assert.equal(loadedThemes[0].id, 'custom-neon')
assert.equal(loadedThemes[0].name, 'Neon Cyber')
assert.equal(loadedThemes[0].colors['--primary'], '#00ffcc')

// Path traversal prevention
assert.throws(() => store.saveTheme({ ...pack, id: '../escaped' }))
assert.throws(() => store.deleteTheme('../escaped'))

// Delete theme
const afterDelete = store.deleteTheme('custom-neon')
assert.deepEqual(afterDelete, [])
assert.deepEqual(store.listThemes(), [])

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true })

console.log('PASS: Custom theme persistence, color parsing, deepMerge, normalization, and theme resolution')
