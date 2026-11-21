const assert = require('node:assert/strict')
const path = require('node:path')
const { createHash } = require('node:crypto')
const zlib = require('node:zlib')
const { EventEmitter } = require('node:events')
const { loadTypeScript: load } = require('./fixtures/typescript.cjs')

const {
  matchMihomoAsset,
  parseChecksumsTxt,
  parseChecksumFromBody,
  extractBuildIdentifier
} = load('src/shared/core-version.ts')

const {
  parseProxyUri
} = load('src/shared/subscription-converter.ts')

async function verifyCoreVersionHelpers() {
  const sampleAssets = [
    { name: 'checksums.txt', browser_download_url: 'https://example/checksums.txt' },
    { name: 'version.txt', browser_download_url: 'https://example/version.txt' },
    { name: 'mihomo-windows-386-alpha-3c0d10a.zip', browser_download_url: 'https://example/win-386.zip' },
    { name: 'mihomo-windows-amd64-alpha-3c0d10a.zip', browser_download_url: 'https://example/win-amd64.zip' },
    { name: 'mihomo-windows-amd64-v1-alpha-3c0d10a.zip', browser_download_url: 'https://example/win-amd64-v1.zip' },
    { name: 'mihomo-windows-amd64-v1-go120-alpha-3c0d10a.zip', browser_download_url: 'https://example/win-go120.zip' },
    { name: 'mihomo-windows-arm64-alpha-3c0d10a.zip', browser_download_url: 'https://example/win-arm64.zip' },
    { name: 'mihomo-linux-amd64-v1-alpha-3c0d10a.deb', browser_download_url: 'https://example/linux.deb' },
    { name: 'mihomo-linux-amd64-v1-alpha-3c0d10a.rpm', browser_download_url: 'https://example/linux.rpm' },
    { name: 'mihomo-linux-amd64-v1-alpha-3c0d10a.gz', browser_download_url: 'https://example/linux-amd64-v1.gz' },
    { name: 'mihomo-linux-arm64-alpha-3c0d10a.gz', browser_download_url: 'https://example/linux-arm64.gz' },
    { name: 'mihomo-darwin-amd64-v1-alpha-3c0d10a.gz', browser_download_url: 'https://example/darwin-amd64-v1.gz' },
    { name: 'mihomo-darwin-arm64-alpha-3c0d10a.gz', browser_download_url: 'https://example/darwin-arm64.gz' }
  ]

  // Test asset matching across platforms & architectures
  assert.equal(matchMihomoAsset(sampleAssets, 'win32', 'x64')?.name, 'mihomo-windows-amd64-v1-alpha-3c0d10a.zip')
  assert.equal(matchMihomoAsset(sampleAssets, 'win32', 'ia32')?.name, 'mihomo-windows-386-alpha-3c0d10a.zip')
  assert.equal(matchMihomoAsset(sampleAssets, 'win32', 'arm64')?.name, 'mihomo-windows-arm64-alpha-3c0d10a.zip')
  assert.equal(matchMihomoAsset(sampleAssets, 'linux', 'x64')?.name, 'mihomo-linux-amd64-v1-alpha-3c0d10a.gz')
  assert.equal(matchMihomoAsset(sampleAssets, 'linux', 'arm64')?.name, 'mihomo-linux-arm64-alpha-3c0d10a.gz')
  assert.equal(matchMihomoAsset(sampleAssets, 'darwin', 'x64')?.name, 'mihomo-darwin-amd64-v1-alpha-3c0d10a.gz')
  assert.equal(matchMihomoAsset(sampleAssets, 'darwin', 'arm64')?.name, 'mihomo-darwin-arm64-alpha-3c0d10a.gz')

  // Test checksums parsing
  const checksumsContent = `
f3384b408d06a05024c8c90afa8577905189e6cb4351fb61e391ac455b59bde0  ./mihomo-android-386-alpha-3c0d10a.gz
a087ace56595d2a12f66518ab690fa9e563c129fe6583936cdd5f1f9b60a7a82  ./mihomo-windows-amd64-v1-alpha-3c0d10a.zip
`
  const parsedChecksums = parseChecksumsTxt(checksumsContent)
  assert.equal(parsedChecksums.get('mihomo-windows-amd64-v1-alpha-3c0d10a.zip'), 'a087ace56595d2a12f66518ab690fa9e563c129fe6583936cdd5f1f9b60a7a82')

  const releaseBody = `
* mihomo-windows-amd64-v1-v1.19.34.zip
  sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
`
  assert.equal(parseChecksumFromBody(releaseBody, 'mihomo-windows-amd64-v1-v1.19.34.zip'), '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')

  // Test build identifier extraction
  assert.equal(extractBuildIdentifier('alpha-3c0d10a', 'mihomo-windows-amd64-v1-alpha-3c0d10a.zip'), '3c0d10a')
  assert.equal(extractBuildIdentifier('alpha-3c0d10a'), '3c0d10a')
  assert.equal(extractBuildIdentifier('Mihomo Meta v1.19.33 windows amd64 with go1.26.10 Wed Oct 21 16:44:37 UTC 2026'), 'Oct 21 16:44:37 UTC 2026')
}

