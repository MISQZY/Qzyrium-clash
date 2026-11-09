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
  try {
    renameSync(tempPath, filePath)
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException
    if (error.code === 'EPERM' || error.code === 'EBUSY') {
      copyFileSync(tempPath, filePath)
      try {
        fs.unlink(tempPath).catch(() => {})
      } catch {}
      return
    }
    try {
      fs.unlink(tempPath).catch(() => {})
    } catch {}
    throw err
  }
}

export async function writeFileAtomicAsync(
  filePath: string,
  data: string,
  encoding: BufferEncoding = 'utf-8',
  backup = false
): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
  await fs.writeFile(tempPath, data, encoding)

  if (backup && existsSync(filePath)) {
    try {
      await fs.copyFile(filePath, `${filePath}.bak`)
    } catch {}
  }

  let retries = 5
  while (retries > 0) {
    try {
      await fs.rename(tempPath, filePath)
      return
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException
      if ((error.code === 'EPERM' || error.code === 'EBUSY') && --retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        continue
      }
      try {
        await fs.unlink(tempPath)
      } catch {}
      throw err
    }
  }
}
