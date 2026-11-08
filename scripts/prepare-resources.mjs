import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
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
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`)
  }
  const buffer = await res.arrayBuffer()
  fs.writeFileSync(dest, Buffer.from(buffer))
  console.log(`[INFO] Saved to: ${dest}`)
}

async function prepareMihomo() {
  if (!targetName) {
    console.warn(`[WARN] Unsupported platform/arch: ${key}. Skipping core download.`)
    return
  }

  fs.mkdirSync(TARGET_DIR, { recursive: true })
  fs.mkdirSync(TEMP_DIR, { recursive: true })

  const ext = platform === 'win32' ? '.exe' : ''
  const coreDest = path.join(TARGET_DIR, `mihomo${ext}`)

  if (fs.existsSync(coreDest)) {
    console.log(`[INFO] Mihomo core already exists at: ${coreDest}`)
    return
  }

  // Get latest release version
  console.log('[INFO] Fetching latest Mihomo release tag...')
  const verRes = await fetch('https://github.com/MetaCubeX/mihomo/releases/latest/download/version.txt')
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
      fs.writeFileSync(coreDest, entry.getData())
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
    const out = fs.createWriteStream(coreDest)
    await new Promise((resolve, reject) => {
      inp.pipe(gunzip).pipe(out).on('finish', resolve).on('error', reject)
    })
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
    if (!fs.existsSync(dest)) {
      try {
        await downloadFile(item.url, dest)
      } catch (err) {
        console.warn(`[WARN] Could not download ${item.name}: ${err.message}`)
      }
    } else {
      console.log(`[INFO] Geo file ${item.name} already exists.`)
    }
  }
}

async function main() {
  console.log('=== QzyriumVPN Resources Preparation ===')
  try {
    await prepareMihomo()
    await prepareGeoFiles()
    console.log('[SUCCESS] All resources ready!')
  } catch (e) {
    console.error('[FATAL] Failed to prepare resources:', e)
  }
}

main()
