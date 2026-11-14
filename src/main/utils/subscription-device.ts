import fs from 'node:fs/promises'
import path from 'node:path'
import { createHmac, randomBytes } from 'node:crypto'
import { getAppPaths } from './paths'

let seed: Promise<string> | undefined
async function readSeed(): Promise<string> {
  const directory = getAppPaths().userData
  const filename = path.join(directory, 'subscription-device-id')
  await fs.mkdir(directory, { recursive: true })
  try { await fs.writeFile(filename, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  const value = (await fs.readFile(filename, 'utf8')).trim()
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid local subscription identity')
  return value
}

/** Stable installation identity, scoped to the provider origin; never copied into backups or logs. */
export async function subscriptionDeviceHeaders(origin: string): Promise<Record<string, string>> {
  seed ??= readSeed().catch(error => { seed = undefined; throw error })
  return {
    'x-hwid': createHmac('sha256', await seed).update(new URL(origin).origin).digest('hex'),
    'x-device-os': process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux'
  }
}
