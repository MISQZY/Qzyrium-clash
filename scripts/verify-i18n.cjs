const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '../src/renderer/src/i18n')
const placeholders = (text) => [...new Set([...text.matchAll(/(?<!\{)\{(\w+)\}(?!\})/g)].map((match) => match[1]))].sort()
let count = 0
for (const namespace of fs.readdirSync(path.join(root, 'messages/en'))) {
  const en = JSON.parse(fs.readFileSync(path.join(root, 'messages/en', namespace)))
  const ru = JSON.parse(fs.readFileSync(path.join(root, 'messages/ru', namespace)))
  assert.deepEqual(Object.keys(ru).sort(), Object.keys(en).sort(), `${namespace}: missing translation`)
  for (const [key, value] of Object.entries(en)) {
    const forms = typeof value === 'string' ? [value] : Object.values(value)
    const translated = typeof ru[key] === 'string' ? [ru[key]] : Object.values(ru[key])
    assert.ok(forms.every((text) => typeof text === 'string' && text.trim()), `${namespace}.${key}: empty English translation`)
    assert.ok(translated.every((text) => typeof text === 'string' && text.trim()), `${namespace}.${key}: empty translation`)
    assert.ok(translated.every((text) => !/\?{2,}/.test(text)), `${namespace}.${key}: damaged encoding`)
    for (const text of [...forms, ...translated]) assert.ok(!/\uFFFD|Ã.|Â.|â€/.test(text), `${namespace}.${key}: damaged UTF-8`)
    for (const text of translated) assert.deepEqual(placeholders(text), placeholders(forms[0]), `${namespace}.${key}: placeholders differ`)
    if (typeof value !== 'string') for (const category of ['one', 'few', 'many', 'other']) assert.ok(ru[key][category], `${namespace}.${key}: missing Russian plural ${category}`)
    count++
  }
}
const nativeEn = require('../src/shared/locales/en.json'), nativeRu = require('../src/shared/locales/ru.json')
assert.deepEqual(Object.keys(nativeEn).sort(), Object.keys(nativeRu).sort())
for (const messages of [nativeEn, nativeRu]) assert.ok(Object.values(messages).every(value => typeof value === 'string' && value.trim()), 'empty native translation')

