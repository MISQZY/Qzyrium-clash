import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import AdmZip from 'adm-zip'
import integrity from './resource-integrity.cjs'

const { manifest, matchesFile, installVerified, downloadVerified, coreFor, verifyRuntimeResources } = integrity
const cwd = process.cwd()
const platform = process.platform
const arch = process.arch
const TARGET_DIR = path.join(cwd, 'extra', 'sidecar')
const FILES_DIR = path.join(cwd, 'extra', 'files')
const TEMP_DIR = path.join(cwd, 'node_modules', '.temp')

async function prepareMihomo() {
  const core = coreFor(platform, arch)
  fs.mkdirSync(TARGET_DIR, { recursive: true })
  fs.mkdirSync(TEMP_DIR, { recursive: true })
  const destination = path.join(TARGET_DIR, platform === 'win32' ? 'mihomo.exe' : 'mihomo')
  if (matchesFile(destination, core.sha256)) {
    console.log(`[INFO] Verified Mihomo ${manifest.mihomo.version} (${platform}-${arch})`)
    return
  }
  const archiveName = new URL(core.url).pathname.split('/').pop()
  console.log(`[INFO] Downloading pinned Mihomo ${manifest.mihomo.version} (${platform}-${arch})`)
  const archive = await downloadVerified(core.url, path.join(TEMP_DIR, archiveName), core.archiveSha256)
  let executable
  if (core.url.endsWith('.zip')) {
    const entries = new AdmZip(archive).getEntries().filter(entry => !entry.isDirectory && entry.entryName.endsWith('.exe'))
    if (entries.length !== 1) throw new Error('Expected one Mihomo executable in the verified archive')
    executable = entries[0].getData()
  } else {
    executable = zlib.gunzipSync(archive)
  }
  installVerified(destination, executable, core.sha256, platform !== 'win32')
}

async function prepareGeoFiles() {
  fs.mkdirSync(FILES_DIR, { recursive: true })
  for (const item of manifest.geodata.files) {
    await downloadVerified(item.url, path.join(FILES_DIR, item.name), item.sha256)
    console.log(`[INFO] Verified geodata ${item.name}`)
  }
}

async function prepareRunner() {
  if (platform !== 'win32') return
  fs.mkdirSync(FILES_DIR, { recursive: true })
  const systemRoot = process.env.SystemRoot || 'C:\\Windows'
  const cscPath = ['Framework64', 'Framework']
    .map(framework => path.join(systemRoot, 'Microsoft.NET', framework, 'v4.0.30319', 'csc.exe'))
    .find(filename => fs.existsSync(filename))
  const { execFileSync } = await import('node:child_process')
  for (const [sourceName, executable, references] of [
    ['Program.cs', 'qzyrium-run.exe', []],
    ['NetworkWatchdog.cs', 'qzyrium-watchdog.exe', ['/reference:System.Web.Extensions.dll', '/reference:System.Management.dll']]
  ]) {
    const source = path.join(cwd, 'scripts', 'runner', sourceName)
    const destination = path.join(FILES_DIR, executable)
    // Helpers come from checked-in sources, never from an unverified local cache.
    if (!cscPath) throw new Error('Windows .NET Framework C# compiler not found')
    execFileSync(cscPath, [`/target:${sourceName === 'Program.cs' ? 'winexe' : 'exe'}`, '/optimize+', '/platform:anycpu',
      ...references, `/out:${destination}`, source], { windowsHide: true, stdio: 'pipe' })
    console.log(`[SUCCESS] Compiled ${executable}`)
  }
}

async function main() {
  console.log('=== QzyriumVPN Resources Preparation ===')
  try {
    await prepareMihomo()
    await prepareGeoFiles()
    await prepareRunner()
    verifyRuntimeResources(path.join(cwd, 'extra'), platform, arch)
    console.log('[SUCCESS] All pinned resources verified')
  } catch (error) {
    console.error('[FATAL] Failed to prepare resources:', error)
    process.exitCode = 1
  }
}

main()
