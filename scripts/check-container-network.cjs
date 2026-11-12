const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const { randomUUID } = require('node:crypto')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { coreFor, downloadVerified, installVerified } = require('./resource-integrity.cjs')
const execute = promisify(execFile)
const image = 'python@sha256:7984cf56ceaddebe4fefeb75d64000b9f45d8b77b11a09b24524da6cdc3af0c8'

async function verify() {
  const root = path.resolve('artifacts/container-network')
  fs.mkdirSync(root, { recursive: true })
  const output = fs.mkdtempSync(path.join(root, 'run-'))
  const fixtures = path.join(output, 'fixtures'), results = path.join(output, 'results')
  fs.mkdirSync(fixtures)
  fs.mkdirSync(results)
  const core = coreFor('linux', 'x64')
  const archive = path.resolve('node_modules/.temp', new URL(core.url).pathname.split('/').pop())
  fs.mkdirSync(path.dirname(archive), { recursive: true })
  installVerified(path.join(fixtures, 'mihomo'), zlib.gunzipSync(await downloadVerified(core.url, archive, core.archiveSha256)), core.sha256)
  fs.copyFileSync(path.resolve('scripts/fixtures/container-network.py'), path.join(fixtures, 'probe.py'))
  const name = `qzyrium-network-${randomUUID().slice(0, 8)}`
  const peer = `${name}-peer`
  const containers = [peer]
  const docker = async args => (await execute('docker', args, { windowsHide: true, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 })).stdout.trim()
  const mount = ['--mount', `type=bind,source=${fixtures},target=/fixtures,readonly`]
  const report = { scope: 'Linux Mihomo core only; Windows Electron, watchdog and system proxy are not exercised', results: [] }
  let networkCreated = false
  try {
    const platform = await docker(['info', '--format', '{{.OSType}}/{{.Architecture}}'])
    if (platform !== 'linux/x86_64') throw new Error(`Expected a Linux x86_64 Docker daemon, got ${platform}`)
    await docker(['network', 'create', name])
    networkCreated = true
    await docker(['run', '-d', '--name', peer, '--network', name, '--cap-add', 'NET_ADMIN', ...mount,
      image, 'python', '/fixtures/probe.py', 'peer'])
    const peerIP = await docker(['inspect', '--format', `{{(index .NetworkSettings.Networks "${name}").IPAddress}}`, peer])
    for (let attempt = 0; ; attempt++) {
      if ((await docker(['logs', peer])).includes('READY')) break
      if (attempt >= 50) throw new Error('Controlled network peer did not become ready')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    for (const mode of ['proxy', 'gvisor', 'system', 'mixed']) {
      for (const termination of ['SIGTERM', 'SIGKILL']) {
        const caseName = `${mode}-${termination.toLowerCase()}`
        const container = `${name}-${caseName}`
        containers.push(container)
        try {
          const stdout = await docker(['run', '--name', container, '--network', name, '--cap-add', 'NET_ADMIN', '--device', '/dev/net/tun',
            ...mount, '--mount', `type=bind,source=${results},target=/results`, image,
            'python', '/fixtures/probe.py', 'probe', peerIP, mode, core.sha256, termination])
          console.log(stdout)
        } catch (error) {
          console.error(error.stdout || error.message)
        }
        const filename = path.join(results, `${caseName}.json`)
        report.results.push(fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename)) : { mode, termination, status: 'failed', error: 'Container did not produce a report' })
      }
    }
  } catch (error) {
    report.error = error.message
    throw error
  } finally {
    // Remove only containers/network created under this run's random name.
    for (const container of containers.reverse()) await docker(['rm', '-f', container]).catch(() => {})
    if (networkCreated) await docker(['network', 'rm', name]).catch(() => {})
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
    console.log(`REPORT ${output}`)
  }
  process.exitCode = report.results.some(result => result.status !== 'passed') ? 1 : 0
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
