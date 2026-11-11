const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')

const calls = [], files = new Map()
let trusted = true
const runner = 'C:\\Program Files\\Qzyrium & clash\\resources\\files\\qzyrium-run.exe'
const runtime = { platform: 'win32', execPath: 'C:\\Program Files\\Qzyrium & clash\\Qzyrium-clash.exe', env: { SystemRoot: 'C:\\Windows' } }
const deps = {
  child_process: { execFileSync(file, args, options) {
    calls.push({ file, args })
    assert.equal(options.windowsHide, true)
    if (file === runner && !trusted) throw new Error('unsafe ACL')
  } },
  fs: { existsSync: () => true, unlinkSync() {}, writeFileSync: (file, content, options) => {
    if (Buffer.isBuffer(content)) {
      assert.equal(path.dirname(file), path.dirname(runner), 'task XML is protected from replacement before import')
      assert.equal(options.flag, 'wx')
    }
    files.set(file, content)
  } },
  'node:crypto': require('node:crypto'),
  path,
  electron: { app: { isPackaged: true } },
  './paths': { getAppPaths: () => ({ tasksDir: 'tasks', runnerBinaryPath: runner }) },
  './logger': { logger: { warn() {}, info() {} } }
}
const exportsObject = {}
const code = ts.transpileModule(fs.readFileSync('src/main/utils/elevate-task.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
}).outputText
new Function('exports', 'require', 'process', code)(exportsObject, name => deps[name], runtime)
assert.equal(exportsObject.createElevateTaskSync(), true)
assert.ok(calls.some(call => call.args.includes('Qzyrium-clash-run') && call.args.includes('/delete')), 'legacy privileged task is removed')
assert.deepEqual(calls.find(call => call.file === runner).args, ['--check-install', runtime.execPath])
const xml = [...files.values()].find(Buffer.isBuffer).toString('utf16le')
assert.ok(xml.includes('Qzyrium &amp; clash'), 'paths are escaped as XML')
assert.ok(xml.includes('resources\\files\\qzyrium-run.exe'), 'task runs the installed binary')
assert.ok(!xml.includes('tasks\\qzyrium-run.exe'), 'task never executes a userData binary')
trusted = false
calls.length = 0
assert.equal(exportsObject.createElevateTaskSync(), false)
assert.ok(!calls.some(call => call.args.includes('/create')), 'writable installations cannot register privileged tasks')
assert.equal(exportsObject.tryRunElevateTask(['--inspect=9229', '--admin-restart=123', 'qzyrium://install-config?url=a%20b', 'bad\nargument']), true)
assert.equal(files.get(path.join('tasks', 'param.txt')), '--admin-restart=123\nqzyrium://install-config?url=a%20b')

if (process.platform === 'win32') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qzyrium-runner-test-'))
  const csc = path.join(process.env.SystemRoot, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')
  const binary = path.join(root, 'tests.exe')
  execFileSync(csc, ['/nologo', '/target:exe', '/main:RunnerTests', `/out:${binary}`,
    path.resolve('scripts/runner/Program.cs'), path.resolve('scripts/runner/Tests.cs')], { windowsHide: true })
  execFileSync(binary, [root], { windowsHide: true, stdio: 'pipe' })
}
console.log('PASS: protected installed runner, legacy task removal, XML escaping and privileged argument allowlist')