async function verifyBinaryResolution() {
  const existingFiles = new Set(['/app/sidecar/mihomo.exe', '/userData/cores/alpha/mihomo.exe'])
  const { resolveCoreBinaryPath } = load('src/main/utils/paths.ts', {
    electron: {
      app: {
        getPath: () => '/userData',
        getAppPath: () => '/app',
        isPackaged: true
      }
    },
    fs: {
      existsSync: file => existingFiles.has(file.replace(/\\/g, '/')),
      mkdirSync: () => {}
    }
  })

  // When alpha binary exists, alpha channel resolves to it
  const resolvedAlpha = resolveCoreBinaryPath('alpha').replace(/\\/g, '/')
  assert.equal(resolvedAlpha, '/userData/cores/alpha/mihomo.exe')

  // When custom stable binary does not exist, stable channel falls back to bundled sidecar
  const resolvedStable = resolveCoreBinaryPath('stable').replace(/\\/g, '/')
  assert.equal(resolvedStable, '/app/sidecar/mihomo.exe')

  // When channel is undefined, falls back to bundled sidecar
  const resolvedDefault = resolveCoreBinaryPath().replace(/\\/g, '/')
  assert.equal(resolvedDefault, '/app/sidecar/mihomo.exe')
}

async function verifyUnifiedValidationAndLaunch() {
  const executedFiles = []
  const { prepareProfileContent } = load('src/main/utils/profile-validator.ts', {
    './paths': {
      getAppPaths: () => ({ mihomoDir: '/mihomo', coreBinaryPath: '/sidecar/mihomo.exe', coresDir: '/cores' }),
      resolveCoreBinaryPath: channel => channel === 'alpha' ? '/cores/alpha/mihomo.exe' : '/sidecar/mihomo.exe'
    },
    '../core/MihomoConfigFactory': {
      MihomoConfigFactory: {
        synthesize: () => 'port: 7890'
      }
    },
    'node:child_process': {
      execFile: (binary, args, _opts, cb) => {
        executedFiles.push(binary)
        cb(null, { stdout: 'configuration file test is successful', stderr: '' })
      }
    },
    'node:fs/promises': {
      writeFile: async () => {},
      unlink: async () => {}
    }
  })

  // Validation with channel = 'alpha' uses alpha binary
  await prepareProfileContent(null, { kernel: { channel: 'alpha' } })
  assert.equal(executedFiles.pop(), '/cores/alpha/mihomo.exe')

  // Validation with channel = 'stable' uses stable binary
  await prepareProfileContent(null, { kernel: { channel: 'stable' } })
  assert.equal(executedFiles.pop(), '/sidecar/mihomo.exe')

  // MihomoProcessManager uses resolved binary
  let activeCp = null
  const spawnBinaries = []
  const { MihomoProcessManager } = load('src/main/core/MihomoProcessManager.ts', {
    fs: { existsSync: () => true },
    '../utils/paths': {
      getAppPaths: () => ({ coreBinaryPath: '/sidecar/mihomo.exe', geoFilesDir: '/geo' }),
      resolveCoreBinaryPath: channel => channel === 'alpha' ? '/cores/alpha/mihomo.exe' : '/sidecar/mihomo.exe'
    },
    '../utils/logger': { logger: { info() {}, warn() {}, error() {}, writeEntry() {} } },
    '../utils/network-watchdog': { networkWatchdog: { trackCore: async () => {} } },
    child_process: {
      execFile: (_file, _args, _opts, cb) => {
        if (typeof cb === 'function') cb(null)
        if (activeCp) activeCp.emit('exit', 0, null)
      },
      spawn: (cmd) => {
        spawnBinaries.push(cmd)
        const cp = Object.assign(new EventEmitter(), {
          pid: 1234,
          stdout: new EventEmitter(),
          stderr: new EventEmitter(),
          kill: () => { cp.emit('exit', 0, null); return true }
        })
        activeCp = cp
        return cp
      }
    }
  })

  const manager = new MihomoProcessManager()
  manager.waitForReady = async () => manager.setState('running')

  await manager.start('/work', '/work/config.yaml', 9095, 'secret', 'alpha')
  assert.equal(spawnBinaries.pop(), '/cores/alpha/mihomo.exe')
  await manager.stop()

  await manager.start('/work', '/work/config.yaml', 9095, 'secret', 'stable')
  assert.equal(spawnBinaries.pop(), '/sidecar/mihomo.exe')
  await manager.stop()
}

