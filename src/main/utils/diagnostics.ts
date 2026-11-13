import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { isIP } from 'node:net'
import AdmZip from 'adm-zip'
import yaml from 'yaml'
import type { AppConfig } from '@shared/app-config'
import type { CoreState } from '@shared/types'
import { cleanLogMessage } from '@shared/logs'
import type { BackupProfile } from './backup'

export function redactDiagnosticLog(message: string, secrets: readonly string[]): string {
  let text = cleanLogMessage(message)
  for (const secret of [...new Set(secrets)].filter(value => value.trim()).sort((a, b) => b.length - a.length)) {
    if (secret.length >= 3) text = text.split(secret).join('[REDACTED]')
    else text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'gu'), '[REDACTED]')
  }
  return text
    .replace(/(["']?(?:password|passwd|secret|token|uuid|client[_-]?id|api[_-]?key|private[_-]?key|authorization|username)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[REDACTED]')
    .replace(/(?:[a-z]:[\\/]|\\\\|\/(?:Users|home|tmp|var|opt)\/)[^\r\n]*/gi, '[PATH]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '[EMAIL]')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '[IP]')
    .replace(/[0-9a-f]*:[0-9a-f:.%]+/gi, value => isIP(value.split('%')[0]) ? '[IP]' : value)
    .replace(/(?:[\p{L}\p{N}_-]+\.)+[\p{L}][\p{L}\p{N}-]{1,62}\b/gu, '[HOST]')
    .replace(/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi, '[ID]')
    .replace(/[A-Za-z0-9+/_=-]{40,}/g, '[REDACTED]')
}

function collectSecrets(value: unknown, result: string[], key = '', depth = 0): void {
  if (depth > 32) return
  if (typeof value === 'string' && /name|password|secret|token|key|uuid|server|host|sni|url|path|^id$|user|auth|credential|cert/i.test(key)) result.push(value)
  else if (Array.isArray(value)) for (const item of value) collectSecrets(item, result, key, depth + 1)
  else if (value && typeof value === 'object') for (const [childKey, child] of Object.entries(value)) collectSecrets(child, result, childKey, depth + 1)
}

async function readTail(filename: string): Promise<string> {
  const file = await fs.open(filename, 'r')
  try {
    const { size } = await file.stat()
    const start = Math.max(0, size - 128 * 1024)
    const buffer = Buffer.alloc(size - start)
    const { bytesRead } = await file.read(buffer, 0, buffer.length, start)
    const text = buffer.subarray(0, bytesRead).toString('utf8')
    return start ? text.slice(text.indexOf('\n') + 1) : text
  } finally { await file.close() }
}

function settingsSummary(config: AppConfig): object {
  const keys = ['autoStart', 'autoConnect', 'closeAction', 'silentStart', 'disableGpu', 'lowMemoryMode', 'liteDashboard',
    'reconnectAfterSleep', 'resumeDelaySeconds', 'autoRestartCore', 'coreRestartDelaySeconds', 'coreRestartMaxAttempts',
    'autoUpdateProfiles', 'profileUpdateInterval', 'updateProfilesOnStart', 'profileStartupMaxAgeHours',
    'connectionInterval', 'maxLogs', 'autoReleaseWindow', 'autoReleaseWindowMinutes', 'delayTestTimeout', 'delayTestConcurrency',
    'appLogEnabled', 'appLogMaxSizeMb', 'appLogArchives', 'appLogRetentionDays',
    'connectionLogEnabled', 'connectionLogMaxSizeMb', 'connectionLogArchives', 'connectionLogRetentionDays'] as const
  return {
    general: Object.fromEntries(keys.map(key => [key, config.general[key]])),
    kernel: { mode: config.kernel.mode, logLevel: config.kernel.logLevel, mixedPort: config.kernel.mixedPort,
      controllerPort: config.kernel.controllerPort, allowLan: config.kernel.allowLan,
      tun: { enable: config.kernel.tun.enable, stack: config.kernel.tun.stack, autoRoute: config.kernel.tun.autoRoute, strictRoute: config.kernel.tun.strictRoute },
      overrides: { dns: !!config.kernel.dns, sniffer: !!config.kernel.sniffer, resources: !!config.kernel.resources } },
    sysProxy: { enable: config.sysProxy.enable, mode: config.sysProxy.mode, bypassCount: config.sysProxy.bypass.length }
  }
}

export async function createDiagnostics(input: {
  appVersion: string; runtimeVersions: Record<string, string | undefined>; coreVersion: string; coreStatus: CoreState
  settings: AppConfig; profiles: BackupProfile[]; logsDir: string
}): Promise<Buffer> {
  const archive = new AdmZip()
  const secrets: string[] = []
  collectSecrets(input.settings, secrets)
  let includeLogs = true
  for (const item of input.profiles) {
    collectSecrets(item.profile, secrets)
    try { collectSecrets(yaml.parse(item.content, { maxAliasCount: 100 }), secrets) }
    catch { includeLogs = false }
  }
  const logs: Record<string, string> = {}
  for (const source of ['app', 'connections']) {
    if (!includeLogs) { logs[source] = 'omitted: profile could not be parsed for redaction'; continue }
    const directory = path.join(input.logsDir, source)
    try {
      const names = (await fs.readdir(directory)).filter(name => /^\d{4}-\d{2}-\d{2}T[\dZ-]+\.log$/.test(name)).sort().reverse()
      const samples: string[] = []
      for (const name of [names[0], 'latest.log'].filter((name): name is string => !!name)) {
        try { samples.push(await readTail(path.join(directory, name))) }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      }
      const errors = samples.join('\n').split('\n').filter(line => /\[(?:ERROR|WARNING)\]/.test(line)).slice(-500).join('\n')
      archive.addFile(`logs/${source}.log`, Buffer.from(redactDiagnosticLog(errors, secrets), 'utf8'))
      logs[source] = samples.length ? 'included: recent warnings and errors' : 'unavailable'
    } catch { logs[source] = 'unavailable' }
  }
  const report = {
    format: 'qzyrium-diagnostics', version: 1, createdAt: new Date().toISOString(),
    appVersion: input.appVersion, runtime: input.runtimeVersions,
    system: { platform: process.platform, arch: process.arch, release: os.release() },
    core: { version: input.coreVersion, status: input.coreStatus },
    settings: settingsSummary(input.settings),
    profiles: { total: input.profiles.length, remote: input.profiles.filter(item => item.profile.type === 'remote').length }, logs
  }
  archive.addFile('report.json', Buffer.from(JSON.stringify(report, null, 2), 'utf8'))
  return archive.toBuffer()
}
