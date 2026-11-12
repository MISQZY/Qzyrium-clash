import fs from 'node:fs/promises'
import path from 'node:path'
import yaml from 'yaml'
import type { AppConfig } from '@shared/app-config'
import type { ProfileItem } from '@shared/profile'
import type { CustomThemePack } from '@shared/theme'
import { IPC_CHANNELS } from '@shared/ipc'
import { normalizeSettings } from '@shared/settings-config'
import { validateIpcArguments } from '../ipc/argument-validation'
import { writeFileAtomicAsync } from './atomicWrite'

export interface BackupProfile { profile: ProfileItem; content: string }
export interface Backup {
  format: 'qzyrium-backup'
  version: 1
  createdAt: string
  settings: AppConfig
  profiles: BackupProfile[]
  themes: CustomThemePack[]
}
const MAX_BACKUP_BYTES = 100 * 1024 * 1024
const safeId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value)
  && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value)
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0

export function parseBackup(content: string): Backup {
  if (Buffer.byteLength(content) > MAX_BACKUP_BYTES) throw new Error('Backup exceeds 100 MB')
  const raw = JSON.parse(content) as Backup
  if (!object(raw) || raw.format !== 'qzyrium-backup' || raw.version !== 1 || !Array.isArray(raw.profiles) || !Array.isArray(raw.themes)
    || typeof raw.createdAt !== 'string' || Number.isNaN(Date.parse(raw.createdAt))) throw new Error('Unsupported backup format')
  validateIpcArguments(IPC_CHANNELS.APP_UPDATE_SETTINGS, [raw.settings])
  const settings = normalizeSettings(raw.settings)
  const ids = new Set<string>()
  for (const item of raw.profiles) {
    if (!object(item) || !object(item.profile) || typeof item.content !== 'string') throw new Error('Invalid backup profile')
    const profile = item.profile
    if (!safeId(profile.id) || ids.has(profile.id.toLowerCase()) || !['local', 'remote'].includes(profile.type) || !finite(profile.updatedAt)
      || (profile.lastFetchedAt !== undefined && !finite(profile.lastFetchedAt))) throw new Error('Invalid backup profile metadata')
    ids.add(profile.id.toLowerCase())
    validateIpcArguments(IPC_CHANNELS.PROFILE_UPDATE_INFO, [profile.id, {
      name: profile.name, url: profile.url, autoUpdate: profile.autoUpdate, updateViaProxy: profile.updateViaProxy,
      interval: profile.interval, customUA: profile.customUA
    }])
    if (typeof profile.name !== 'string') throw new Error('Missing profile name')
    validateIpcArguments(IPC_CHANNELS.PROFILE_SAVE_CUSTOM_RULES, [profile.id, profile.customRules ?? []])
    if (profile.selectedGroupProxies !== undefined && (!object(profile.selectedGroupProxies)
      || Object.entries(profile.selectedGroupProxies).some(([key, value]) => ['__proto__', 'constructor', 'prototype'].includes(key) || typeof value !== 'string'))) throw new Error('Invalid proxy selections')
    for (const key of ['profileLogo', 'announce', 'supportUrl'] as const) if (profile[key] !== undefined && typeof profile[key] !== 'string') throw new Error('Invalid subscription metadata')
    if (profile.userInfo !== undefined && (!object(profile.userInfo) || Object.values(profile.userInfo).some(value => !finite(value)))) throw new Error('Invalid subscription usage')
    if (profile.nameSource !== undefined && !['manual', 'subscription', 'fallback'].includes(profile.nameSource)) throw new Error('Invalid profile name source')
    const parsed: unknown = yaml.parse(item.content, { maxAliasCount: 100 })
    if (parsed !== null && !object(parsed)) throw new Error('Profile YAML must be a mapping')
  }
  if (settings.activeProfileId !== null && !raw.profiles.some(item => item.profile.id === settings.activeProfileId)) throw new Error('Backup references a missing active profile')
  const themes = new Set<string>()
  for (const theme of raw.themes) {
    if (!safeId(theme?.id) || themes.has(theme.id.toLowerCase())) throw new Error('Invalid or duplicate theme id')
    validateIpcArguments(IPC_CHANNELS.THEME_SAVE_CUSTOM_THEME, [theme])
    themes.add(theme.id.toLowerCase())
  }
  return { format: raw.format, version: 1, createdAt: raw.createdAt, settings, profiles: raw.profiles, themes: raw.themes }
}