async function verifySafeSwitchAndRollback() {
  const steps = []
  let failConfigTest = false
  let failCoreStartup = false
  let failSave = false
  const preparations = []
  const builds = []

  const mockSettings = {
    kernel: { channel: 'stable', mixedPort: 7895, controllerPort: 9095, controllerSecret: 'secret', tun: { enable: false } }
  }

  let coreState = 'running'
  const { KernelService } = load('src/main/services/KernelService.ts', {
    electron: { powerMonitor: new EventEmitter() },
    './createKernelRuntime': {
      createKernelRuntime: () => ({
        configBuilder: {
          prepare: async (...args) => { preparations.push(args); return 'test-config' },
          build: async (...args) => { builds.push(args); return null }
        },
        processManager: Object.assign(new EventEmitter(), {
          getState: () => coreState,
          setBinaryPath: (bin) => steps.push(`set-binary:${bin}`),
          getBinaryPath: () => '/sidecar/mihomo.exe',
          start: async () => {
            if (failCoreStartup && !steps.includes('set-binary:/sidecar/mihomo.exe')) {
              steps.push('start-candidate-failed')
              throw new Error('Candidate binary crashed on launch')
            }
            coreState = 'running'
            steps.push('start-core')
          },
          stop: async () => {
            coreState = 'stopped'
            steps.push('stop-core')
          }
        }),
        apiClient: Object.assign(new EventEmitter(), {
          reconfigure() {},
          stopAllStreams() {},
          startTrafficStream() {}
        }),
        geoIp: { captureOrigin: async () => {}, dispose() {} },
        trafficAccounting: { reset() {} }
      })
    },
    '../core/installGeoResources': { installGeoResources: async () => {} },
    '../core/KernelGlobeResolver': { KernelGlobeResolver: class { invalidate() {} releaseCaches() {} } },
    '../core/ProxySelection': { restoreProxySelection: async () => {} },
    '../core/SubscriptionTrafficAccounting': { SubscriptionTrafficAccounting: class { beginSession() {} } },
    '../utils/elevation': { isProcessElevated: () => true },
    '../utils/network-transition': { flushSystemDns() {} },
    '../utils/logger': { logger: { info() {}, warn() {}, error() {} } },
    '../utils/paths': {
      getAppPaths: () => ({ mihomoDir: '/mihomo', coreBinaryPath: '/sidecar/mihomo.exe', activeConfigPath: '/mihomo/config.yaml' }),
      resolveCoreBinaryPath: () => '/sidecar/mihomo.exe'
    },
    'node:child_process': {
      execFile: (file, args, _opts, cb) => {
        steps.push(`execFile:${file}:${args.join(' ')}`)
        if (failConfigTest) {
          cb(new Error('YAML validation failed (-t)'))
        } else {
          cb(null, { stdout: 'test is successful', stderr: '' })
        }
      }
    },
    'node:fs/promises': {
      writeFile: async () => {},
      unlink: async () => {}
    }
  })

  const mockSettingService = {
    getSettings: () => structuredClone(mockSettings),
    updateSettings: async patch => {
      if (failSave) throw new Error('Settings write failed')
      Object.assign(mockSettings.kernel, patch.kernel)
    }
  }
  const mockProfileService = {
    getActiveProfile: () => null,
    getProfileContent: async () => null,
    getCustomRules: () => []
  }

  const kernel = new KernelService(mockSettingService, mockProfileService)

  // Test 1: Candidate binary fails -t test
  // Must reject immediately without stopping current running core
  coreState = 'running'
  failConfigTest = true
  steps.length = 0
  await assert.rejects(
    kernel.switchCoreBinary('alpha', '/cores/alpha/candidate.exe'),
    /Core configuration test failed \(-t\)/
  )
  assert.ok(!steps.includes('stop-core'), 'Running core must NOT be stopped if -t test fails')
  assert.equal(mockSettings.kernel.channel, 'stable', 'Channel must remain stable on failure')

  // Test 2: Candidate passes -t, but crashes on startup
  // Must execute automatic rollback to previous core!
  coreState = 'running'
  failConfigTest = false
  failCoreStartup = true
  steps.length = 0
  await assert.rejects(
    kernel.switchCoreBinary('alpha', '/cores/alpha/candidate.exe'),
    /Rolled back to previous core/
  )
  assert.ok(steps.includes('stop-core'), 'Stopped core before switching')
  assert.ok(steps.includes('set-binary:/cores/alpha/candidate.exe'), 'Tried candidate binary')
  assert.ok(steps.includes('start-candidate-failed'), 'Candidate failed to start')
  assert.ok(steps.includes('set-binary:/sidecar/mihomo.exe'), 'Rolled back binary to previous')
  assert.ok(steps.includes('start-core'), 'Restarted previous core during rollback')
  assert.equal(mockSettings.kernel.channel, 'stable', 'Channel reverted to stable')

  failCoreStartup = false
  let restoredFiles = false
  await assert.rejects(kernel.switchCoreBinary('alpha', '/candidate', {
    promote: async () => { throw new Error('EPERM during promotion') },
    rollback: async () => { restoredFiles = true }
  }), error => error.rolledBack === true && /EPERM/.test(error.message))
  assert.equal(restoredFiles, true)
  assert.equal(coreState, 'running')
  assert.equal(mockSettings.kernel.channel, 'stable')

  failSave = true
  await assert.rejects(kernel.switchCoreBinary('alpha', '/candidate'), /Settings write failed/)
  assert.equal(coreState, 'running')
  assert.equal(mockSettings.kernel.channel, 'stable')
  failSave = false

  await assert.rejects(kernel.switchCoreBinary('alpha', '/candidate', {
    promote: async () => '/candidate',
    rollback: async () => {},
    commit: async () => { throw new Error('Journal commit failed') }
  }), error => error.rolledBack === true && /Journal commit failed/.test(error.message))
  assert.equal(mockSettings.kernel.channel, 'stable', 'Failed durable commit restores the saved channel')
  assert.equal(coreState, 'running')

  await assert.rejects(kernel.switchCoreBinary('alpha', '/candidate', {
    promote: async () => { throw new Error('Promotion failed') },
    rollback: async () => { throw new Error('Restore failed') }
  }), error => error.rolledBack === false && /Rollback failed/.test(error.message))

  // Test 3: Successful switch
  coreState = 'running'
  failCoreStartup = false
  steps.length = 0
  await kernel.switchCoreBinary('alpha', '/cores/alpha/candidate.exe')
  assert.ok(steps.includes('set-binary:/cores/alpha/candidate.exe'))
  assert.ok(steps.includes('start-core'))
  assert.equal(mockSettings.kernel.channel, 'alpha', 'Channel successfully changed to alpha')
  assert.equal(preparations.at(-1)[3], '/cores/alpha/candidate.exe')
  assert.equal(preparations.at(-1)[4], false, 'Trial must not persist rule validation')
  assert.equal(builds.at(-1)[0].kernel.channel, 'alpha')
  assert.equal(builds.at(-1)[2], '/cores/alpha/candidate.exe')
  assert.equal(builds.at(-1)[3], false)

  // Diagnostics can leave a real core running while the VPN status is stopped.
  // Switching must release that binary without connecting the VPN implicitly.
  kernel.isIdleCoreRunning = true
  coreState = 'running'
  steps.length = 0
  failConfigTest = true
  await assert.rejects(kernel.switchCoreBinary('stable', '/cores/stable/candidate.exe'), /Core configuration test failed/)
  assert.equal(kernel.isIdleCoreRunning, true, 'Rejected candidate leaves the idle process intact')
  assert.ok(!steps.includes('stop-core'))

  failConfigTest = false
  steps.length = 0
  await kernel.switchCoreBinary('stable', '/cores/stable/candidate.exe')
  assert.ok(steps.includes('stop-core'), 'Idle process must release its old executable')
  assert.ok(!steps.includes('start-core'), 'Channel switching must not connect a disconnected VPN')
  assert.equal(kernel.getStatus(), 'stopped')
  assert.equal(coreState, 'stopped')
  assert.equal(mockSettings.kernel.channel, 'stable')
  await kernel.start()
  assert.equal(coreState, 'running')
  assert.equal(builds.at(-1)[0].kernel.channel, 'stable', 'Next VPN start uses the selected channel')
}

