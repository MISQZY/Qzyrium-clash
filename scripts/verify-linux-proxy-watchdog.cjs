const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { PassThrough } = require('node:stream')
const { watch } = require('../resources/linux-proxy-watchdog.cjs')
const { entries } = require('../resources/linux-proxy-recovery.cjs')

async function verify() {
  const root = path.resolve('artifacts/linux-proxy-watchdog')
  fs.mkdirSync(root, { recursive: true })
  const directory = fs.mkdtempSync(path.join(root, 'run-'))
  const filename = path.join(directory, 'linux-proxy-recovery.json')
  const snapshot = { version: 1, backend: 'gnome', binary: 'gsettings',
    values: entries('gnome').map(entry => ({ ...entry, value: entry.key === 'mode' ? "'auto'" : "'original'" })) }
  fs.writeFileSync(filename, JSON.stringify(snapshot))
  const input = new PassThrough()
  const restored = []
  await watch(input, directory, async (bin, args) => restored.push([bin, ...args]), {
    graceMs: 0, ready() {
      assert.ok(!fs.existsSync(filename), 'stale settings are recovered before READY')
      assert.equal(restored.at(-1).at(-2), 'mode', 'restore the original mode last')
      input.end()
    }
  })
  fs.writeFileSync(filename, JSON.stringify(snapshot))
  await assert.rejects(watch(new PassThrough(), directory, async () => { throw new Error('Backend failed') }, { graceMs: 0 }), /Backend failed/)
  assert.ok(fs.existsSync(filename), 'failed restoration retains the durable journal')
  fs.unlinkSync(filename)

  // Run the actual watcher lifecycle in an orphaned process; only backend writes are mocked.
  const watcherFile = path.join(directory, 'watcher.cjs')
  const parentFile = path.join(directory, 'parent.cjs')
  const log = path.join(directory, 'restored.json')
  fs.writeFileSync(watcherFile, `
    const fs = require('node:fs');
    const { watch } = require(${JSON.stringify(path.resolve('resources/linux-proxy-watchdog.cjs'))});
    const calls = [];
    process.stdout.on('error', () => {});
    watch(process.stdin, ${JSON.stringify(directory)}, async (bin, args) => {
      calls.push([bin, ...args]); fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify(calls));
    }, { graceMs: 0, ready: () => process.stdout.write('READY\\n') })
      .then(() => process.exit(0)).catch(() => process.exit(1));
  `)
  fs.writeFileSync(parentFile, `
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, [${JSON.stringify(watcherFile)}], { detached: true, windowsHide: true, stdio: ['pipe','pipe','ignore'] });
    child.stdout.once('data', () => process.send({ ready: true, pid: child.pid }));
    setInterval(() => {}, 1000);
  `)
  const parent = spawn(process.execPath, [parentFile], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
  let watcherPid
  try {
    const ready = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Watcher readiness timed out')), 10_000)
      parent.once('message', message => { clearTimeout(timer); resolve(message) })
      parent.once('error', error => { clearTimeout(timer); reject(error) })
    })
    watcherPid = ready.pid
    fs.writeFileSync(filename, JSON.stringify(snapshot))
    parent.kill()
    for (let attempt = 0; attempt < 100 && fs.existsSync(filename); attempt++) await new Promise(resolve => setTimeout(resolve, 50))
    assert.ok(!fs.existsSync(filename), 'parent termination triggers recovery without Electron')
    assert.deepEqual(JSON.parse(fs.readFileSync(log, 'utf8')), snapshot.values.map(({ schema, key, value }) => ['gsettings', 'set', schema, key, value]))
  } finally {
    parent.kill()
    if (watcherPid) { try { process.kill(watcherPid) } catch {} }
  }
  console.log('PASS: Linux proxy startup recovery, failure retry and restoration after actual parent termination')
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
