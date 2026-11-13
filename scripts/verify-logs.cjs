const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qzyrium-logs-'))
const appDirectory = path.join(directory, 'app')
const connectionDirectory = path.join(directory, 'connections')
let now = Date.parse('2026-11-10T23:59:59.000Z')
const failures = []
let lastOutput = ''
const instances = []
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])) }
  static now() { return now }
}
function load(file, dependencies = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText
  const exports = {}
  vm.runInNewContext(`(function(exports, require) { ${output}\n})`, {
    Date: Clock, Buffer, URL,
    console: { log: value => { lastOutput = value }, warn: value => { lastOutput = value }, error: (...args) => failures.push(args) }
  })(exports, (name) => {
    if (dependencies[name]) return dependencies[name]
    if (name.startsWith('@shared/')) return load(path.resolve('src/shared', name.slice(8) + '.ts'))
    return require(name)
  })
  if (exports.Logger) {
    const Original = exports.Logger
    exports.Logger = class extends Original { constructor() { super(); instances.push(this) } }
  }
  return exports
}

;(async () => {
try {
  const { parseMihomoLog, normalizeLogLevel, cleanLogMessage, redactUrl } = load('src/shared/logs.ts')
  const privateUrl = 'https://private-user:private-password@provider.example/personal-path?Token=private-token&access_token=private-access#private-fragment'
  assert.equal(redactUrl(privateUrl), 'https://provider.example/[REDACTED]')
  const safeMessage = cleanLogMessage(`Failed (${privateUrl}), Authorization: Bearer private-bearer ?API_KEY=private-key`)
  for (const secret of ['private-user', 'private-password', 'personal-path', 'private-token', 'private-access', 'private-fragment', 'private-bearer', 'private-key']) {
    assert.ok(!safeMessage.includes(secret), `redacts ${secret}`)
  }
  assert.ok(safeMessage.includes('https://provider.example/[REDACTED]'))
  assert.equal(cleanLogMessage(safeMessage), safeMessage, 'redaction is idempotent')
  assert.equal(redactUrl('https://example.com/'), 'https://example.com/')
  assert.equal(redactUrl('not-a-url'), '[REDACTED_URL]')
  const privateEntry = parseMihomoLog(JSON.stringify({ level: 'warning', msg: `Request ${privateUrl} failed` }))
  assert.ok(!privateEntry.payload.includes('personal-path'), 'streamed core logs are sanitized')
  const line = '\x1b[33mtime="2026-11-10T12:00:00+03:00" level=warning msg="DNS failed\\n  retry"\x1b[0m'
  const entry = parseMihomoLog(line)
  assert.equal(entry.type, 'warning')
  assert.equal(entry.payload, 'DNS failed\n  retry')
  assert.equal(entry.time, '2026-11-10T09:00:00.000Z')
  assert.equal(parseMihomoLog('{"level":"fatal","msg":"failed"}').type, 'error')
  assert.equal(parseMihomoLog('level=debug msg="details"').type, 'debug')
  assert.equal(parseMihomoLog('plain stderr', 'warning').type, 'warning')
  assert.equal(parseMihomoLog('  '), null)
  assert.equal(normalizeLogLevel('WARN'), 'warning')

  const { LogLines } = load('src/main/utils/log-lines.ts')
  const lines = []
  const decoder = new LogLines(line => lines.push(line))
  const bytes = Buffer.from('Привет 🌍\r\nsecond\nlast')
  for (const byte of bytes) decoder.push(Buffer.from([byte]))
  decoder.end()
  decoder.end()
  assert.deepEqual(lines, ['Привет 🌍', 'second', 'last'])
  const bounded = []
  const longLines = new LogLines(line => bounded.push(line))
  longLines.push(Buffer.from('x'.repeat(150000)))
  longLines.end()
  assert.equal(bounded.join('').length, 150000)
  assert.ok(bounded.every(line => line.length <= 65536))

  const { Logger } = load('src/main/utils/logger.ts', {
    './paths': { getAppPaths: () => { throw new Error('Paths must not resolve before initialization') } }
  })
  const dormant = new Logger()
  dormant.info('before lock')
  await dormant.flush()
  assert.equal(fs.readdirSync(directory).length, 0)
  fs.mkdirSync(appDirectory)
  fs.writeFileSync(path.join(directory, 'latest.log'), 'old mixed log')
  fs.writeFileSync(path.join(appDirectory, 'latest.log'), 'previous session\n')
  fs.writeFileSync(path.join(appDirectory, 'qzyrium.log'), 'legacy\n')
  fs.writeFileSync(path.join(appDirectory, 'qzyrium.log.1'), 'legacy backup\n')
  fs.writeFileSync(path.join(appDirectory, 'keep.txt'), 'unrelated')
  fs.writeFileSync(path.join(appDirectory, 'unrelated.log'), 'unrelated')
  // Force timestamp collisions and prove old logs are preserved, not replaced.
  const stamp = new Date(now)
  for (const name of ['latest.log', 'qzyrium.log', 'qzyrium.log.1']) fs.utimesSync(path.join(appDirectory, name), stamp, stamp)
  const logger = new Logger()
  logger.initialize(directory)
  const appEvents = []
  logger.setAppLogHandler(entry => appEvents.push(entry))
  logger.warn(`Fetching ${privateUrl}`)
  await logger.flush()
  assert.ok(!lastOutput.includes('personal-path'), 'console output is sanitized')
  assert.ok(!fs.readFileSync(path.join(appDirectory, 'latest.log'), 'utf8').includes('private-token'), 'disk output is sanitized')
  logger.writeEntry(entry)
  await logger.flush()
  assert.equal(appEvents.length, 1, 'only application events reach the app handler')
  assert.ok(!appEvents[0].payload.includes('private-token'), 'app journal messages are sanitized')
  const archives = () => fs.readdirSync(appDirectory).filter(name => /^\d{4}-.*\.log$/.test(name))
  assert.equal(archives().length, 3)
  const preserved = archives().map(name => fs.readFileSync(path.join(appDirectory, name), 'utf8')).sort()
  assert.deepEqual(preserved, ['legacy\n', 'legacy backup\n', 'previous session\n'].sort())
  let latest = fs.readFileSync(path.join(connectionDirectory, 'latest.log'), 'utf8')
  assert.ok(!latest.includes('[app]'), 'connection file excludes application events')
  assert.ok(!fs.readFileSync(path.join(appDirectory, 'latest.log'), 'utf8').includes('[mihomo]'), 'application file excludes connection events')
  assert.equal(fs.readFileSync(path.join(directory, 'latest.log'), 'utf8'), 'old mixed log', 'old mixed history is preserved')
  assert.ok(latest.includes('[WARNING] [mihomo] DNS failed'))
  assert.ok(latest.includes('[WARNING] [mihomo]   retry'))
  assert.ok(!latest.includes('\x1b'))
  logger.initialize(directory)
  assert.equal(archives().length, 3, 'initialization is idempotent')
  const payload = 'я'.repeat(256 * 1024)
  for (let index = 0; index < 21; index++) logger.info(payload)
  await logger.flush()
  assert.ok(fs.statSync(path.join(appDirectory, 'latest.log')).size <= 10 * 1024 * 1024, 'rotation counts UTF-8 bytes')
  assert.equal(archives().length, 4)

  now += 2000
  logger.info('new UTC day')
  await logger.flush()
  latest = fs.readFileSync(path.join(appDirectory, 'latest.log'), 'utf8')
  assert.ok(latest.includes('new UTC day'))
  assert.ok(!latest.includes(payload))
  assert.equal(archives().length, 5)
  assert.equal(fs.readFileSync(path.join(connectionDirectory, 'latest.log'), 'utf8'), entry.payload.split('\n').map(line => `[${entry.time}] [WARNING] [mihomo] ${line}\n`).join(''), 'app rotation leaves the connection log intact')
  logger.writeEntry({ source: 'mihomo', type: 'info', time: new Date(now).toISOString(), payload: 'new connection day' })
  await logger.flush()
  assert.equal(fs.readdirSync(connectionDirectory).length, 2, 'connection logs rotate independently on day change')
  assert.ok(fs.readFileSync(path.join(appDirectory, 'latest.log'), 'utf8').includes('new UTC day'), 'connection rotation leaves the application log intact')

  // Seed archive history to verify count and age limits without writing 200 MiB.
  for (let index = 1; index <= 25; index++) {
    const file = path.join(appDirectory, `2026-11-09T00-00-00-000Z-${index}.log`)
    fs.writeFileSync(file, String(index))
    fs.utimesSync(file, new Date(now - index * 1000), new Date(now - index * 1000))
  }
  const expired = path.join(appDirectory, '2020-01-01T00-00-00-000Z.log')
  fs.writeFileSync(expired, 'expired')
  fs.utimesSync(expired, new Date('2020-01-01'), new Date('2020-01-01'))
  const next = new Logger()
  next.initialize(directory)
  next.info('next session')
  await next.flush()
  assert.equal(archives().length, 20)
  assert.ok(!fs.existsSync(expired))
  assert.equal(fs.readFileSync(path.join(appDirectory, 'keep.txt'), 'utf8'), 'unrelated')
  assert.equal(fs.readFileSync(path.join(appDirectory, 'unrelated.log'), 'utf8'), 'unrelated')

  const broken = new Logger()
  broken.initialize(path.join(appDirectory, 'keep.txt', 'not-a-directory'))
  broken.info('still alive')
  await broken.flush()
  assert.equal(failures.length, 2, 'filesystem failures are reported without crashing')

  const hugeDirectory = path.join(directory, 'huge')
  const huge = new Logger()
  huge.initialize(hugeDirectory)
  huge.info('🌍'.repeat(3 * 1024 * 1024))
  await huge.flush()
  const hugeAppDirectory = path.join(hugeDirectory, 'app')
  const hugeFiles = fs.readdirSync(hugeAppDirectory)
  assert.equal(hugeFiles.length, 2, 'one oversized entry is split across files')
  let symbols = 0
  for (const name of hugeFiles) {
    const file = path.join(hugeAppDirectory, name)
    assert.ok(fs.statSync(file).size <= 10 * 1024 * 1024)
    const content = fs.readFileSync(file, 'utf8')
    assert.ok(!content.includes('\ufffd'), 'splitting preserves Unicode')
    for (const match of content.matchAll(/🌍/gu)) symbols += match[0] === '🌍' ? 1 : 0
  }
  assert.equal(symbols, 3 * 1024 * 1024, 'oversized entry is preserved in full')

  const maintenanceDirectory = path.join(directory, 'maintenance')
  const { Logger: MaintenanceLogger } = load('src/main/utils/logger.ts', {
    './paths': { getAppPaths: () => ({ logsDir: maintenanceDirectory }) },
    fs: { ...fs, readdirSync() { throw new Error('Cannot enumerate archives') } }
  })
  const maintenance = new MaintenanceLogger()
  maintenance.initialize()
  maintenance.info('cleanup failure must not stop writes')
  await maintenance.flush()
  assert.ok(fs.readFileSync(path.join(maintenanceDirectory, 'app', 'latest.log'), 'utf8').includes('cleanup failure must not stop writes'))

  const kernel = fs.readFileSync('src/main/services/KernelService.ts', 'utf8')
  const policyDirectory = path.join(directory, 'policy')
  const policy = new Logger()
  policy.initialize(policyDirectory)
  policy.configureSettings({ appLogEnabled: false, connectionLogMaxSizeMb: 1, connectionLogArchives: 1 })
  await policy.flush()
  policy.info('live only')
  await policy.flush()
  assert.equal(fs.readFileSync(path.join(policyDirectory, 'app', 'latest.log'), 'utf8'), '', 'disabled app disk recording')
  for (let i = 0; i < 4; i++) policy.writeEntry({ type: 'info', source: 'mihomo', time: new Date(now).toISOString(), payload: 'x'.repeat(700000) })
  await policy.flush()
  assert.equal(fs.readdirSync(path.join(policyDirectory, 'connections')).length, 2, 'custom archive count is enforced')
  for (const name of fs.readdirSync(path.join(policyDirectory, 'connections'))) assert.ok(fs.statSync(path.join(policyDirectory, 'connections', name)).size <= 1024 * 1024)
  policy.configureSettings({ appLogEnabled: true, connectionLogEnabled: false })
  await policy.flush()
  policy.info('recording resumed')
  await policy.flush()
  assert.ok(fs.readFileSync(path.join(policyDirectory, 'app', 'latest.log'), 'utf8').includes('recording resumed'))
  assert.ok(!kernel.includes('startLogStream('), 'only pipe output should feed the journal')
  let release
  let opens = 0
  const gate = new Promise(resolve => { release = resolve })
  const { Logger: BufferedLogger } = load('src/main/utils/logger.ts', {
    './paths': {},
    fs: { ...fs, appendFileSync() { throw Error('Synchronous append is forbidden') }, promises: {
      ...fs.promises, open: async (...args) => { opens++; await gate; return fs.promises.open(...args) }
    } }
  })
  const buffered = new BufferedLogger()
  const bufferedDirectory = path.join(directory, 'buffered')
  buffered.initialize(bufferedDirectory)
  buffered.configureSettings({ appLogMaxSizeMb: 100 })
  for (let i = 0; i < 1000; i++) buffered.info(`ordered-${i}`)
  let flushed = false
  const flushing = buffered.flush().then(() => { flushed = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(flushed, false, 'flush waits for outstanding asynchronous writes')
  assert.equal(fs.statSync(path.join(bufferedDirectory, 'app', 'latest.log')).size, 0, 'blocked disk does not force synchronous writes')
  for (let i = 0; i < 40; i++) buffered.info(`overload-${i}:` + 'x'.repeat(1024 * 1024))
  release()
  await flushing
  const bufferedFile = path.join(bufferedDirectory, 'app', 'latest.log')
  const bufferedText = fs.readFileSync(bufferedFile, 'utf8')
  const ordered = [...bufferedText.matchAll(/ordered-(\d+)/g)].map(match => Number(match[1]))
  assert.deepEqual(ordered, Array.from({ length: 1000 }, (_, i) => i), 'accepted records retain order')
  assert.ok(fs.statSync(bufferedFile).size <= 32 * 1024 * 1024, 'blocked-disk queue is bounded')
  assert.ok(!bufferedText.includes('overload-39:'), 'overflow does not retain an unbounded backlog')
  assert.equal(opens, 1, 'writes reuse the open file descriptor')
  await buffered.close()
  buffered.info('after close')
  await buffered.flush()
  assert.ok(!fs.readFileSync(bufferedFile, 'utf8').includes('after close'), 'closed logger does not reopen its file')
  console.log('PASS: parsing, UTF-8 streaming, partial lines, size/day/session rotation, legacy migration, retention, filesystem errors and single log source')
  console.log('PASS: asynchronous ordered writes, persistent descriptor, blocked-disk queue budget and shutdown flush')
} finally {
  await Promise.all(instances.map(instance => instance.close()))
  const resolved = fs.realpathSync(directory)
  const tempRoot = fs.realpathSync(os.tmpdir())
  assert.equal(path.dirname(resolved), tempRoot)
  assert.ok(path.basename(resolved).startsWith('qzyrium-logs-'))
  fs.rmSync(resolved, { recursive: true, force: true })
}
})().catch(error => { console.error(error); process.exitCode = 1 })
