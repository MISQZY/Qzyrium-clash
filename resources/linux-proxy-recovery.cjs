const fs = require('node:fs')

// Restore the mode last, after its original server/PAC and exceptions are back.
const gnome = [
  ['org.gnome.system.proxy.http', 'host'], ['org.gnome.system.proxy.http', 'port'],
  ['org.gnome.system.proxy.https', 'host'], ['org.gnome.system.proxy.https', 'port'],
  ['org.gnome.system.proxy.socks', 'host'], ['org.gnome.system.proxy.socks', 'port'],
  ['org.gnome.system.proxy', 'ignore-hosts'], ['org.gnome.system.proxy', 'autoconfig-url'],
  ['org.gnome.system.proxy', 'mode']
]
const kde = ['httpProxy', 'httpsProxy', 'socksProxy', 'NoProxyFor', 'Proxy Config Script', 'ProxyType']

function entries(backend) {
  if (backend === 'gnome') return gnome.map(([schema, key]) => ({ schema, key }))
  if (backend === 'kde') return kde.map(key => ({ schema: 'Proxy Settings', key }))
  throw new Error('Invalid Linux proxy backend')
}

function readSnapshot(filename) {
  let text
  try { text = fs.readFileSync(filename, 'utf8') }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
  if (text.length > 1024 * 1024) throw new Error('Linux proxy recovery file is too large')
  const data = JSON.parse(text)
  if (data.version !== 1 || !['gnome', 'kde'].includes(data.backend) ||
      !(data.backend === 'gnome' ? data.binary === 'gsettings' : ['kwriteconfig5', 'kwriteconfig6'].includes(data.binary))) {
    throw new Error('Invalid Linux proxy recovery file')
  }
  const expected = entries(data.backend)
  if (!Array.isArray(data.values) || data.values.length !== expected.length || expected.some((entry, index) => {
    const value = data.values[index]
    return !value || value.schema !== entry.schema || value.key !== entry.key ||
      !(typeof value.value === 'string' || (data.backend === 'kde' && value.value === null))
  })) throw new Error('Invalid Linux proxy recovery values')
  return data
}

async function restoreSnapshot(filename, execute) {
  const snapshot = readSnapshot(filename)
  if (!snapshot) return
  for (const { schema, key, value } of snapshot.values) {
    const args = snapshot.backend === 'gnome'
      ? ['set', schema, key, value]
      : ['--file', 'kioslaverc', '--group', schema, '--key', key, ...(value === null ? ['--delete'] : [value])]
    await execute(snapshot.binary, args, { timeout: 5000 })
  }
  if (snapshot.backend === 'kde') {
    await execute('dbus-send', ['--type=signal', '/KIO/Scheduler',
      'org.kde.KIO.Scheduler.reparseSlaveConfiguration', 'string:'], { timeout: 2000 }).catch(() => {})
  }
  fs.unlinkSync(filename)
}

module.exports = { entries, readSnapshot, restoreSnapshot }
