const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { loadTypeScript: load } = require('./fixtures/typescript.cjs')
const { classifyKernelFailure, kernelFailureDetails } = load('src/main/utils/kernel-failure.ts')
const { kernelFailureMessage } = load('src/shared/kernel-failure.ts')
const config = load('src/shared/app-config.ts').DEFAULT_APP_CONFIG

async function verify() {
  const cases = [
    ['listen tcp 127.0.0.1:7895: bind: address already in use', 'port-in-use'],
    ['listen tcp: bind: Only one usage of each socket address is normally permitted.', 'port-in-use'],
    ['listen tcp: bind: Обычно разрешается только одно использование адреса сокета', 'port-in-use'],
    ['listen tcp: bind: An attempt was made to access a socket in a way forbidden by its access permissions.', 'permission'],
    ['Start TUN listening error: operation not permitted', 'permission'],
    ['create tun interface: failed to create adapter', 'permission'],
    ['WintunCreateAdapter failed with code 5', 'permission'],
    ['Parse config error: yaml: line 4: did not find expected key', 'configuration'],
    ['Mihomo controller did not become ready within 15 seconds', 'timeout'],
    ['panic: runtime error: invalid memory address', 'crash']
  ]
  for (const [detail, reason] of cases) assert.equal(classifyKernelFailure(new Error(detail)).reason, reason)
  assert.equal(classifyKernelFailure(Object.assign(new Error('spawn failed'), { code: 'ENOENT' })).reason, 'missing-core')
  assert.equal(classifyKernelFailure(Object.assign(new Error('spawn failed'), { code: 'EACCES' })).reason, 'permission')
  assert.equal(classifyKernelFailure(new Error('Profile validation failed: spawn mihomo.exe ENOENT'), [], 'configuration').reason, 'missing-core')
  assert.equal(classifyKernelFailure(new Error('Unexpected error')).reason, 'unknown', 'unknown errors are not labelled as permission failures')
  const safe = kernelFailureDetails(new Error('download https://user:pass@provider.invalid/private?token=secret failed; password=private-password'))
  assert.ok(!safe.includes('private-password') && !safe.includes('token=secret') && !safe.includes('user:pass'))
  const logs = [], children = [], events = []
  let watchdogFailure = false, delayExit = false
  const { MihomoProcessManager } = load('src/main/core/MihomoProcessManager.ts', {
    fs: { existsSync: () => true },
    '../utils/paths': { getAppPaths: () => ({ coreBinaryPath: '/fixture/mihomo', geoFilesDir: '/fixture/files' }) },
    '../utils/logger': { logger: { info() {}, warn() {}, error: text => logs.push(text), writeEntry() {} } },
    '../utils/network-watchdog': { networkWatchdog: { async trackCore() { if (watchdogFailure) throw new Error('Unable to supervise Mihomo process') } } },
    child_process: {
      spawn: () => {
        const child = Object.assign(new EventEmitter(), { pid: 100 + children.length, stdout: new EventEmitter(), stderr: new EventEmitter() })
        child.kill = () => { if (!delayExit) child.emit('exit', 1, null); return true }
        children.push(child); return child
      },
      execFile: (_file, _args, _options, callback) => { callback(null); if (!delayExit) children.at(-1).emit('exit', 1, null) }
    }
  })
  const manager = new MihomoProcessManager()
  manager.on('failure', failure => events.push(failure))
  manager.waitForReady = async () => manager.setState('running')
  await manager.start('/work', '/work/config.yaml', 9095, 'secret')
  // No newline: the exit handler must flush and classify a final partial stderr line.
  children[0].stderr.emit('data', Buffer.from('level=fatal msg="listen tcp 127.0.0.1:7895: bind: address already in use"'))
  children[0].emit('exit', 1, null)
  assert.equal(manager.getFailure().reason, 'port-in-use')
  assert.equal(manager.getFailure().exitCode, 1)
  assert.ok(logs.some(text => text.includes('[port-in-use]') && text.includes('127.0.0.1:7895')))
  assert.ok(!JSON.stringify(events).includes('listen tcp'), 'IPC receives categories and metadata, not raw core output')
  await manager.start('/work', '/work/config.yaml', 9095, 'secret')
  children[0].stderr.emit('data', Buffer.from('permission denied\n'))
  children[1].emit('exit', 2, null)
  assert.equal(manager.getFailure().reason, 'crash', 'old child output cannot contaminate the replacement core')
  watchdogFailure = true
  await assert.rejects(manager.start('/work', '/work/config.yaml', 9095, 'secret'))
  assert.equal(manager.getFailure().reason, 'watchdog')
  assert.ok(logs.some(text => text.includes('[watchdog]') && text.includes('Unable to supervise')))
  watchdogFailure = false
  await manager.start('/work', '/work/config.yaml', 9095, 'secret')
  const count = events.length
  await manager.stop()
  assert.equal(events.length, count, 'intentional shutdown is not reported as a crash')
  await manager.start('/work', '/work/config.yaml', 9095, 'secret')
  const stuck = children.at(-1)
  const childCount = children.length
  // The OS can accept a kill request without delivering exit before the deadline.
  delayExit = true
  await assert.rejects(manager.stop(), /Timed out/)
  await assert.rejects(manager.start('/work', '/work/config.yaml', 9095, 'secret'), /previous Mihomo process/)
  assert.equal(children.length, childCount, 'a timed out stop must not orphan the live child')
  stuck.emit('exit', 0, null)
  delayExit = false
  await manager.start('/work', '/work/config.yaml', 9095, 'secret')
  await manager.stop()
  for (const language of ['en', 'ru']) {
    const message = kernelFailureMessage({ reason: 'port-in-use', occurredAt: '' }, { ...config.general, language })
    assert.ok(message.includes(language === 'ru' ? 'порт' : 'port'))
  }
  const forwarded = [], coreEvents = new EventEmitter(), api = new EventEmitter()
  Object.assign(api, { stopAllStreams() {}, startTrafficStream() {} })
  const { KernelService } = load('src/main/services/KernelService.ts', {
    electron: {}, '../utils/logger': { logger: { error: text => logs.push(text) } }
  })
  const kernel = Object.assign(Object.create(KernelService.prototype), {
    failure: null, processManager: coreEvents, apiClient: api,
    settingService: { getSettings: () => config }, broadcaster: (...args) => forwarded.push(args)
  })
  kernel.setupListeners()
  coreEvents.emit('failure', { reason: 'watchdog', occurredAt: new Date().toISOString() })
  coreEvents.emit('state-change', 'error')
  assert.equal(kernel.getFailure().reason, 'watchdog')
  assert.equal(forwarded[0][0], 'event:core-failure')
  assert.equal(kernel.reportFailure(new Error('Unable to supervise')).message, kernelFailureMessage(kernel.getFailure(), config.general))
  coreEvents.emit('state-change', 'running')
  assert.equal(kernel.getFailure(), null, 'successful recovery clears the previous failure')
  console.log('PASS: kernel failure categories, final stderr, exit metadata, watchdog rejection, stale child isolation, intentional stops and safe messages')
}
verify().catch(error => { console.error(error); process.exitCode = 1 })
