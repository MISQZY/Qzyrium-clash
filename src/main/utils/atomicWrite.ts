import { copyFileSync, existsSync, renameSync, writeFileSync } from 'node:fs'
import fs from 'node:fs/promises'

/**
 * Writes to a sibling temp file then renames it over the target. The rename
 * is atomic on both Windows and POSIX, so a crash or power loss mid-write
 * can never leave a truncated/partial file at `filePath` — readers either
 * see the old content or the fully-written new content, never a corrupt mix.
 */
export function writeFileAtomic(filePath: string, data: string, encoding: BufferEncoding = 'utf-8'): void {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
  writeFileSync(tempPath, data, encoding)
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      renameSync(tempPath, filePath)
      return
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException
      if ((error.code === 'EPERM' || error.code === 'EBUSY') && attempt < 9) {
        try {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1))
        } catch {
          const start = Date.now()
          while (Date.now() - start < 50) { /* fallback spin */ }
        }
        continue
      }
      try {
        if (error.code === 'EPERM' || error.code === 'EBUSY') {
          copyFileSync(tempPath, filePath)
          return
        }
      } finally {
        try {
          fs.unlink(tempPath).catch(() => {})
        } catch {}
      }
      throw err
    }
  }
}

export async function writeFileAtomicAsync(
  filePath: string,
  data: string | Uint8Array,
  encoding: BufferEncoding = 'utf-8',
  backup = false
): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
  const backupTemp = `${tempPath}.bak`
  try {
    await fs.writeFile(tempPath, data, encoding)
    if (backup) {
      try {
        await fs.copyFile(filePath, backupTemp)
        await fs.rename(backupTemp, `${filePath}.bak`)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(tempPath, filePath)
        return
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if ((code !== 'EPERM' && code !== 'EBUSY') || attempt >= 12) throw error
        await new Promise((resolve) => setTimeout(resolve, Math.min(200, 50 * (attempt + 1))))
      }
    }
  } finally {
    await Promise.all([fs.unlink(tempPath).catch(() => {}), fs.unlink(backupTemp).catch(() => {})])
  }
}
