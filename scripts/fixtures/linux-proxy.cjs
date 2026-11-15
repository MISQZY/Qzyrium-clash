const fs = require('node:fs')
const ts = require('typescript')

function loadLinuxProxy(execute, env = {}, filename) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync('src/main/utils/linux-proxy.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText
  new Function('exports', 'require', 'process', code)(exports, name => {
    if (name === 'node:util') return { promisify: () => execute }
    if (name === './logger') return { logger: { info() {}, warn() {}, error() {} } }
    if (name === './paths') return { getAppPaths: () => { throw new Error('Tests must not access userData') } }
    if (name === './atomicWrite') return require('./typescript.cjs').loadTypeScript('src/main/utils/atomicWrite.ts')
    if (name === '../../../resources/linux-proxy-recovery.cjs') return require('../../resources/linux-proxy-recovery.cjs')
    return require(name)
  }, { platform: 'linux', env })
  return new exports.LinuxProxySettings(filename ? () => filename : undefined)
}

module.exports = { loadLinuxProxy }