async function verifyCoreServiceInstallation() {
  const archive = zlib.gzipSync(Buffer.from('new executable'))
  const hash = createHash('sha256').update(archive).digest('hex')
  const ext = process.platform === 'win32' ? '.exe' : ''
  const binary = path.join('/cores', 'alpha', `mihomo${ext}`)
  const files = new Map([[binary, Buffer.from('previous executable')]])
  const requests = []
  const settings = { kernel: { channel: 'stable' } }
  let failPromotion = false
  let failStartup = false
  let failJournalCommit = false
  let failCapabilities = false
  let digest = `sha256:${hash}`
  let active = '/bundled/mihomo'
  const { CoreService } = load('src/main/services/CoreService.ts', {
    '../utils/linux-core-capabilities': { grantLinuxCoreCapabilities: async candidate => {
      assert.ok(files.has(candidate), 'capabilities apply to the fully written candidate')
      assert.ok(candidate.endsWith('.tmp'), 'capabilities are granted before promotion')
      if (failCapabilities) throw new Error('setcap authorization declined')
    } },
    '../utils/paths': { getAppPaths: () => ({ coresDir: '/cores' }) },
    '../utils/logger': { logger: { info() {}, warn() {}, error() {} } },
    '../utils/atomicWrite': { writeFileAtomicAsync: async (file, data) => {
      if (failJournalCommit && JSON.parse(data).committed) throw new Error('Journal write failed')
      files.set(file, data)
    } },
    'node:fs': {
      mkdirSync() {},
      existsSync: file => files.has(file),
      readFileSync: file => files.get(file),
      writeFileSync: (file, data) => files.set(file, data)
    },
    'node:fs/promises': {
      mkdir: async () => {},
      writeFile: async (file, data) => files.set(file, data),
      unlink: async file => { assert.ok(files.delete(file), `Missing file: ${file}`) },
      rename: async (from, to) => {
        if (failPromotion && from.endsWith('.tmp')) throw new Error('EPERM promotion')
        assert.ok(files.has(from))
        assert.ok(!files.has(to), 'Must preserve the old binary before replacing it')
        files.set(to, files.get(from)); files.delete(from)
      }
    },
    axios: { get: async url => {
      requests.push(url)
      if (url.includes('api.github.com')) {
        await new Promise(resolve => setImmediate(resolve))
        const alpha = url.includes('Prerelease-Alpha')
        const prefix = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux'
        const arch = process.arch === 'x64' ? 'amd64-v1' : process.arch === 'ia32' ? '386' : 'arm64'
        return { data: { tag_name: alpha ? 'alpha-abcdef1' : 'v2.0.0', assets: [{
          name: `mihomo-${prefix}-${arch}-${alpha ? 'alpha-abcdef1' : 'v2.0.0'}${process.platform === 'win32' ? '.zip' : '.gz'}`,
          browser_download_url: `https://example/${alpha ? 'alpha' : 'stable'}.gz`, digest
        }] } }
      }
      return { data: archive }
    } }
  })
  // Model the KernelService transaction boundary; its rollback behavior is tested above.
  const settingService = {
    getSettings: () => settings,
    updateSettings: async patch => { settings.kernel = { ...settings.kernel, ...patch.kernel } }
  }
  const service = new CoreService(settingService, {
    switchCoreBinary: async (channel, candidate, installation) => {
      const previous = active
      try {
        active = installation ? await installation.promote() : candidate
        if (failStartup) throw new Error('Startup failed')
        settings.kernel.channel = channel
        await installation?.commit?.()
      } catch (error) {
        await installation?.rollback()
        active = previous
        throw Object.assign(error, { rolledBack: true })
      }
    }
  })
  service.getInfo = async () => ({ channel: settings.kernel.channel, installedPath: active, stableVersion: 'v1.0.0', alphaInstalled: false })

  const [stable, alpha] = await Promise.all([service.checkUpdate('stable'), service.checkUpdate('alpha')])
  assert.equal(stable.version, 'v2.0.0')
  assert.equal(alpha.version, 'alpha-abcdef1')
  assert.equal(alpha.sha256, hash, 'Use the GitHub asset digest')
  assert.equal(requests.filter(url => url.includes('api.github.com')).length, 2)

  digest = undefined
  const downloads = requests.filter(url => url.includes('example')).length
  await assert.rejects(service.installCore('alpha'), /No trusted SHA-256/)
  assert.equal(requests.filter(url => url.includes('example')).length, downloads)
  digest = `sha256:${'0'.repeat(64)}`
  await assert.rejects(service.installCore('alpha'), /SHA-256 verification mismatch/)
  assert.equal(files.get(binary).toString(), 'previous executable')
  digest = `sha256:${hash}`

  failCapabilities = true
  await assert.rejects(service.installCore('alpha'), /setcap authorization declined/)
  assert.equal(files.get(binary).toString(), 'previous executable')
  assert.equal(settings.kernel.channel, 'stable')
  assert.equal(active, '/bundled/mihomo')
  assert.ok(![...files.keys()].some(file => file.endsWith('.tmp')), 'failed authorization cleans the candidate')
  failCapabilities = false

  failPromotion = true
  await assert.rejects(service.installCore('alpha'), /EPERM/)
  assert.equal(files.get(binary).toString(), 'previous executable')
  assert.equal(settings.kernel.channel, 'stable')
  assert.equal(active, '/bundled/mihomo')
  assert.equal(service.getStatus().rolledBack, true)
  failPromotion = false
  failStartup = true
  await assert.rejects(service.installCore('alpha'), /Startup failed/)
  assert.equal(files.get(binary).toString(), 'previous executable')
  assert.equal(settings.kernel.channel, 'stable')
  failStartup = false

  failJournalCommit = true
  await assert.rejects(service.installCore('alpha'), /Journal write failed/)
  assert.equal(files.get(binary).toString(), 'previous executable')
  assert.equal(settings.kernel.channel, 'stable')
  failJournalCommit = false

  const installed = await service.installCore('alpha')
  assert.equal(installed.channel, 'alpha')
  assert.equal(active, binary)
  assert.equal(files.get(binary).toString(), 'new executable')
  assert.ok(![...files.keys()].some(file => /\.(tmp|backup)$/.test(file)))

  // Recreate the service with durable files left at each interruption point.
  const journalPath = path.join('/cores', 'alpha', 'installation.json')
  const backupPath = path.join('/cores', 'alpha', 'mihomo.backup')
  for (const stage of ['before-backup', 'after-backup', 'after-promotion', 'first-install', 'committed']) {
    files.clear()
    settings.kernel.channel = 'alpha'
    const hadBinary = stage !== 'first-install'
    files.set(journalPath, JSON.stringify({
      previousChannel: 'stable', hadBinary, committed: stage === 'committed', metadata: { activeChannel: 'stable' }
    }))
    if (stage === 'before-backup') files.set(binary, Buffer.from('previous executable'))
    else if (hadBinary) files.set(backupPath, Buffer.from('previous executable'))
    if (['after-promotion', 'first-install', 'committed'].includes(stage)) files.set(binary, Buffer.from('new executable'))
    const restarted = new CoreService(settingService, {})
    await restarted.initialize()
    assert.equal(settings.kernel.channel, stage === 'committed' ? 'alpha' : 'stable', stage)
    assert.equal(files.get(binary)?.toString(), stage === 'committed' ? 'new executable' : hadBinary ? 'previous executable' : undefined, stage)
    assert.ok(!files.has(journalPath) && !files.has(backupPath), stage)
    await restarted.initialize() // Recovery is idempotent.
  }

  const switched = []
  service.switchChannelNow = async channel => {
    switched.push(`start:${channel}`)
    await new Promise(resolve => setImmediate(resolve))
    switched.push(`end:${channel}`)
    return { channel }
  }
  const results = await Promise.all([service.switchChannel('stable'), service.switchChannel('alpha')])
  assert.deepEqual(switched, ['start:stable', 'end:stable', 'start:alpha', 'end:alpha'])
  assert.deepEqual(results.map(result => result.channel), ['stable', 'alpha'])
}

