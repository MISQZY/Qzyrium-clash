const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { getChecks } = require('./test-registry.cjs')

const root = path.resolve(__dirname, '..')

function stopProcessTree(child) {
  if (!child.pid) return
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    killer.once('error', () => child.kill())
    killer.once('exit', code => { if (code !== 0) child.kill() })
  } else {
    try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
  }
}

function executeCheck(check, directory, { liveOutput = true } = {}) {
  if (!['node', 'electron'].includes(check.runtime)) throw new Error(`Unknown test runtime: ${check.runtime}`)
  const executable = check.executable ?? (check.runtime === 'node' ? process.execPath : require('electron'))
  return new Promise(resolve => {
    const started = Date.now()
    const logPath = path.join(directory, `${check.id}.log`)
    const log = fs.createWriteStream(logPath)
    const child = spawn(executable, [check.file, ...check.args], {
      cwd: root, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe']
    })
    let timedOut = false, settled = false
    const timer = setTimeout(() => { timedOut = true; stopProcessTree(child) }, check.timeoutMs)
    const finish = (exitCode, signal, error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const result = {
        id: check.id, status: timedOut ? 'timeout' : error ? 'error' : exitCode === 0 ? 'passed' : 'failed',
        exitCode, signal, durationMs: Date.now() - started, logPath,
        ...(error ? { error: error.message } : {})
      }
      log.end(() => resolve(result))
    }
    for (const [stream, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
      stream.on('data', data => { log.write(data); if (liveOutput) output.write(data) })
    }
    child.once('error', error => finish(null, null, error))
    child.once('close', (code, signal) => finish(code, signal))
  })
}

async function runChecks(suite, checks, options = {}) {
  const directory = path.resolve(options.outputDir ?? path.join(root, 'artifacts/test-results', suite))
  fs.mkdirSync(directory, { recursive: true })
  const reportPath = path.join(directory, 'report.json')
  const report = { suite, startedAt: new Date().toISOString(), total: checks.length, passed: 0, failed: 0, results: [] }
  const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
  save()
  for (const [index, check] of checks.entries()) {
    if (options.liveOutput !== false) console.log(`\n[${index + 1}/${checks.length}] ${check.id}`)
    let result
    try { result = await executeCheck(check, directory, options) }
    catch (error) { result = { id: check.id, status: 'error', exitCode: null, error: error.message } }
    report.results.push(result)
    if (result.status === 'passed') report.passed++
    else report.failed++
    save()
    if (options.liveOutput !== false) console.log(`${result.status.toUpperCase()}: ${check.id}`)
  }
  report.finishedAt = new Date().toISOString()
  save()
  if (options.liveOutput !== false) console.log(`\n${suite}: ${report.passed}/${report.total} passed, ${report.failed} failed. Report: ${reportPath}`)
  return report
}

function runSuite(suite) {
  return runChecks(suite, getChecks(suite))
}

module.exports = { runChecks, runSuite }

if (require.main === module) {
  const suites = process.argv.slice(2)
  ;(async () => {
    let failed = false
    for (const suite of suites.length ? suites : ['functional', 'build', 'ui']) {
      if ((await runSuite(suite)).failed) failed = true
    }
    process.exitCode = failed ? 1 : 0
  })().catch(error => { console.error(error); process.exitCode = 1 })
}
