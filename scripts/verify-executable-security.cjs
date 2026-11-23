const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const ts = require('typescript')
const { createHash } = require('node:crypto')
const { spawnSync, execFileSync } = require('node:child_process')
const { loadTypeScript: load } = require('./fixtures/typescript.cjs')

const source = fs.readFileSync('src/main/utils/executable-security.ts', 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
const runtimeRoot = 'C:\\ProgramData\\Qzyrium-clash\\runtime\\win32-x64'
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
function fixture({ packaged = true, elevated = true, pins = {}, protectedSource = false } = {}) {
  const calls = [], requests = [], cache = new Map(), api = {}
  const runtime = { platform: 'win32', arch: 'x64', execPath: 'D:\\Portable\\Qzyrium-clash.exe',
    env: { SystemRoot: 'C:\\attacker', PATH: 'C:\\attacker', ProgramData: 'C:\\attacker' },
    report: { getReport: () => ({ sharedObjects: ['C:\\Windows\\System32\\ntdll.dll'] }) } }
  const deps = {
    electron: { app: { isPackaged: packaged } }, 'node:path': path,
    'node:child_process': { execFileSync(binary, args) {
      calls.push({ binary, args })
      assert.ok(binary.startsWith('C:\\Windows\\System32\\'), 'bootstrap ignores writable environment variables')
      const script = Buffer.from(args.at(-1), 'base64').toString('utf16le')
      const request = JSON.parse(Buffer.from(script.match(/FromBase64String\('([^']+)'\)/)[1], 'base64').toString('utf8'))
      requests.push(request)
      if (request.mode === 'elevation') return String(elevated)
      if (request.mode === 'directory') return runtimeRoot
      if (request.mode === 'installation' || request.mode === 'verify') {
        if (!protectedSource) throw new Error('writable installation')
        return ''
      }
      assert.equal(request.mode, 'stage')
      const bytes = fs.readFileSync(request.filename)
      assert.equal(sha256(bytes), request.digest)
      const key = `${request.digest}/${request.role}`
      if (cache.has(key)) assert.equal(sha256(cache.get(key)), request.digest)
      else {
        if (!request.approved && !protectedSource) throw new Error('unverified source')
        cache.set(key, Buffer.from(bytes))
      }
      const names = { core: 'mihomo.exe', runner: 'qzyrium-run.exe', watchdog: 'qzyrium-watchdog.exe' }
      return path.win32.join(runtimeRoot, request.digest, names[request.role])
    } }
  }
  new Function('exports', 'require', 'process', '__QZYRIUM_EXECUTABLE_PINS__', code)(api, name => deps[name] ?? require(name), runtime, pins)
  return { api, calls, requests, cache, runtime }
}

function verifyStagingAndPins(directory) {
  const filename = path.join(directory, 'portable-core.exe')
  const bytes = Buffer.from('verified official fixture executable')
  const digest = sha256(bytes)
  fs.writeFileSync(filename, bytes)
  const unprivileged = fixture({ elevated: false })
  assert.equal(unprivileged.api.getProtectedRuntimeDirectory(), '')
  assert.equal(unprivileged.api.prepareExecutableForExecution(filename, 'core'), filename)
  assert.ok(unprivileged.requests.every(request => request.mode === 'elevation'), 'ordinary launch never accesses protected runtime storage')
  const development = fixture({ packaged: false })
  assert.equal(development.api.prepareExecutableForExecution(filename, 'core'), filename)
  assert.equal(development.api.getProtectedRuntimeDirectory(), '')
  assert.equal(development.calls.length, 0)

  const portable = fixture({ pins: { core: digest } })
  assert.equal(portable.api.getProtectedRuntimeDirectory(), runtimeRoot)
  assert.equal(portable.requests.at(-1).mode, 'directory')
  const target = portable.api.prepareExecutableForExecution(filename, 'core')
  assert.equal(target, path.win32.join(runtimeRoot, digest, 'mihomo.exe'))
  assert.equal(portable.requests.at(-1).approved, true)
  assert.throws(() => portable.api.assertTrustedInstallation(), /verification failed/, 'only the persistent silent task requires a protected installation')
  fs.writeFileSync(filename, 'tampered executable and metadata claiming the old SHA')
  assert.throws(() => portable.api.prepareExecutableForExecution(filename, 'core'), /verification failed/)
  fs.writeFileSync(filename, bytes)
  const downloaded = fixture()
  assert.throws(() => downloaded.api.prepareExecutableForExecution(filename, 'core'), /verification failed/, 'unknown writable source fails before execution')
  downloaded.api.registerVerifiedCore(bytes)
  assert.equal(downloaded.api.prepareExecutableForExecution(filename, 'core'), target)
  assert.throws(() => downloaded.api.prepareExecutableForExecution(filename, 'watchdog'), /verification failed/, 'core provenance cannot approve a helper')
  const approvedCache = fixture()
  approvedCache.cache.set(`${digest}/core`, bytes)
  assert.equal(approvedCache.api.prepareExecutableForExecution(filename, 'core'), target, 'protected cache authenticates the same bytes across restarts')
  approvedCache.cache.set(`${digest}/core`, Buffer.from('corrupt protected entry'))
  assert.throws(() => approvedCache.api.prepareExecutableForExecution(filename, 'core'), /verification failed/)
  const protectedCustom = fixture({ protectedSource: true })
  assert.equal(protectedCustom.api.prepareExecutableForExecution(filename, 'core'), target, 'protected administrator-owned source works from any path without build pins')
  const unavailable = fixture()
  unavailable.runtime.report = undefined
  assert.throws(() => unavailable.api.prepareExecutableForExecution(filename, 'core'), /verification failed/)

  const config = load('electron.vite.config.ts', {
    'electron-vite': { defineConfig: value => value, externalizeDepsPlugin: () => ({}) },
    '@vitejs/plugin-react': () => ({}), '@tailwindcss/vite': () => ({})
  }).default
  const pins = JSON.parse(config.main.define.__QZYRIUM_EXECUTABLE_PINS__)
  const lock = require('./resources.lock.json')
  const bundled = path.resolve('extra/sidecar', process.platform === 'win32' ? 'mihomo.exe' : 'mihomo')
  assert.equal(pins.core, sha256(fs.readFileSync(bundled)))
  assert.equal(pins.core, lock.mihomo.targets[`${process.platform}-${process.arch}`].sha256)
  for (const [role, name] of [['runner', 'qzyrium-run.exe'], ['watchdog', 'qzyrium-watchdog.exe']]) {
    const file = path.resolve('extra/files', name)
    if (fs.existsSync(file)) assert.equal(pins[role], sha256(fs.readFileSync(file)), 'helper pins are exact build bytes embedded in the main bundle')
  }
}

function verifyNetworkFreeDiscovery() {
  for (const original of [false, true]) {
    const { api, runtime } = fixture()
    runtime.report.excludeNetwork = original
    runtime.report.getReport = () => {
      assert.equal(runtime.report.excludeNetwork, true, 'DLL discovery must never perform reverse DNS')
      return { sharedObjects: ['C:\\Windows\\System32\\ntdll.dll'] }
    }
    assert.equal(api.trustedSystemBinary('reg.exe'), 'C:\\Windows\\System32\\reg.exe')
    assert.equal(runtime.report.excludeNetwork, original, 'successful discovery preserves report preferences')

    const failing = fixture()
    failing.runtime.report.excludeNetwork = original
    failing.runtime.report.getReport = () => { throw new Error('report failed') }
    assert.throws(() => failing.api.trustedSystemBinary('reg.exe'), /report failed/)
    assert.equal(failing.runtime.report.excludeNetwork, original, 'failed reports preserve report preferences')
  }
  for (const sharedObjects of [[], ['ntdll.dll']]) {
    const { api, runtime } = fixture()
    runtime.report.getReport = () => ({ sharedObjects })
    assert.throws(() => api.trustedSystemBinary('reg.exe'), /Cannot determine/, 'missing or relative DLL paths fail closed')
  }
}

function verifyNativePolicy(directory) {
  if (process.platform !== 'win32') return
  const actual = {}
  new Function('exports', 'require', 'process', code)(actual, name => name === 'electron' ? { app: { isPackaged: false } } : require(name), process)
  const powershell = actual.trustedSystemBinary('WindowsPowerShell/v1.0/powershell.exe')
  const definitions = actual.WINDOWS_EXECUTABLE_POLICY.split("if ($request.mode -eq 'elevation')")[0]
  const filename = path.join(directory, 'snapshot.exe')
  const bytes = Buffer.from('never execute this native staging fixture')
  fs.writeFileSync(filename, bytes)
  const junction = path.join(directory, 'junction')
  fs.mkdirSync(path.join(directory, 'junction-target'))
  fs.symlinkSync(path.join(directory, 'junction-target'), junction, 'junction')
  const nativeFixture = { filename, junction, root: path.join(directory, 'runtime-fixture'), digest: sha256(bytes), contents: bytes.toString('base64') }
  const encoded = Buffer.from(JSON.stringify(nativeFixture)).toString('base64')
  const script = `${definitions}
$fixture = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')) | ConvertFrom-Json
foreach ($rights in @('GA', 'GW')) {
  $acl = New-Object Security.AccessControl.DirectorySecurity
  $acl.SetSecurityDescriptorSddlForm('O:BAG:BAD:(A;;' + $rights + ';;;AU)')
  $rejected = $false; try { Test-AclPolicy $acl $false } catch { $rejected = $true }
  if (-not $rejected) { throw 'Generic write rights accepted' }
}
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetSecurityDescriptorSddlForm('O:BAG:BAD:(A;;FA;;;BA)(A;;FRFX;;;BU)')
Test-AclPolicy $acl $false
$acl.SetOwner([Security.Principal.WindowsIdentity]::GetCurrent().User)
$rejected = $false; try { Test-AclPolicy $acl $false } catch { $rejected = $true }
if (-not $rejected) { throw 'Unprivileged owner accepted' }
Assert-Location ([Environment]::GetFolderPath('CommonApplicationData')) ''
Assert-Location '${powershell.replace(/'/g, "''")}' ([Environment]::GetFolderPath('Windows'))
$rejected = $false; try { Assert-Location $fixture.junction } catch { $rejected = $_.Exception.Message -match 'reparse' }
if (-not $rejected) { throw 'Reparse point accepted' }
$rejected = $false; try { Assert-Location $fixture.filename } catch { $rejected = $true }
if (-not $rejected) { throw 'Writable temporary executable accepted' }
# The staging transaction below uses only disposable fixture paths. ACL policy
# was tested above; substitute provisioning/ACL checks to avoid any real
# ProgramData access or privileged ACL changes in a developer test process.
$script:denySource = $true
function Assert-Location([string]$filename, [string]$boundary) {
  if ($script:denySource -and $filename -eq $fixture.filename) { throw 'Fixture source is untrusted' }
}
function New-ProtectedDirectory([string]$directory) { [IO.Directory]::CreateDirectory($directory) | Out-Null }
function Set-ProtectedFileOwner([string]$filename) { }
function Get-RuntimeDirectory([bool]$create) {
  if ($create) { [IO.Directory]::CreateDirectory($fixture.root) | Out-Null }
  return $fixture.root
}
$request = @{ filename=$fixture.filename; digest=$fixture.digest; role='core'; approved=$false }
$rejected = $false; try { Stage-Executable | Out-Null } catch { $rejected = $true }
if (-not $rejected -or [IO.Directory]::Exists($fixture.root)) { throw 'Untrusted source provisioned or executed' }
$request.approved = $true
$target = Stage-Executable
if ([IO.Path]::GetFileName($target) -ne 'mihomo.exe') { throw 'Wrong staged role' }
$staged = [IO.File]::ReadAllBytes($target)
if ([Convert]::ToBase64String($staged) -ne $fixture.contents) { throw 'Copied bytes differ from verified snapshot' }
$request.approved = $false
if ((Stage-Executable) -ne $target) { throw 'Protected cache did not authenticate the same source' }
[IO.File]::WriteAllText($target, 'corrupt cache')
$rejected = $false; try { Stage-Executable | Out-Null } catch { $rejected = $true }
if (-not $rejected) { throw 'Corrupt cache accepted' }
[IO.File]::WriteAllBytes($target, [Convert]::FromBase64String($fixture.contents))
[IO.File]::WriteAllText($fixture.filename, 'source replaced after initial digest')
$rejected = $false; try { Stage-Executable | Out-Null } catch { $rejected = $true }
if (-not $rejected) { throw 'Changed source accepted because a cache entry exists' }
[IO.File]::WriteAllBytes($fixture.filename, [Convert]::FromBase64String($fixture.contents))
$handle = [IO.File]::Open($fixture.filename, 'Open', 'Read', 'Read')
try {
  $rejected = $false; try { $writer = [IO.File]::OpenWrite($fixture.filename); $writer.Dispose() } catch { $rejected = $true }
  if (-not $rejected) { throw 'Snapshot handle did not exclude concurrent writers' }
} finally { $handle.Dispose() }
$request.role = 'runner'; $script:denySource = $false
$runner = Stage-Executable
if ([IO.Path]::GetFileName($runner) -ne 'qzyrium-run.exe') { throw 'Protected arbitrary source was not staged' }
if ((Get-ChildItem -LiteralPath $fixture.root -Recurse -Filter '*.tmp').Count -ne 0) { throw 'Staging left temporary files' }
Write-Output 'PASS: native snapshot, cache, locking and ACL policy'
`
  const output = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8', timeout: 30_000 })
  assert.match(output, /PASS: native snapshot/)

  const electronScript = path.join(directory, 'electron-main.cjs')
  const resultFile = path.join(directory, 'report.json')
  fs.writeFileSync(electronScript, `const { app } = require('electron');
    app.setPath('userData', ${JSON.stringify(path.join(directory, 'electron-userData'))});
    const api = {};
    new Function('exports', 'require', 'process', ${JSON.stringify(code)})(api, require, process);
    const getReport = process.report.getReport;
    const previous = process.report.excludeNetwork;
    process.report.getReport = function () {
      require('node:assert/strict').equal(process.report.excludeNetwork, true);
      return getReport.call(this);
    };
    const binary = api.trustedSystemBinary('reg.exe');
    require('node:assert/strict').equal(process.report.excludeNetwork, previous);
    require('node:fs').writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify(binary));
    app.quit();`)
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawnSync(require('electron'), [electronScript], { windowsHide: true, timeout: 30_000, encoding: 'utf8', env })
  assert.equal(child.status, 0, child.stderr || child.error?.message)
  assert.equal(JSON.parse(fs.readFileSync(resultFile, 'utf8')), path.win32.join(path.win32.dirname(powershell), '..', '..', 'reg.exe'), 'KnownDLL resolver must work in Electron main')
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qzyrium-runtime-staging-'))
try {
  verifyNetworkFreeDiscovery()
  verifyStagingAndPins(directory)
  verifyNativePolicy(directory)
  console.log('PASS: portable core storage, content provenance, embedded build pins, protected execution snapshots, cache integrity, native locking/ACL and Electron main compatibility')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  fs.rmSync(directory, { recursive: true, force: true })
}