async function verifyCandidateRuleValidation() {
  const validations = []
  const persisted = []
  const { ActiveConfigBuilder } = load('src/main/core/ActiveConfigBuilder.ts', {
    '../utils/profile-validator': { prepareProfileContent: async (...args) => {
      validations.push(args)
      return { config: 'candidate config', rules: [{ validationError: 'Trial result' }] }
    } }
  })
  const builder = new ActiveConfigBuilder({
    getCustomRules: () => [{ enabled: true }],
    setRuleValidation: async (...args) => persisted.push(args)
  })
  await builder.prepare('profile', { kernel: { channel: 'alpha' } }, 'profile-id', '/candidate', false)
  assert.equal(validations[0][3], '/candidate')
  assert.deepEqual(persisted, [], 'Trials must not change saved rules')
}

async function verifySettingsAndCoreCoordination() {
  const { DEFAULT_APP_CONFIG } = load('src/shared/app-config.ts')
  const { mergeSettings } = load('src/shared/settings-config.ts')
  const { NetworkModeController } = load('src/main/services/NetworkModeController.ts', {
    '../utils/logger': { logger: { error() {} } }
  })
  let settings = structuredClone(DEFAULT_APP_CONFIG)
  const steps = []
  const settingService = {
    getSettings: () => structuredClone(settings),
    updateSettings: async patch => { settings = mergeSettings(settings, patch); return structuredClone(settings) }
  }
  let releaseSwitch
  let notifyStarted
  const started = new Promise(resolve => { notifyStarted = resolve })
  const kernel = {
    getStatus: () => 'stopped',
    switchCoreBinary: async channel => {
      steps.push('switch:start')
      notifyStarted()
      await new Promise(resolve => { releaseSwitch = resolve })
      await settingService.updateSettings({ kernel: { ...settings.kernel, channel } })
      steps.push('switch:end')
    }
  }
  const network = new NetworkModeController(settingService, kernel, { getStatus: () => ({ enabled: false }) })
  const { CoreService } = load('src/main/services/CoreService.ts', {
    '../utils/paths': { getAppPaths: () => ({ coresDir: '/cores' }) },
    'node:fs': { existsSync: () => true, readFileSync: () => '{"activeChannel":"stable"}', writeFileSync() {} }
  })
  const core = new CoreService(settingService, kernel, () => {}, network)
  core.getInfo = async () => ({ channel: settings.kernel.channel })
  const staleDraft = { kernel: { ...settings.kernel, mode: 'global' } }
  const switching = core.switchChannel('alpha')
  await started
  const saving = network.updateSettings(staleDraft).then(() => steps.push('save'))
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(steps, ['switch:start'], 'Settings must wait for the full core transaction')
  releaseSwitch()
  await Promise.all([switching, saving])
  assert.deepEqual(steps, ['switch:start', 'switch:end', 'save'])
  assert.equal(settings.kernel.channel, 'alpha', 'A stale settings draft must not revert the channel')
  assert.equal(settings.kernel.mode, 'global', 'Concurrent settings changes must survive')
}

