const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { loadTypeScript } = require('./fixtures/typescript.cjs')

async function verify() {
  if (process.argv.includes('--native')) {
    const { app, nativeImage } = require('electron')
    await app.whenReady()
    try {
      const name = process.argv[process.argv.indexOf('--native') + 1]
      const { getProcessIconDataUrl } = loadTypeScript('src/main/utils/process-icon.ts')
      const url = await getProcessIconDataUrl(name)
      assert.ok(url?.startsWith('data:image/png;base64,'), 'native executable icon extracted')
      const icon = nativeImage.createFromDataURL(url)
      assert.ok(!icon.isEmpty())
      const output = path.resolve('artifacts/process-icons')
      fs.mkdirSync(output, { recursive: true })
      fs.writeFileSync(path.join(output, 'native.png'), icon.toPNG())
      console.log('PASS: native icon resolved by executable name', icon.getSize())
    } finally { app.quit() }
    return
  }

  if (process.platform !== 'win32') {
    console.log('SKIP: Windows executable name resolution')
    return
  }
  const local = process.env.LOCALAPPDATA
  assert.ok(local)
  const root = path.join(local, 'Example')
  const latest = path.join(root, 'app-1.0.10', 'Example.exe')
  const older = path.join(root, 'app-1.0.9', 'Example.exe')
  const installed = new Set([latest, older])
  const extracted = []
  let shellLookups = 0
  const { getProcessIconDataUrl, clearProcessIconCache } = loadTypeScript('src/main/utils/process-icon.ts', {
    electron: { app: { getFileIcon: async target => {
      extracted.push(target)
      return { isEmpty: () => false, toDataURL: () => 'data:image/png;base64,fixture' }
    } } },
    'node:fs': { existsSync: target => installed.has(target) },
    'node:fs/promises': { readdir: async directory => directory === root
      ? ['app-1.0.9', 'app-1.0.10', 'packages'].map(name => ({ name, isDirectory: () => true })) : [] },
    'node:child_process': { execFile: (binary, args, options, callback) => {
      shellLookups++
      assert.ok(path.isAbsolute(binary))
      assert.ok(!args.at(-1).includes(options.env.QZYRIUM_ICON_PROCESS_NAME), 'name is passed as data')
      assert.equal(options.windowsHide, true)
      callback(null, '')
    } }
  })
  const icons = await Promise.all([getProcessIconDataUrl('Example.exe'), getProcessIconDataUrl('Example.exe')])
  assert.ok(icons.every(Boolean))
  assert.deepEqual(extracted, [latest], 'latest Squirrel version; concurrent icon requests deduplicated')
  assert.equal(shellLookups, 0, 'installed file found without shell lookup')
  await getProcessIconDataUrl('Example.exe')
  assert.equal(extracted.length, 1, 'successful icon cached')
  assert.equal(await getProcessIconDataUrl('Later.exe'), null)
  const later = path.join(local, 'Later', 'Later.exe')
  installed.add(later)
  assert.ok(await getProcessIconDataUrl('Later.exe'), 'a missing app can be resolved after installation')
  const before = shellLookups
  for (const invalid of ['\\\\server\\share\\Example.exe', '\\\\?\\C:\\Example.exe', 'bad\0.exe']) {
    assert.equal(await getProcessIconDataUrl(invalid), null)
  }
  assert.equal(shellLookups, before, 'network and namespace paths rejected before lookup')
  clearProcessIconCache()
  assert.ok(await getProcessIconDataUrl(latest))
  assert.equal(extracted.at(-1), latest, 'full paths still work')
  console.log('PASS: process icon name/path resolution, version ordering, request deduplication, cache and retry')
}

verify().catch(error => { console.error(error); process.exitCode = 1; if (process.versions.electron) require('electron').app.exit(1) })
