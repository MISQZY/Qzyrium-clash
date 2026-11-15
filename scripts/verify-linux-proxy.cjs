const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadLinuxProxy } = require('./fixtures/linux-proxy.cjs')

async function verify() {
  const directory = path.resolve('artifacts/linux-proxy')
  fs.mkdirSync(directory, { recursive: true })
  for (const env of [{ XDG_CURRENT_DESKTOP: 'GNOME' }, { XDG_CURRENT_DESKTOP: 'KDE' }]) {
    const proxy = loadLinuxProxy(async () => { throw new Error('Backend unavailable') }, env,
      path.join(fs.mkdtempSync(path.join(directory, 'failure-')), 'journal.json'))
    await assert.rejects(proxy.setManual('127.0.0.1', 7895), /Failed/)
    await assert.rejects(proxy.setAuto('http://127.0.0.1/proxy.pac'), /Failed/)
    await proxy.disable() // With no journal, never disable another application's proxy.
  }
  for (const desktop of ['GNOME', 'KDE']) {
    const filename = path.join(fs.mkdtempSync(path.join(directory, 'restore-')), 'journal.json')
    const { entries } = require('../resources/linux-proxy-recovery.cjs')
    const backend = desktop === 'GNOME' ? 'gnome' : 'kde'
    const original = new Map(entries(backend).map(({ schema, key }) => [schema + '/' + key,
      backend === 'gnome' ? key === 'mode' ? "'auto'" : key === 'port' ? '3128' : "'company-value'" : 'company-value']))
    if (backend === 'kde') original.delete('Proxy Settings/socksProxy')
    const values = new Map(original)
    let failKey = null
    const execute = async (bin, args) => {
      if (args[0] === '--version' || args[0] === '--help' || bin === 'dbus-send') return { stdout: '' }
      const schema = backend === 'gnome' ? args[1] : args[args.indexOf('--group') + 1]
      const key = backend === 'gnome' ? args[2] : args[args.indexOf('--key') + 1]
      const id = schema + '/' + key
      if (args[0] === 'get' || bin.startsWith('kreadconfig')) {
        return { stdout: (values.get(id) ?? args[args.indexOf('--default') + 1]) + '\n' }
      }
      assert.ok(fs.existsSync(filename), 'original values must be durable before any mutation')
      if (key === failKey) { failKey = null; throw new Error('Write failed') }
      if (args.includes('--delete')) values.delete(id)
      else values.set(id, args.at(-1))
      return { stdout: '' }
    }
    const proxy = loadLinuxProxy(execute, { XDG_CURRENT_DESKTOP: desktop }, filename)
    await proxy.setManual('127.0.0.1', 7895)
    await proxy.setAuto('http://127.0.0.1/proxy.pac')
    await loadLinuxProxy(execute, { XDG_CURRENT_DESKTOP: desktop }, filename).disable()
    assert.deepEqual(values, original, 'mode transitions and a new instance retain the original values and absent keys')
    assert.ok(!fs.existsSync(filename))
    failKey = backend === 'gnome' ? 'port' : 'httpsProxy'
    await assert.rejects(proxy.setManual('127.0.0.1', 7895), /Failed/)
    assert.deepEqual(values, original, 'partial updates roll back before returning failure')
    fs.writeFileSync(filename, '{bad')
    await assert.rejects(proxy.disable())
    assert.deepEqual(values, original, 'corrupt journals cannot change system settings')
  }
  for (const desktop of ['GNOME', 'KDE']) {
    const commands = []
    const proxy = loadLinuxProxy(async (bin, args) => { commands.push([bin, ...args]); return { stdout: '' } },
      { XDG_CURRENT_DESKTOP: desktop }, path.join(fs.mkdtempSync(path.join(directory, 'bypass-')), 'journal.json'))
    await proxy.setManual('127.0.0.1', 7895, ['private.example'])
    await proxy.setManual('127.0.0.1', 7895, [])
    const writes = commands.filter(command => command.includes(desktop === 'GNOME' ? 'ignore-hosts' : 'NoProxyFor'))
    assert.equal(writes.at(-1).at(-1), desktop === 'GNOME' ? '[]' : '')
    if (desktop === 'KDE') {
      await proxy.setManual('::1', 7895)
      assert.equal(commands.filter(command => command.includes('httpProxy')).at(-1).at(-1), 'http://[::1]:7895')
      assert.equal(commands.filter(command => command.includes('socksProxy')).at(-1).at(-1), 'socks://[::1]:7895')
    }
  }
  console.log('PASS: Linux proxy backend failures propagate to the caller')
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