async function verifySubscriptionProtocols() {
  // WireGuard
  const wgUri = 'wireguard://aGVsbG8=@198.51.100.1:51820?publickey=cHVibGlj&ip=10.0.0.2&presharedkey=cHJl#MyWireGuard'
  const wgNode = parseProxyUri(wgUri)
  assert.equal(wgNode.type, 'wireguard')
  assert.equal(wgNode.name, 'MyWireGuard')
  assert.equal(wgNode.server, '198.51.100.1')
  assert.equal(wgNode.port, 51820)
  assert.equal(wgNode.ip, '10.0.0.2')
  assert.equal(wgNode['public-key'], 'cHVibGlj')
  assert.equal(wgNode['private-key'], 'aGVsbG8=')
  assert.equal(wgNode['pre-shared-key'], 'cHJl')
  assert.equal(wgNode['preshared-key'], undefined)
  assert.equal(parseProxyUri(wgUri.replace('presharedkey=', 'pre-shared-key='))['pre-shared-key'], 'cHJl')

  // Hysteria
  const hyUri = 'hysteria://198.51.100.2:443?auth=mysecret&peer=example.com&up=50&down=100&insecure=1#MyHysteria'
  const hyNode = parseProxyUri(hyUri)
  assert.equal(hyNode.type, 'hysteria')
  assert.equal(hyNode.name, 'MyHysteria')
  assert.equal(hyNode['auth-str'], 'mysecret')
  assert.equal(hyNode.auth_str, undefined)
  assert.equal(hyNode.sni, 'example.com')
  assert.equal(hyNode['skip-cert-verify'], true)

  // Snell
  const snellUri = 'snell://pskpassword@198.51.100.3:1234?version=2&obfs=http&obfs-host=cdn.example.com#MySnell'
  const snellNode = parseProxyUri(snellUri)
  assert.equal(snellNode.type, 'snell')
  assert.equal(snellNode.name, 'MySnell')
  assert.equal(snellNode.psk, 'pskpassword')
  assert.equal(snellNode.version, 2)
  assert.equal(snellNode['obfs-opts'].mode, 'http')
  assert.equal(snellNode['obfs-opts'].host, 'cdn.example.com')

  // VLESS with packetEncoding & alpn
  const vlessUri = 'vless://uuid123@198.51.100.4:443?security=reality&pbk=pubkey123&packetEncoding=xudp&alpn=h2,http/1.1#MyVless'
  const vlessNode = parseProxyUri(vlessUri)
  assert.equal(vlessNode.type, 'vless')
  assert.equal(vlessNode['packet-encoding'], 'xudp')
  assert.deepEqual(vlessNode.alpn, ['h2', 'http/1.1'])
}

