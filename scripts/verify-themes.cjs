const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function load(file, dependencies = {}) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX }
  }).outputText
  const requireModule = (name) => {
    if (dependencies[name]) return dependencies[name]
    const target = name.startsWith('@shared/')
      ? path.resolve('src/shared', name.slice(8) + '.ts')
      : name.startsWith('.')
        ? path.resolve(path.dirname(file), name + '.ts')
        : null
    return target && fs.existsSync(target) ? load(target, dependencies) : require(name)
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
const { validateThemePack, validateThemeInput, uniqueThemeId } = load('src/shared/theme-validation.ts')

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
validateThemePack(pack)
for (const invalid of [null, [], {}, { ...pack, mode: 'auto' }, { ...pack, id: 'Dark' },
  { ...pack, id: 'con' }, { ...pack, id: 'a'.repeat(65) }, { ...pack, colors: [] },
  { ...pack, colors: { '--background': 42 } }, { ...pack, colors: { '--background': '#zzzzzz' } },
  { ...pack, colors: { '--background': 'notacolor' } }, { ...pack, colors: { '--unknown': '#123' } },
  { ...pack, colors: { '--background': 'url(https://example.com)' } },
  { ...pack, colors: { '--background': 'var(--card)', '--card': 'var(--background)' } },
  { ...pack, colors: { '--radius': '-1rem' } }, { ...pack, titleBarOverlay: { color: '#fff', symbolColor: 'bad' } }
]) assert.throws(() => validateThemePack(invalid))
validateThemeInput({ colors: { '--primary': 'hsl(42 95% 75%)' } })
assert.equal(uniqueThemeId('My Theme', ['my-theme']), 'my-theme-2')
assert.equal(uniqueThemeId('MY-THEME', ['My-Theme']), 'my-theme-2')
assert.equal(uniqueThemeId('Dark', []), 'dark-2')
assert.equal(uniqueThemeId('CON', []), 'con-2')
assert.equal(uniqueThemeId('a'.repeat(200), ['a'.repeat(64)]).length, 64)
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
assert.throws(() => store.saveTheme({ ...pack, colors: { '--background': 42 } }))
assert.throws(() => store.saveTheme({ ...pack, id: 'CUSTOM-NEON' }))
for (const [filename, content] of Object.entries({
  'broken.json': '{', 'bad-palette.json': JSON.stringify({ ...pack, id: 'bad-palette', colors: { '--background': 42 } }),
  'mismatch.json': JSON.stringify(pack), 'huge.json': ' '.repeat(256 * 1024 + 1)
})) fs.writeFileSync(path.join(tmpDir, 'themes', filename), content)
assert.deepEqual(store.listThemes().map(theme => theme.id), ['custom-neon'])
assert.deepEqual(store.getSkippedFiles(), ['bad-palette.json', 'broken.json', 'huge.json', 'mismatch.json'])

// Delete theme
const afterDelete = store.deleteTheme('custom-neon')
assert.deepEqual(afterDelete, [])
assert.deepEqual(store.listThemes(), [])

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true })

console.log('PASS: Custom theme persistence, color parsing, deepMerge, normalization, and theme resolution')

// Exercise the real import callback with dialog/storage failures and corrupt caches.
async function verifyImports() {
  let fileContent, saved
  global.CSS = { supports: () => true }
  global.localStorage = { getItem: () => '{}', setItem: () => {} }
  global.window = { api: { theme: {
    openConfigFile: async () => ({ content: fileContent }),
    saveCustomTheme: async pack => { saved = pack; return [pack] }
  } } }
  const { CustomThemesProvider } = load('src/renderer/src/providers/CustomThemesProvider.tsx', {
    react: { ...require('react'), useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
      useEffect: () => {}, useCallback: fn => fn, useMemo: fn => fn() },
    '../i18n': { useTranslations: () => (key, values) => key === 'themeCopyName' ? `${values.name} (copy)` : key }
  })
  const context = CustomThemesProvider({ children: null }).props.value
  assert.deepEqual(context.customThemes, [], 'non-array cache must not crash startup')
  fileContent = JSON.stringify({ id: 'Dark', mode: 'dark', colors: { '--primary': '#123456' } })
  assert.equal(await context.uploadTheme(), 'ok')
  assert.equal(saved.id, 'dark-2')
  fileContent = JSON.stringify({ mode: 'invalid' })
  assert.equal(await context.uploadTheme(), 'invalid')
  fileContent = ' '.repeat(256 * 1024 + 1)
  assert.equal(await context.uploadTheme(), 'invalid')
  const original = { id: 'My-Theme', name: 'Original theme', mode: 'dark', colors: { '--primary': '#123456' } }
  localStorage.getItem = () => JSON.stringify([original])
  const conflictContext = CustomThemesProvider({ children: null }).props.value
  fileContent = JSON.stringify({ id: 'MY-THEME', name: 'Updated theme', mode: 'light', colors: { '--primary': '#654321' } })
  saved = null
  assert.equal(await conflictContext.uploadTheme(), 'cancelled', 'duplicates require an explicit decision')
  assert.equal(saved, null)
  assert.equal(await conflictContext.uploadTheme(async theme => {
    assert.equal(theme.id, original.id)
    return 'cancel'
  }), 'cancelled')
  assert.equal(saved, null, 'cancelling must not write a theme')
  let resolveChoice
  const pendingImport = conflictContext.uploadTheme(() => new Promise(resolve => { resolveChoice = resolve }))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(saved, null, 'the file stays unchanged while the decision is pending')
  resolveChoice('replace')
  assert.equal(await pendingImport, 'ok')
  assert.equal(saved.id, original.id, 'replacement preserves the exact ID, including casing')
  assert.equal(saved.name, 'Updated theme')
  assert.equal(saved.mode, 'light')
  assert.equal(saved.colors['--primary'], '#654321')
  assert.equal(await conflictContext.uploadTheme(async () => 'copy'), 'ok')
  assert.equal(saved.id, 'my-theme-2')
  assert.equal(saved.name, 'Updated theme (copy)')
  assert.equal(original.colors['--primary'], '#123456')
  fileContent = JSON.stringify({ id: 'my theme', mode: 'dark' })
  assert.equal(await conflictContext.uploadTheme(async () => 'replace'), 'ok', 'normalized IDs match existing themes')
  assert.equal(saved.id, original.id)
  fileContent = JSON.stringify({ name: 'My Theme', mode: 'dark' })
  assert.equal(await conflictContext.uploadTheme(async () => 'replace'), 'ok', 'imports without IDs match by generated ID')
  assert.equal(saved.id, original.id)
  window.api.theme.openConfigFile = async () => { throw new Error('Read failed') }
  await assert.rejects(context.uploadTheme(), /Read failed/)
  window.api.theme.openConfigFile = async () => ({ content: '{"mode":"dark"}' })
  window.api.theme.saveCustomTheme = async () => { throw new Error('Write failed') }
  await assert.rejects(context.uploadTheme(), /Write failed/)
  console.log('PASS: import validation, reserved IDs, corrupt cache, replace/copy/cancel conflicts and file errors')
}
verifyImports().catch(error => { console.error(error); process.exitCode = 1 })
