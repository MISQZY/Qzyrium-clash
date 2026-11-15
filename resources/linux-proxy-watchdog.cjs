const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { promisify } = require('node:util')
const { execFile } = require('node:child_process')
const { restoreSnapshot } = require('./linux-proxy-recovery.cjs')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function acquireLease(filename) {
  const token = randomUUID()
  for (let attempt = 0; attempt < 250; attempt++) {
    try {
      fs.writeFileSync(filename, JSON.stringify({ pid: process.pid, token }), { flag: 'wx', mode: 0o600 })
      return () => {
        if (JSON.parse(fs.readFileSync(filename, 'utf8')).token === token) fs.unlinkSync(filename)
      }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      let text
      try { text = fs.readFileSync(filename, 'utf8') }
      catch (readError) { if (readError.code === 'ENOENT') continue; throw readError }
      try {
        const { pid } = JSON.parse(text)
        if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid Linux proxy recovery lease', { cause: error })
        try { process.kill(pid, 0) }
        catch (probeError) {
          if (probeError.code !== 'ESRCH') throw probeError
          if (fs.readFileSync(filename, 'utf8') === text) fs.unlinkSync(filename)
          continue
        }
      } catch (parseError) {
        // A concurrent watcher may still be writing its new lease.
        if (!(parseError instanceof SyntaxError)) throw parseError
      }
      await delay(100)
    }
  }
  throw new Error('Previous Linux proxy recovery is still running')
}

async function watch(input, directory, execute = promisify(execFile), { ready = () => {}, graceMs = 6000 } = {}) {
  let finish
  const ended = new Promise(resolve => { finish = resolve })
  input.once('end', finish)
  input.once('error', finish)
  input.resume()
  process.once('SIGTERM', finish)
  process.once('SIGINT', finish)
  let release
  try {
    release = await acquireLease(path.join(directory, 'linux-proxy-recovery.lock'))
    const filename = path.join(directory, 'linux-proxy-recovery.json')
    const recover = async () => {
      if (!fs.existsSync(filename)) return
      // Commands already spawned by a dying Electron process have a 5s deadline.
      await delay(graceMs)
      await restoreSnapshot(filename, execute)
    }
    await recover()
    ready()
    await ended
    await recover()
  } finally {
    process.removeListener('SIGTERM', finish)
    process.removeListener('SIGINT', finish)
    release?.()
  }
}

module.exports = { watch, acquireLease }

if (require.main === module) {
  process.stdout.on('error', () => {})
  process.stderr.on('error', () => {})
  watch(process.stdin, process.argv[2], undefined, { ready: () => process.stdout.write('READY\n') })
    .catch(error => { console.error(`Linux proxy recovery failed: ${error.message}`); process.exitCode = 1 })
}
