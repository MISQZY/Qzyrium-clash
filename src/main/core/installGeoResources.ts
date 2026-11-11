import fs from 'fs'
import path from 'path'
import type { AppPaths } from '../utils/paths'
import { logger } from '../utils/logger'

export async function installGeoResources(paths: Pick<AppPaths, 'geoFilesDir' | 'mihomoDir'>): Promise<void> {
  // Ensure geo database files are present in mihomoDir and up to date with bundled assets
  const geoFiles = ['country.mmdb', 'geosite.dat', 'geoip.dat']
  await Promise.all(geoFiles.map(async (file) => {
    const src = path.join(paths.geoFilesDir, file)
    const dst = path.join(paths.mihomoDir, file)
    try {
      if (fs.existsSync(src)) {
        let shouldCopy = !fs.existsSync(dst)
        if (!shouldCopy) {
          const srcStat = await fs.promises.stat(src)
          const dstStat = await fs.promises.stat(dst)
          if (srcStat.mtimeMs > dstStat.mtimeMs && srcStat.size !== dstStat.size) {
            shouldCopy = true
          }
        }
        if (shouldCopy) {
          await fs.promises.copyFile(src, dst)
          logger.info(`Updated geo resource ${file} in ${dst}`)
        }
      }
    } catch {
      // Existing resources and absent optional databases need no copy.
    }
  }))

}