// Exercise the actual translation engine without requiring a browser or a TS loader.
const filename = path.join(root, 'catalogs.ts')
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
const loaded = new Module(filename, module)
loaded.filename = filename
loaded.paths = Module._nodeModulePaths(root)
loaded._compile(compiled, filename)
const { translate, catalogs } = loaded.exports
for (const locale of ['en', 'ru']) {
  for (const [namespace, messages] of Object.entries(catalogs[locale])) {
    for (const [key, message] of Object.entries(messages)) {
      for (const count of typeof message === 'string' ? [1] : [0, 1, 2, 5, 11, 21, 22]) {
        const form = typeof message === 'string' ? message : message[new Intl.PluralRules(locale).select(count)] ?? message.other
        const values = Object.fromEntries(placeholders(form).map((name) => [name, name === 'count' ? count : `test-${name}`]))
        const result = translate(locale, namespace, key, values)
        assert.ok(result.trim() && result !== key, `${locale}.${namespace}.${key}: translation engine fallback`)
        assert.deepEqual(placeholders(result), [], `${locale}.${namespace}.${key}: unresolved interpolation`)
      }
    }
  }
}
assert.ok(translate('en', 'networksettings', 'pacScriptHint', { host: 'example', port: 1234 }).includes('{{host}}, {{port}}'), 'PAC syntax placeholders are literal code')
for (const [sessions, suffix] of [[0, 'соединений'], [1, 'соединение'], [2, 'соединения'], [5, 'соединений'], [11, 'соединений'], [21, 'соединение'], [22, 'соединения'], [25, 'соединений']]) {
  assert.equal(translate('ru', 'connections', 'sessions', { count: sessions }), `${sessions} ${suffix}`)
}
assert.equal(translate('en', 'connections', 'sessions', { count: 1 }), '1 session')
assert.equal(translate('en', 'connections', 'sessions', { count: 2 }), '2 sessions')
assert.equal(translate('ru', 'proxies', 'selectNode', { name: '{remote-name}' }), 'Выбрать {remote-name}')
assert.equal(translate('ru', 'rules', 'pagination', { page: 2, total: 5 }), 'Страница 2 из 5')
assert.equal(translate('en', 'common', 'settings'), 'Settings')
assert.equal(translate('ru', 'common', 'settings'), 'Настройки')
// Audit static JSX text, accessible labels and literal translation calls. Product
// names and configuration syntax are intentionally the same in both languages.
const invariantText = new Set(['Qzyrium', '- clash', 'TUN', 'PAC', 'gVisor', 'v', 'no-resolve', 'src', 'Monaco Editor (VS Code)'])
const humanAttributes = new Set(['title', 'placeholder', 'aria-label', 'alt'])
let calls = 0, sources = 0
function auditDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'i18n' || entry.name === 'assets') continue
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) { auditDirectory(file); continue }
    if (!/\.tsx?$/.test(file)) continue
    sources++
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const bindings = new Map()
    const locate = (node) => `${path.relative(process.cwd(), file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`
    function collect(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText() === 'useTranslations') {
        const argument = node.initializer.arguments[0]
        if (argument && ts.isStringLiteral(argument)) {
          assert.ok(catalogs.en[argument.text], `${locate(node)}: unknown namespace`)
          const namespaces = bindings.get(node.name.text) ?? new Set()
          namespaces.add(argument.text)
          bindings.set(node.name.text, namespaces)
        }
      }
      ts.forEachChild(node, collect)
    }
    collect(source)
    function visit(node) {
      if (ts.isJsxText(node)) {
        const text = node.text.replace(/\s+/g, ' ').trim()
        if (/[\p{L}]/u.test(text)) assert.ok(invariantText.has(text), `${locate(node)}: hardcoded UI text ${JSON.stringify(text)}`)
      }
      if (ts.isJsxAttribute(node) && humanAttributes.has(node.name.getText()) && node.initializer && ts.isStringLiteral(node.initializer)) {
        const text = node.initializer.text
        assert.ok(!text || invariantText.has(text) || /^https?:\/\/[.\d:/?=&%_-]*$/.test(text), `${locate(node)}: hardcoded ${node.name.getText()} ${JSON.stringify(text)}`)
      }
      if (ts.isConditionalExpression(node) && /\blocale\b|\.language\b|\bis(?:Ru|En)\b/.test(node.condition.getText())) {
        for (const branch of [node.whenTrue, node.whenFalse]) {
          if (ts.isStringLiteral(branch) || ts.isNoSubstitutionTemplateLiteral(branch)) {
            assert.ok(!/[\p{L}]+\s+[\p{L}]+/u.test(branch.text), `${locate(branch)}: inline language-dependent UI text; use a catalog`)
          }
        }
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const namespaces = bindings.get(node.expression.text)
        const key = node.arguments[0]
        if (namespaces && key && ts.isStringLiteral(key)) {
          assert.ok([...namespaces].some((namespace) => Object.hasOwn(catalogs.en[namespace], key.text) && Object.hasOwn(catalogs.ru[namespace], key.text)), `${locate(node)}: missing translation ${key.text}`)
          calls++
        }
        if (node.expression.text === 'translate' && node.arguments[1] && ts.isStringLiteral(node.arguments[1]) && node.arguments[2] && ts.isStringLiteral(node.arguments[2])) {
          const namespace = node.arguments[1].text, key = node.arguments[2].text
          assert.ok(catalogs.en[namespace]?.[key] && catalogs.ru[namespace]?.[key], `${locate(node)}: missing translation ${namespace}.${key}`)
          calls++
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
}
auditDirectory(path.resolve(root, '..'))
const fieldsPath = path.resolve(root, '../../../shared/settings-fields.ts')
const fieldsModule = new Module(fieldsPath, module)
fieldsModule.filename = fieldsPath
fieldsModule.paths = Module._nodeModulePaths(path.dirname(fieldsPath))
fieldsModule._compile(ts.transpileModule(fs.readFileSync(fieldsPath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, fieldsPath)
for (const fields of Object.values(fieldsModule.exports).filter(Array.isArray)) {
  for (const field of fields) {
    assert.ok(field.label.en?.trim() && field.label.ru?.trim(), `${field.key}: missing field label`)
    if (field.description) assert.ok(field.description.en?.trim() && field.description.ru?.trim(), `${field.key}: missing field help`)
  }
}
console.log(`PASS: ${count} matching RU/EN messages; all messages rendered, plurals, interpolation, ${calls} translation calls, ${sources} source files audited, settings labels and help`)