async function main() {
  await verifyLinuxCapabilities()
  await verifyCoreVersionHelpers()
  await verifyBinaryResolution()
  await verifyUnifiedValidationAndLaunch()
  await verifySafeSwitchAndRollback()
  await verifyCoreServiceInstallation()
  await verifyCandidateRuleValidation()
  await verifySettingsAndCoreCoordination()
  await verifySubscriptionProtocols()
  console.log('PASS: core updates, mandatory SHA-256, candidate validation, rollback, crash recovery, concurrent settings/channel changes, and subscription authentication fields')
}

async function verifyLinuxCapabilities() {
  const ts = require('typescript')
  const code = ts.transpileModule(require('node:fs').readFileSync('src/main/utils/linux-core-capabilities.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  for (const platform of ['win32', 'darwin', 'linux']) {
    for (const root of [false, true]) {
      const calls = []
      let missing = false, declined = false
      const exports = {}
      new Function('exports', 'require', 'process', code)(exports, name => {
        if (name === 'node:fs') return { existsSync: file => !missing && file === '/usr/sbin/setcap' }
        if (name === 'node:child_process') return { execFile: (file, args, options, callback) => {
          calls.push({ file, args, options })
          callback(declined ? new Error('declined') : null, '', '')
        } }
        return require(name)
      }, { platform, getuid: () => root ? 0 : 1000 })
      const binary = '/user data/cores/alpha/mihomo.tmp'
      await exports.grantLinuxCoreCapabilities(binary)
      assert.equal(calls.length, platform === 'linux' ? 1 : 0)
      if (platform !== 'linux') continue
      assert.equal(calls[0].file, root ? '/usr/sbin/setcap' : '/usr/bin/pkexec')
      assert.deepEqual(calls[0].args, [...(root ? [] : ['/usr/sbin/setcap']), 'cap_net_admin,cap_net_bind_service+ep', binary])
      declined = true
      await assert.rejects(exports.grantLinuxCoreCapabilities(binary), /Authorize the setcap request/)
      missing = true
      await assert.rejects(exports.grantLinuxCoreCapabilities(binary), /install libcap2-bin/)
    }
  }
}

main().catch(err => {
  console.error('Core management verification failed:', err)
  process.exit(1)
})
