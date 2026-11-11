const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { checks, getChecks } = require('./test-registry.cjs')
const { runChecks } = require('./test-runner.cjs')

async function verify() {
  assert.equal(new Set(checks.map(check => check.id)).size, checks.length, 'check IDs are unique')
  for (const check of checks) {
    assert.ok(fs.existsSync(check.file), `missing test: ${check.id}`)
    assert.ok(['node', 'electron'].includes(check.runtime))
    assert.ok(check.timeoutMs > 0)
  }
  const aggregators = new Set(['verify-functional.cjs', 'verify-ui-suite.cjs'])
  const registered = new Set(checks.map(check => path.basename(check.file)))
  for (const file of fs.readdirSync(__dirname).filter(file => /^verify-.*\.cjs$/.test(file))) {
    assert.ok(registered.has(file) || aggregators.has(file), `${file} must belong to a suite`)
  }
  assert.throws(() => getChecks('unknown'), /Unknown test suite/)
  assert.equal(getChecks('ui').filter(check => check.runtime !== 'electron').length, 0)
  const output = path.resolve(__dirname, '../artifacts/test-runner-check')
  fs.mkdirSync(output, { recursive: true })
  const directory = fs.mkdtempSync(path.join(output, 'run-'))
  const marker = path.join(directory, 'continued.txt')
  const fixture = (id, source, timeoutMs = 10_000) => {
    const file = path.join(directory, `${id}.cjs`)
    fs.writeFileSync(file, source)
    return { id, file, runtime: 'node', args: [], timeoutMs }
  }
  const cases = [
    fixture('pass', "console.log('first passed')"),
    fixture('fail', "console.error('intentional failure'); process.exit(23)"),
    fixture('timeout', 'setInterval(() => {}, 1000)', 500),
    { id: 'missing', file: path.join(directory, 'missing.cjs'), runtime: 'node',
      executable: path.join(directory, 'missing-runtime.exe'), args: [], timeoutMs: 1000 },
    fixture('after-failure', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'continued')`)
  ]
  const report = await runChecks('fixture', cases, { outputDir: directory, liveOutput: false })
  assert.deepEqual(report.results.map(result => result.status), ['passed', 'failed', 'timeout', 'error', 'passed'])
  assert.equal(report.results[1].exitCode, 23)
  assert.equal(report.passed, 2)
  assert.equal(report.failed, 3)
  assert.equal(fs.readFileSync(marker, 'utf8'), 'continued', 'execution continues after all kinds of failure')
  assert.ok(fs.readFileSync(report.results[1].logPath, 'utf8').includes('intentional failure'))
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'report.json'), 'utf8')), report)
  console.log('PASS: registry covers every test; runner continues after failure, timeout and launch errors and persists complete results/logs')
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
