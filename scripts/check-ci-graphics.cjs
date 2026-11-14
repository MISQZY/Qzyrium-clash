// Select a hosted-runner driver by exercising the complete native pixel test.
// Every candidate must retain the production GPU policy and pass all assertions.
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const output = path.resolve(__dirname, '../artifacts/ci-graphics')
fs.mkdirSync(output, { recursive: true })
const results = []
for (const backend of ['d3d11-warp', 'swiftshader']) {
  console.log(`Checking native window presentation with ${backend}`)
  const result = spawnSync(require('electron'), [path.join(__dirname, 'verify-native-window-ui.cjs')], {
    cwd: path.resolve(__dirname, '..'), env: { ...process.env, UI_ANGLE: backend },
    windowsHide: true, encoding: 'utf8', timeout: 90_000, maxBuffer: 4 * 1024 * 1024
  })
  const log = (result.stdout ?? '') + (result.stderr ?? '') + (result.error ? `\n${result.error.message}` : '')
  fs.writeFileSync(path.join(output, `${backend}.log`), log)
  console.log(log)
  results.push({ backend, exitCode: result.status, error: result.error?.message })
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(results, null, 2))
  if (result.status === 0 && !result.error) {
    if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `UI_ANGLE=${backend}\n`)
    console.log(`PASS: ${backend} passed native resize, all pixel probes and GPU process checks`)
    process.exit(0)
  }
}
console.error('No graphics backend passed the native presentation contract. See artifacts/ci-graphics.')
process.exit(1)
