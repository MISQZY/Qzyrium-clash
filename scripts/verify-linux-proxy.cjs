const assert = require('node:assert/strict')
const { loadLinuxProxy } = require('./fixtures/linux-proxy.cjs')

async function verify() {
  for (const env of [{ XDG_CURRENT_DESKTOP: 'GNOME' }, { XDG_CURRENT_DESKTOP: 'KDE' }]) {
    const proxy = loadLinuxProxy(async () => { throw new Error('Backend unavailable') }, env)
    await assert.rejects(proxy.setManual('127.0.0.1', 7895), /Failed/)
    await assert.rejects(proxy.setAuto('http://127.0.0.1/proxy.pac'), /Failed/)
    await assert.rejects(proxy.disable(), /Failed/)
  }
  console.log('PASS: Linux proxy backend failures propagate to the caller')
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
