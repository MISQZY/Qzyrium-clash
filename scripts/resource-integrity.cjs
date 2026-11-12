const fs = require('node:fs')
const path = require('node:path')
const { createHash, randomUUID } = require('node:crypto')
const manifest = require('./resources.lock.json')

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

function matchesFile(filename, expected) {
  try { return sha256(fs.readFileSync(filename)) === expected }
  catch (error) { if (error.code === 'ENOENT') return false; throw error }
}

function installVerified(filename, bytes, expected, executable = false) {
  if (sha256(bytes) !== expected) throw new Error(`SHA-256 mismatch: ${path.basename(filename)}`)
  const temporary = `${filename}.${randomUUID()}.tmp`
  try {
    fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: executable ? 0o755 : 0o644 })
    fs.renameSync(temporary, filename)
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary) }
}

async function downloadVerified(url, filename, expected, fetcher = fetch) {
  if (matchesFile(filename, expected)) return fs.readFileSync(filename)
  const response = await fetcher(url, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`Resource download failed (HTTP ${response.status}): ${path.basename(filename)}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  installVerified(filename, bytes, expected)
  return bytes
}

function coreFor(platform, arch) {
  const core = manifest.mihomo.targets[`${platform}-${arch}`]
  if (!core) throw new Error(`Unsupported platform/arch: ${platform}-${arch}`)
  return core
}

function verifyRuntimeResources(root, platform = process.platform, arch = process.arch) {
  const core = coreFor(platform, arch)
  const files = [
    { filename: path.join(root, 'sidecar', platform === 'win32' ? 'mihomo.exe' : 'mihomo'), sha256: core.sha256 },
    ...manifest.geodata.files.map(item => ({ filename: path.join(root, 'files', item.name), sha256: item.sha256 }))
  ]
  for (const item of files) {
    if (!matchesFile(item.filename, item.sha256)) throw new Error(`Runtime resource does not match resources.lock.json: ${item.filename}`)
  }
}

module.exports = { manifest, sha256, matchesFile, installVerified, downloadVerified, coreFor, verifyRuntimeResources }
