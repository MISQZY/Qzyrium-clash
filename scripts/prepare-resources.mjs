import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { pipeline } from 'node:stream/promises'
import AdmZip from 'adm-zip'

const cwd = process.cwd()
const platform = process.platform
const arch = process.arch

const TARGET_DIR = path.join(cwd, 'extra', 'sidecar')
const FILES_DIR = path.join(cwd, 'extra', 'files')
const TEMP_DIR = path.join(cwd, 'node_modules', '.temp')

const MIHOMO_MAP = {
  'win32-x64': 'mihomo-windows-amd64-v1',
  'win32-ia32': 'mihomo-windows-386',
  'win32-arm64': 'mihomo-windows-arm64',
  'darwin-x64': 'mihomo-darwin-amd64-v1',
  'darwin-arm64': 'mihomo-darwin-arm64',
  'linux-x64': 'mihomo-linux-amd64-v1',
  'linux-arm64': 'mihomo-linux-arm64'
}

const key = `${platform}-${arch}`
const targetName = MIHOMO_MAP[key]

async function downloadFile(url, dest) {
  console.log(`[INFO] Downloading: ${url}`)
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`)
  }
  const buffer = await res.arrayBuffer()
  if (!buffer.byteLength) throw new Error(`Empty resource: ${url}`)
  const temp = `${dest}.${process.pid}.tmp`
  try {
    fs.writeFileSync(temp, Buffer.from(buffer))
    fs.renameSync(temp, dest)
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp)
  }
  console.log(`[INFO] Saved to: ${dest}`)
}

async function prepareMihomo() {
  if (!targetName) {
    throw new Error(`Unsupported platform/arch: ${key}`)
  }

  fs.mkdirSync(TARGET_DIR, { recursive: true })
  fs.mkdirSync(TEMP_DIR, { recursive: true })

  const ext = platform === 'win32' ? '.exe' : ''
  const coreDest = path.join(TARGET_DIR, `mihomo${ext}`)

  if (fs.existsSync(coreDest) && fs.statSync(coreDest).size > 0) {
    console.log(`[INFO] Mihomo core already exists at: ${coreDest}`)
    return
  }

  // Get latest release version
  console.log('[INFO] Fetching latest Mihomo release tag...')
  const verRes = await fetch('https://github.com/MetaCubeX/mihomo/releases/latest/download/version.txt', { signal: AbortSignal.timeout(30_000) })
  if (!verRes.ok) {
    throw new Error('Failed to fetch latest mihomo version tag')
  }
  const version = (await verRes.text()).trim()
  console.log(`[INFO] Latest Mihomo version: ${version}`)

  const archiveName = `${targetName}-${version}.zip`
  const downloadUrl = `https://github.com/MetaCubeX/mihomo/releases/download/${version}/${archiveName}`
  const tempArchive = path.join(TEMP_DIR, archiveName)

  try {
    await downloadFile(downloadUrl, tempArchive)
    const zip = new AdmZip(tempArchive)
    const entry = zip.getEntries().find((e) => e.entryName.endsWith('.exe') || e.entryName === targetName)

    if (entry) {
      const data = entry.getData()
      if (data.length === 0) throw new Error('Empty Mihomo executable in ZIP archive')
      const tempCore = `${coreDest}.${process.pid}.tmp`
      try {
        fs.writeFileSync(tempCore, data)
        fs.renameSync(tempCore, coreDest)
      } finally {
        if (fs.existsSync(tempCore)) fs.unlinkSync(tempCore)
      }
      if (platform !== 'win32') {
        fs.chmodSync(coreDest, 0o755)
      }
      console.log(`[SUCCESS] Mihomo core installed to: ${coreDest}`)
    } else {
      throw new Error(`No executable found inside archive ${archiveName}`)
    }
  } catch (err) {
    console.error('[ERROR] Failed to extract mihomo:', err.message)
    // fallback gz check if zip failed
    const gzArchive = `${targetName}-${version}.gz`
    const gzUrl = `https://github.com/MetaCubeX/mihomo/releases/download/${version}/${gzArchive}`
    const tempGz = path.join(TEMP_DIR, gzArchive)
    await downloadFile(gzUrl, tempGz)
    const gunzip = zlib.createGunzip()
    const inp = fs.createReadStream(tempGz)
    const tempCore = `${coreDest}.${process.pid}.tmp`
    try {
      await pipeline(inp, gunzip, fs.createWriteStream(tempCore))
      if (fs.statSync(tempCore).size === 0) throw new Error('Empty Mihomo executable', { cause: err })
      fs.renameSync(tempCore, coreDest)
    } finally {
      if (fs.existsSync(tempCore)) fs.unlinkSync(tempCore)
    }
    if (platform !== 'win32') {
      fs.chmodSync(coreDest, 0o755)
    }
    console.log(`[SUCCESS] Mihomo core extracted from gz to: ${coreDest}`)
  }
}

async function prepareGeoFiles() {
  fs.mkdirSync(FILES_DIR, { recursive: true })

  const geoFiles = [
    {
      name: 'country.mmdb',
      url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/country-lite.mmdb'
    },
    {
      name: 'geosite.dat',
      url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat'
    },
    {
      name: 'geoip.dat',
      url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat'
    }
  ]

  for (const item of geoFiles) {
    const dest = path.join(FILES_DIR, item.name)
    if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) {
      await downloadFile(item.url, dest)
    } else {
      console.log(`[INFO] Geo file ${item.name} already exists.`)
    }
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
  const directory = 'runner', executable = 'qzyrium-run.exe'
  const source = path.join(cwd, 'scripts', directory, 'Program.cs')
  const destination = path.join(FILES_DIR, executable)
  const sourceInfo = fs.statSync(source)
  if (fs.existsSync(destination)) {
    const binaryInfo = fs.statSync(destination)
    if (binaryInfo.size > 0 && binaryInfo.mtimeMs >= sourceInfo.mtimeMs) {
      console.log(`[INFO] ${executable} is up to date.`)
      return
    }
  }
  if (!cscPath) throw new Error('Windows .NET Framework C# compiler not found')
  execFileSync(cscPath, ['/target:winexe', '/optimize+', '/platform:anycpu',
    `/out:${destination}`, source], { windowsHide: true, stdio: 'pipe' })
  console.log(`[SUCCESS] Compiled ${executable}`)
}

async function main() {
  console.log('=== QzyriumVPN Resources Preparation ===')
  try {
    await prepareMihomo()
    await prepareGeoFiles()
    await prepareRunner()
    console.log('[SUCCESS] All resources ready!')
  } catch (e) {
    console.error('[FATAL] Failed to prepare resources:', e)
    process.exitCode = 1
  }
}

main()
