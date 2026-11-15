const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadLinuxProxy } = require('./fixtures/linux-proxy.cjs')

async function verify() {
  const directory = path.resolve('artifacts/linux-proxy')
  fs.mkdirSync(directory, { recursive: true })
  for (const env of [{ XDG_CURRENT_DESKTOP: 'GNOME' }, { XDG_CURRENT_DESKTOP: 'KDE' }]) {
    const proxy = loadLinuxProxy(async () => { throw new Error('Backend unavailable') }, env)
    await assert.rejects(proxy.setManual('127.0.0.1', 7895), /Failed/)
    await assert.rejects(proxy.setAuto('http://127.0.0.1/proxy.pac'), /Failed/)
    await assert.rejects(proxy.disable(), /Failed/)
  }
  for (const desktop of ['GNOME', 'KDE']) {
    const commands = []
    const proxy = loadLinuxProxy(async (bin, args) => { commands.push([bin, ...args]); return { stdout: '' } },
      { XDG_CURRENT_DESKTOP: desktop }, path.join(fs.mkdtempSync(path.join(directory, 'bypass-')), 'journal.json'))
    await proxy.setManual('127.0.0.1', 7895, ['private.example'])
    await proxy.setManual('127.0.0.1', 7895, [])
    const writes = commands.filter(command => command.includes(desktop === 'GNOME' ? 'ignore-hosts' : 'NoProxyFor'))
    assert.equal(writes.at(-1).at(-1), desktop === 'GNOME' ? '[]' : '')
  }
  console.log('PASS: Linux proxy backend failures propagate to the caller')
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