export async function readBackup(filename: string): Promise<Backup> {
  if ((await fs.stat(filename)).size > MAX_BACKUP_BYTES) throw new Error('Backup exceeds 100 MB')
  return parseBackup(await fs.readFile(filename, 'utf8'))
}

const pendingName = 'restore-pending.json'
const journalName = 'restore-journal.json'
type FileRecord = { name: string; content: string | null }
function target(root: string, name: string): string {
  if (!['settings.json', 'profiles.json'].includes(name)) {
    const match = /^(profiles|themes)\/([a-zA-Z0-9_-]+)\.(yaml|json)$/.exec(name)
    if (!match || !safeId(match[2]) || match[3] !== (match[1] === 'profiles' ? 'yaml' : 'json')) throw new Error('Unsafe restore path')
  }
  return path.join(root, name)
}
async function readOptional(filename: string): Promise<string | null> {
  try { return await fs.readFile(filename, 'utf8') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
}
async function writeRecords(root: string, files: FileRecord[]): Promise<void> {
  for (const file of files) {
    const filename = target(root, file.name)
    if (file.content === null) await fs.rm(filename, { force: true })
    else {
      await fs.mkdir(path.dirname(filename), { recursive: true })
      await writeFileAtomicAsync(filename, file.content)
    }
  }
}

export async function stageBackupRestore(root: string, backup: Backup): Promise<void> {
  const content = JSON.stringify(backup)
  parseBackup(content)
  await writeFileAtomicAsync(path.join(root, pendingName), content)
}

/** Runs before services open their files. A journal survives an interrupted restore. */
export async function applyPendingBackup(root: string): Promise<boolean> {
  const journalPath = path.join(root, journalName), pendingPath = path.join(root, pendingName)
  const interrupted = await readOptional(journalPath)
  if (interrupted) {
    const journal = JSON.parse(interrupted) as { committed: boolean; files: FileRecord[] }
    if (!Array.isArray(journal.files) || journal.files.some(file => !object(file) || typeof file.name !== 'string' || (file.content !== null && typeof file.content !== 'string'))) throw new Error('Invalid restore journal')
    // Validate every path before touching any file.
    for (const file of journal.files) target(root, file.name)
    if (!journal.committed) await writeRecords(root, journal.files)
    else await fs.rm(pendingPath, { force: true })
    await fs.unlink(journalPath)
  }
  const pending = await readOptional(pendingPath)
  if (pending === null) return false
  const backup = parseBackup(pending)
  const files: FileRecord[] = [
    { name: 'settings.json', content: JSON.stringify(backup.settings, null, 2) },
    { name: 'profiles.json', content: JSON.stringify(backup.profiles.map(item => item.profile), null, 2) },
    ...backup.profiles.map(item => ({ name: `profiles/${item.profile.id}.yaml`, content: item.content })),
    ...backup.themes.map(theme => ({ name: `themes/${theme.id}.json`, content: JSON.stringify(theme, null, 2) }))
  ]
  const included = new Set(files.map(file => file.name))
  for (const directory of ['profiles', 'themes']) {
    const names = await fs.readdir(path.join(root, directory)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    for (const name of names) {
      const relative = `${directory}/${name}`
      if (!name.endsWith(directory === 'profiles' ? '.yaml' : '.json') || included.has(relative)) continue
      // Leave unrelated files alone, including names outside the managed ID format.
      try { target(root, relative) } catch { continue }
      files.push({ name: relative, content: null })
    }
  }
  const previous = await Promise.all(files.map(async file => ({ name: file.name, content: await readOptional(target(root, file.name)) })))
  await writeFileAtomicAsync(journalPath, JSON.stringify({ committed: false, files: previous }))
  try {
    await writeRecords(root, files)
    await writeFileAtomicAsync(journalPath, JSON.stringify({ committed: true, files: previous }))
  } catch (error) {
    await writeRecords(root, previous)
    await fs.unlink(journalPath)
    await fs.rename(pendingPath, path.join(root, 'restore-failed.json'))
    throw error
  }
  await fs.unlink(pendingPath)
  await fs.unlink(journalPath)
  return true
}
