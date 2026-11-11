const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function load(file, dependencies = {}) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText
  new vm.Script(`(function(exports, require){${code}\n})`, { filename: file }).runInThisContext()(exports, name => {
    if (name in dependencies) return dependencies[name]
    const target = name.startsWith('@shared/') ? path.resolve('src/shared', name.slice(8) + '.ts')
      : name.startsWith('.') ? path.resolve(path.dirname(file), name + '.ts') : null
    if (name.startsWith('.') && name.endsWith('.json')) return require(path.resolve(path.dirname(file), name))
    return target && fs.existsSync(target) ? load(target, dependencies) : require(name)
  })
  return exports
}

module.exports = { loadTypeScript: load }
