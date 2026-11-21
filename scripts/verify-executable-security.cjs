const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const ts = require('typescript')
const { spawnSync, execFileSync } = require('node:child_process')
const { loadTypeScript: load } = require('./fixtures/typescript.cjs')

const source = fs.readFileSync('src/main/utils/executable-security.ts', 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
const store = 'C:\\ProgramData\\Qzyrium-clash\\cores\\win32-x64'
function fixture({ packaged = true, elevated = true, allowed = true } = {}) {
  const calls = [], api = {}, requests = []
  const runtime = { platform: 'win32', arch: 'x64', execPath: 'C:\\Program Files\\Qzyrium-clash\\Qzyrium-clash.exe',
    env: { SystemRoot: 'C:\\attacker', PATH: 'C:\\attacker', ProgramData: 'C:\\attacker' },
    report: { getReport: () => ({ sharedObjects: ['C:\\Windows\\System32\\ntdll.dll'] }) } }
  const deps = {
    electron: { app: { isPackaged: packaged } }, 'node:path': path,
    'node:child_process': { execFileSync(binary, args) {
      calls.push({ binary, args })
      assert.ok(binary.startsWith('C:\\Windows\\System32\\'), 'security bootstrap must ignore attacker-controlled environment')
      const script = Buffer.from(args.at(-1), 'base64').toString('utf16le')
      const request = JSON.parse(Buffer.from(script.match(/FromBase64String\('([^']+)'\)/)[1], 'base64').toString('utf8'))
      requests.push(request)
      if (request.mode === 'elevation') return String(elevated)
      if (request.mode === 'verify' && !allowed) throw new Error('writable ACL')
      return request.mode === 'store' ? store : ''
    } }
  }
  new Function('exports', 'require', 'process', code)(api, name => deps[name] ?? require(name), runtime)
  return { api, calls, requests, runtime }
}

function verifyGuardsAndMigration() {
  const trusted = fixture()
  assert.equal(trusted.api.getProtectedCoreStore(), store)
  assert.equal(trusted.requests.at(-1).create, false, 'path reads never create/modify ProgramData')
  trusted.api.ensureProtectedCoreStore()
  assert.equal(trusted.requests.at(-1).create, true, 'only an explicit installation provisions protected storage')
  trusted.api.assertTrustedExecutable(path.win32.join(store, 'stable', 'mihomo.exe'))
  assert.equal(trusted.requests.at(-1).mode, 'verify')
  const unsafe = fixture({ allowed: false })
  assert.throws(() => unsafe.api.assertTrustedInstallation(), /Unsafe executable/)
  assert.throws(() => unsafe.api.assertTrustedExecutable('C:\\Users\\fixture\\cores\\stable\\mihomo.exe'), /Unsafe executable/)
  const unprivileged = fixture({ elevated: false })
  assert.equal(unprivileged.api.getProtectedCoreStore(), store)
  assert.throws(() => unprivileged.api.ensureProtectedCoreStore(), /administrator/)
  assert.ok(unprivileged.requests.every(request => !request.create))
  const development = fixture({ packaged: false })
  development.api.assertTrustedExecutable('D:\\development\\mihomo.exe')
  development.api.assertTrustedInstallation()
  assert.equal(development.calls.length, 0, 'development and non-Windows execution policy is preserved')
  const unavailable = fixture()
  unavailable.runtime.report = undefined
  assert.throws(() => unavailable.api.assertTrustedExecutable('C:\\anything.exe'), /Unsafe executable location/)

  const existing = new Set(['/userData/cores/stable/mihomo.exe', '/userData/cores/alpha/mihomo.exe', '/app/sidecar/mihomo.exe'])
  const { resolveCoreBinaryPath } = load('src/main/utils/paths.ts', {
    electron: { app: { getPath: () => '/userData', getAppPath: () => '/app', isPackaged: true } },
    './executable-security': { usesProtectedCoreStore: () => true, getProtectedCoreStore: () => '/protected/cores' },
    fs: { existsSync: filename => existing.has(filename.replace(/\\/g, '/')), mkdirSync: filename => {
      assert.ok(!filename.replace(/\\/g, '/').startsWith('/protected'), 'read paths must not create protected storage')
    } }
  })
  assert.equal(resolveCoreBinaryPath('stable').replace(/\\/g, '/'), '/app/sidecar/mihomo.exe')
  assert.equal(resolveCoreBinaryPath('alpha').replace(/\\/g, '/'), '/app/sidecar/mihomo.exe', 'never inspect/copy legacy alpha across elevation')
  existing.add('/protected/cores/alpha/mihomo.exe')
  assert.equal(resolveCoreBinaryPath('alpha').replace(/\\/g, '/'), '/protected/cores/alpha/mihomo.exe')
  existing.add('/protected/cores/alpha/installation.json')
  assert.equal(resolveCoreBinaryPath('alpha').replace(/\\/g, '/'), '/app/sidecar/mihomo.exe', 'unprivileged startup uses bundled core until privileged journal recovery completes')
}

async function verifyExecutionEntryPoints() {
  const checks = [
    ['src/main/services/CoreService.ts', 'assertTrustedExecutable(binaryPath)', "runFile(binaryPath, ['-v']"],
    ['src/main/core/CoreBinaryManager.ts', 'assertTrustedExecutable(candidateBinaryPath)', 'runFile(candidateBinaryPath,'],
    ['src/main/utils/profile-validator.ts', 'assertTrustedExecutable(binary)', 'runFile(binary,'],
    ['src/main/core/MihomoProcessManager.ts', 'assertTrustedExecutable(command)', 'spawn(command,'],
    ['src/main/core/ServiceCheckProxy.ts', 'assertTrustedExecutable(options.binary)', 'spawn(options.binary,'],
    ['src/main/utils/network-watchdog.ts', 'assertTrustedExecutable(binary)', 'spawn(binary,'],
    ['src/main/utils/elevate-task.ts', 'assertTrustedExecutable(targetRunner, true)', "execFileSync(targetRunner, ['--check-install'"]
  ]
  for (const [filename, guard, execution] of checks) {
    const text = fs.readFileSync(filename, 'utf8')
    assert.ok(text.includes(guard) && text.indexOf(guard) < text.indexOf(execution), `${filename}: guard precedes process execution`)
  }
  let executions = 0
  const reject = () => { throw new Error('unsafe fixture binary') }
  const { CoreService } = load('src/main/services/CoreService.ts', {
    '../utils/executable-security': { assertTrustedExecutable: reject },
    '../utils/paths': {}, '../utils/logger': { logger: { warn() {} } },
    'node:fs': { existsSync: () => true },
    'node:child_process': { execFile: () => { executions++ } }
  })
  const result = await new CoreService({}, {}).inspectBinary('C:\\Users\\fixture\\mihomo.exe')
  assert.equal(result.version, 'unknown')
  assert.equal(executions, 0, 'unsafe executable must not run even for version inspection')

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qzyrium-blocked-execution-'))
  try {
    const paths = { mihomoDir: directory, coreBinaryPath: path.join(directory, 'mihomo.exe'), geoFilesDir: directory }
    const blocked = { assertTrustedExecutable: reject }
    const dependencies = {
      '../utils/executable-security': blocked, './executable-security': blocked,
      '../utils/paths': { getAppPaths: () => paths }, './paths': { getAppPaths: () => paths, resolveCoreBinaryPath: () => paths.coreBinaryPath },
      '../utils/logger': { logger: { info() {}, warn() {}, error() {}, debug() {} } }, './logger': { logger: { info() {}, warn() {}, error() {}, debug() {} } },
      '../core/installGeoResources': { installGeoResources: async () => {} },
      '../core/MihomoConfigFactory': { MihomoConfigFactory: { synthesize: () => 'rules: []' } },
      'node:child_process': { execFile: () => { executions++ }, spawn: () => { executions++; throw new Error('unexpected spawn') } },
      child_process: { execFile: () => { executions++ }, spawn: () => { executions++; throw new Error('unexpected spawn') } }
    }
    const { prepareProfileContent } = load('src/main/utils/profile-validator.ts', dependencies)
    await assert.rejects(prepareProfileContent('rules: []', { kernel: {} }), /unsafe fixture binary/)
    const { CoreBinaryManager } = load('src/main/core/CoreBinaryManager.ts', dependencies)
    const manager = new CoreBinaryManager({ getSettings: () => ({ kernel: {} }) }, { getActiveProfile: () => null }, { prepare: async () => 'rules: []' })
    await assert.rejects(manager.testCandidate(paths.coreBinaryPath, 'stable'), /unsafe fixture binary/)
    const { MihomoProcessManager } = load('src/main/core/MihomoProcessManager.ts', dependencies)
    fs.writeFileSync(paths.coreBinaryPath, 'not an executable')
    const processManager = new MihomoProcessManager()
    processManager.setBinaryPath(paths.coreBinaryPath)
    await assert.rejects(processManager.start(directory, path.join(directory, 'config.yaml'), 9090, ''), /unsafe fixture binary/)
    const { withServiceCheckProxy } = load('src/main/core/ServiceCheckProxy.ts', dependencies)
    const configPath = path.join(directory, 'config.yaml')
    fs.writeFileSync(configPath, 'proxies: []\nproxy-groups: []\n')
    await assert.rejects(withServiceCheckProxy({ binary: paths.coreBinaryPath, mihomoDir: directory, configPath, name: 'DIRECT', proxies: {}, signal: new AbortController().signal }, () => {}), /unsafe fixture binary/)
    if (process.platform === 'win32') {
      const { NetworkWatchdog } = load('src/main/utils/network-watchdog.ts', dependencies)
      await assert.rejects(new NetworkWatchdog().start(), /unsafe fixture binary/)
    }
    assert.equal(executions, 0, 'all unsafe -v, -t and spawn entrypoints stop before OS execution')
    assert.ok(!fs.readdirSync(directory).some(name => name.startsWith('.validate-') || name.startsWith('.test-core-') || name.startsWith('service-check-')), 'blocked operations clean their temporary configurations')
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

function verifyWindowsPolicyAndElectron() {
  if (process.platform !== 'win32') return
  const security = fixture().api
  // Read-only OS checks and synthetic ACLs. Never provision the real core store
  // or change the installed application's permissions during verification.
  const actual = {}
  new Function('exports', 'require', 'process', code)(actual, name => name === 'electron' ? { app: { isPackaged: false } } : require(name), process)
  const powershell = actual.trustedSystemBinary('WindowsPowerShell/v1.0/powershell.exe')
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qzyrium-executable-security-'))
  try {
    const file = path.join(directory, 'untrusted.exe')
    fs.writeFileSync(file, 'never execute this fixture')
    const junction = path.join(directory, 'junction')
    fs.mkdirSync(path.join(directory, 'junction-target'))
    fs.symlinkSync(path.join(directory, 'junction-target'), junction, 'junction')
    const payload = Buffer.from(file).toString('base64')
    const policyDefinitions = security.WINDOWS_EXECUTABLE_POLICY.split("if ($request.mode -eq 'elevation')")[0]
    const script = `${policyDefinitions}
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))
$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')),'FullControl','Allow')))
Test-AclPolicy $acl $false
$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-545')),'ReadAndExecute','Allow')))
Test-AclPolicy $acl $false
$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-545')),'CreateDirectories','Allow')))
Test-AclPolicy $acl $true
$rejected = $false; try { Test-AclPolicy $acl $false } catch { $rejected = $true }
if (-not $rejected) { throw 'Writable runtime accepted' }
$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-545')),'DeleteSubdirectoriesAndFiles','Allow')))
$rejected = $false; try { Test-AclPolicy $acl $true } catch { $rejected = $true }
if (-not $rejected) { throw 'Replaceable ancestor accepted' }
$acl.SetOwner([Security.Principal.WindowsIdentity]::GetCurrent().User)
$rejected = $false; try { Test-AclPolicy $acl $false } catch { $rejected = $true }
if (-not $rejected) { throw 'Unprivileged owner accepted' }
foreach ($rights in @('GA', 'GW')) {
  $generic = New-Object Security.AccessControl.DirectorySecurity
  $generic.SetSecurityDescriptorSddlForm('O:BAG:BAD:(A;;' + $rights + ';;;AU)')
  $rejected = $false; try { Test-AclPolicy $generic $false } catch { $rejected = $true }
  if (-not $rejected) { throw ('Generic write rights accepted: ' + $rights) }
}
Assert-Location ([Environment]::GetFolderPath('CommonApplicationData')) ''
Assert-Location '${powershell.replace(/'/g, "''")}' ([Environment]::GetFolderPath('Windows'))
$fixtureFile = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}'))
$rejected = $false; try { Assert-Location $fixtureFile } catch { $rejected = $true }
if (-not $rejected) { throw 'Writable temp executable accepted' }
$rejected = $false; try { Assert-Location '${junction.replace(/'/g, "''")}' } catch { $rejected = $_.Exception.Message -match 'reparse' }
if (-not $rejected) { throw 'Reparse-point executable location accepted' }
Write-Output 'PASS: native ACL policy'
`
    const output = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8', timeout: 30_000 })
    assert.match(output, /PASS: native ACL policy/)

    const electronScript = path.join(directory, 'electron-main.cjs')
    const resultFile = path.join(directory, 'report.json')
    fs.writeFileSync(electronScript, `const { app } = require('electron');
      app.setPath('userData', ${JSON.stringify(path.join(directory, 'userData'))});
      const report = process.report.getReport();
      require('node:fs').writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify(report.sharedObjects.filter(name => /[\\\\/]ntdll\\.dll$/i.test(name))));
      app.quit();`)
    const electronEnv = { ...process.env }
    delete electronEnv.ELECTRON_RUN_AS_NODE
    const child = spawnSync(require('electron'), [electronScript], { windowsHide: true, timeout: 30_000, encoding: 'utf8', env: electronEnv })
    assert.equal(child.status, 0, child.stderr || child.error?.message)
    assert.equal(JSON.parse(fs.readFileSync(resultFile, 'utf8')).length, 1, 'KnownDLL path must be available in an actual Electron main process')
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

Promise.resolve().then(verifyGuardsAndMigration).then(verifyExecutionEntryPoints).then(verifyWindowsPolicyAndElectron)
  .then(() => console.log('PASS: protected core migration, elevation guards, immutable OS bootstrap, native ACL policy and Electron main compatibility'))
  .catch(error => { console.error(error); process.exitCode = 1 })
