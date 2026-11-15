const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { promisify } = require('node:util')
const { execFile } = require('node:child_process')
const { restoreSnapshot } = require('./linux-proxy-recovery.cjs')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function acquireLease(filename) {
  const token = randomUUID()
  const candidate = `${filename}.${process.pid}.${token}.tmp`
  // Publish a complete lease atomically: a crash while writing cannot leave an empty lock.
  fs.writeFileSync(candidate, JSON.stringify({ pid: process.pid, token }), { flag: 'wx', mode: 0o600 })
  let invalidLease, invalidSince = 0
  try {
    for (let attempt = 0; attempt < 250; attempt++) {
      try {
        fs.linkSync(candidate, filename)
        return () => {
          if (JSON.parse(fs.readFileSync(filename, 'utf8')).token === token) fs.unlinkSync(filename)
        }
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
      }
      try {
        const text = fs.readFileSync(filename, 'utf8')
        let lease
        try { lease = JSON.parse(text) }
        catch (parseError) { if (!(parseError instanceof SyntaxError)) throw parseError }
        if (Number.isSafeInteger(lease?.pid) && lease.pid > 0) {
          invalidLease = undefined
          try { process.kill(lease.pid, 0) }
          catch (probeError) {
            if (probeError.code !== 'ESRCH') throw probeError
            if (fs.readFileSync(filename, 'utf8') === text) fs.unlinkSync(filename)
            continue
          }
        } else {
          // Older watchers wrote in place. Give an unfinished write time to complete,
          // then recover a stable malformed lock left by a crashed writer.
          const stat = fs.statSync(filename)
          const identity = JSON.stringify([text, stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs])
          if (invalidLease !== identity) {
            invalidLease = identity
            invalidSince = Date.now()
          } else if (Date.now() - invalidSince >= 2000 && fs.readFileSync(filename, 'utf8') === text) {
            fs.unlinkSync(filename)
            continue
          }
        }
      } catch (error) {
        // The owner or another waiting watcher may have removed the previous lease.
        if (error.code === 'ENOENT') continue
        throw error
      }
      await delay(100)
    }
    throw new Error('Previous Linux proxy recovery is still running')
  } finally {
    fs.unlinkSync(candidate)
  }
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
