import { createKernelRuntime } from './createKernelRuntime'
import { canCheckProxyServices, DEFAULT_SERVICE_CHECK_TARGETS, type ServiceCheckTarget } from '@shared/service-check'
import { powerMonitor, session } from 'electron'
import { withServiceCheckProxy } from '../core/ServiceCheckProxy'
import { createServiceRequest } from '../core/service-request'
import { createElectronServiceFetch } from '../core/service-fetch'
import { checkProxyServices } from '../core/checkProxyServices'
import { installGeoResources } from '../core/installGeoResources'
import { KernelGlobeResolver } from '../core/KernelGlobeResolver'
import type { ActiveConfigBuilder } from '../core/ActiveConfigBuilder'
import { restoreProxySelection } from '../core/ProxySelection'
import type { TrafficAccounting } from '../core/TrafficAccounting'
import { SubscriptionTrafficAccounting } from '../core/SubscriptionTrafficAccounting'
import { nativeMessage } from '@shared/localization'
import { IPC_CHANNELS } from '@shared/ipc'
import yaml from 'yaml'
import {
  ConnectionsSnapshot,
  MihomoRule,
  ProxyNode
} from '@shared/mihomo'
import type { GlobeLocations } from '@shared/geo'
import { CoreState, LogEntry, MihomoVersion, TrafficStats } from '@shared/types'
import type { MihomoApiClient } from '../core/MihomoApiClient'
import type { MihomoProcessManager } from '../core/MihomoProcessManager'
import { logger } from '../utils/logger'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { promisify } from 'node:util'
import { getAppPaths, resolveCoreBinaryPath } from '../utils/paths'
import type { CoreChannel } from '@shared/core-version'
import { BaseService } from './BaseService'
import { ProfileService } from './ProfileService'
import { SettingService } from './SettingService'
import type { GeoIpService } from './GeoIpService'
import { isProcessElevated } from '../utils/elevation'
import type { ProxyGroup } from '@shared/mihomo'
import { offlineProxies } from '../utils/offline-proxies'
import { flushSystemDns } from '../utils/network-transition'
import { offlineRules, summarizeRules } from '@shared/rules'
import type { ProviderKind, ProviderSummary } from '@shared/mihomo'
import fs from 'node:fs/promises'
import axios from 'axios'
import { writeFileAtomicAsync } from '../utils/atomicWrite'
import type { AppConfig } from '@shared/app-config'
import { mergeSettings } from '@shared/settings-config'
import { resolveEffectiveCore, type EffectiveCoreValues, type ConfigPreview } from '@shared/effective-core'
import { parseProfileConfig } from '@shared/profile-config'
import { MihomoConfigFactory } from '../core/MihomoConfigFactory'
import { classifyKernelFailure, kernelFailureDetails, KernelOperationError } from '../utils/kernel-failure'
import { kernelFailureMessage, type KernelFailure, type KernelFailureReason } from '@shared/kernel-failure'

const runFile = typeof promisify === 'function' ? promisify(execFile) : () => Promise.resolve({ stdout: '', stderr: '' })

export class KernelService implements BaseService {
  private serviceCheckInProgress = false
  private serviceCheckAbort?: AbortController
  private isIdleCoreRunning = false
  private idleStartPromise: Promise<void> | null = null

  isProcessRunning(): boolean {
    return this.processManager.getState() === 'running'
  }

  async checkProxyServices(name: string, customTargets?: ServiceCheckTarget[]) {
    if (!this.isProcessRunning()) {
      await this.startIdleCore()
    }
    if (!this.isProcessRunning()) throw new Error('Start the VPN core before checking services')
    if (this.serviceCheckInProgress) throw new Error('A service check is already running')
    this.serviceCheckInProgress = true
    const abort = new AbortController()
    this.serviceCheckAbort = abort
    try {
      const proxies = await this.apiClient.getProxies()
      if (!Object.hasOwn(proxies, name) || !canCheckProxyServices(proxies[name])) {
        throw new Error('Select a proxy host to check services')
      }
      const targets = (customTargets && customTargets.length > 0)
        ? customTargets
        : structuredClone(this.settingService.getSettings().general.serviceCheckTargets ?? DEFAULT_SERVICE_CHECK_TARGETS)
      const paths = getAppPaths()
      try {
        return await withServiceCheckProxy({
          binary: this.processManager.getBinaryPath() ?? resolveCoreBinaryPath(this.settingService.getSettings().kernel.channel),
          configPath: paths.activeConfigPath, mihomoDir: paths.mihomoDir, name, proxies, signal: abort.signal
        }, async port => {
          const transport = session.fromPartition('service-check', { cache: false })
          try {
            await transport.setProxy({ mode: 'fixed_servers', proxyRules: `http=127.0.0.1:${port};https=127.0.0.1:${port}`, proxyBypassRules: '<-loopback>' })
            return await checkProxyServices(null, name, targets,
              createServiceRequest(createElectronServiceFetch(transport), abort.signal))
          } finally {
            await transport.closeAllConnections()
            await transport.clearStorageData()
          }
        })
      } catch (proxyError) {
        logger.warn(`Isolated service check proxy failed, falling back to Mihomo delay ping: ${proxyError}`)
        return await this.apiClient.checkProxyServices(name, targets)
      }
    } finally {
      if (this.serviceCheckAbort === abort) this.serviceCheckAbort = undefined
      this.serviceCheckInProgress = false
    }
  }

  private failure: KernelFailure | null = null
  getFailure(): KernelFailure | null { return this.failure }

  private reportFailure(error: unknown, context?: KernelFailureReason): KernelOperationError {
    const failure = this.failure ?? classifyKernelFailure(error, [], context)
    if (!this.failure) {
      this.failure = failure
      logger.error(`Kernel operation failed [${failure.reason}]\n${kernelFailureDetails(error)}`)
      this.broadcaster?.(IPC_CHANNELS.EVENT_CORE_FAILURE, failure)
    }
    return new KernelOperationError(failure.reason, kernelFailureMessage(failure, this.settingService.getSettings().general))
  }
  private ruleWarning: string | null = null

  getRuleWarning(): string | null { return this.ruleWarning }
  private processManager: MihomoProcessManager
  private apiClient: MihomoApiClient
  private settingService: SettingService
  private profileService: ProfileService
  private geoIp: GeoIpService
  private globeResolver: KernelGlobeResolver
  private lifecycle: Promise<void> = Promise.resolve()
  private desiredRunning = false
  private recoverySequence = 0
  private resumeTimer?: ReturnType<typeof setTimeout>
  private connectedBeforeSleep = false
  private restartTimer?: ReturnType<typeof setTimeout>
  private restartAttempts = 0
  private runningSince: number | null = null
  private suspended = false

  private scheduleCoreRestart(): void {
    const general = this.settingService.getSettings().general
    if (!general.autoRestartCore || !this.desiredRunning || this.suspended || this.restartTimer || this.getStatus() === 'running') return
    if (this.restartAttempts >= (general.coreRestartMaxAttempts ?? 3)) {
      logger.warn('Automatic core restart attempt limit reached')
      return
    }
    const sequence = this.recoverySequence
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined
      const current = () => this.desiredRunning && !this.suspended && sequence === this.recoverySequence && !!this.settingService.getSettings().general.autoRestartCore
      if (!current()) return
      this.restartAttempts++
      logger.info(`Automatically restarting core (attempt ${this.restartAttempts})`)
      void this.enqueueLifecycle(async () => {
        if (!current()) return
        await this.stopCore()
        if (current()) await this.startCore()
      }).catch(error => {
        logger.error('Automatic core restart failed', error)
        if (current()) this.scheduleCoreRestart()
      })
    }, (general.coreRestartDelaySeconds ?? 5) * 1000)
    this.restartTimer.unref()
  }

  private onSuspend = (): void => {
    this.suspended = true
    this.connectedBeforeSleep = this.desiredRunning && ['running', 'starting'].includes(this.getStatus())
    this.cancelResume()
  }

  private onResume = (): void => {
    this.suspended = false
    this.cancelResume()
    const general = this.settingService.getSettings().general
    if (this.getStatus() === 'error' && (!general.reconnectAfterSleep || !this.connectedBeforeSleep)) this.scheduleCoreRestart()
    if (!general.reconnectAfterSleep || !this.connectedBeforeSleep || !this.desiredRunning) return
    this.connectedBeforeSleep = false
    const sequence = this.recoverySequence
    this.resumeTimer = setTimeout(() => {
      this.resumeTimer = undefined
      void this.enqueueLifecycle(async () => {
        const current = () => this.desiredRunning && sequence === this.recoverySequence && !!this.settingService.getSettings().general.reconnectAfterSleep
        if (!current()) return
        try {
          await this.apiClient.getVersion()
          if (current() && this.getStatus() === 'running') this.apiClient.startTrafficStream()
        } catch {
          if (!current()) return
          logger.info('Recovering unresponsive core after wake-up')
          await this.stopCore()
          if (current()) await this.startCore()
        }
      }).catch(error => {
        logger.error('Connection recovery after wake-up failed', error)
        if (sequence === this.recoverySequence) this.scheduleCoreRestart()
      })
    }, (general.resumeDelaySeconds ?? 5) * 1000)
    this.resumeTimer.unref()
  }

  private cancelResume(): void {
    this.recoverySequence++
    clearTimeout(this.restartTimer)
    this.restartTimer = undefined
    clearTimeout(this.resumeTimer)
    this.resumeTimer = undefined
  }
  private configBuilder: ActiveConfigBuilder
  private broadcaster: ((channel: string, data: unknown) => void) | null = null
  private sessionStartedAt: number | null = null
  private startupRunning?: boolean
  private trafficAccounting: TrafficAccounting
  private subscriptionTraffic = new SubscriptionTrafficAccounting()

  private resetDirectTraffic(): void {
    this.trafficAccounting?.reset?.()
  }

  setStartupRunning(running: boolean): void { this.startupRunning = running }

  constructor(settingService: SettingService, profileService: ProfileService,
    runtime = createKernelRuntime(settingService.getSettings(), profileService)) {
    this.settingService = settingService
    this.profileService = profileService
    this.configBuilder = runtime.configBuilder
    this.processManager = runtime.processManager
    this.apiClient = runtime.apiClient
    this.geoIp = runtime.geoIp
    this.trafficAccounting = runtime.trafficAccounting

    this.globeResolver = new KernelGlobeResolver({
      profiles: profileService,
      geoIp: this.geoIp,
      status: () => this.getStatus(),
      settings: () => this.settingService.getSettings(),
      connections: () => this.getConnections(),
      proxies: () => this.getProxies(),
      resolveHost: host => this.apiClient.resolveHost(host)
    })
    this.setupListeners()
  }

  setBroadcaster(fn: (channel: string, data: unknown) => void): void {
    this.broadcaster = fn
  }

  private setupListeners(): void {
    this.processManager.on('failure', (failure: KernelFailure) => {
      this.failure = failure
      this.broadcaster?.(IPC_CHANNELS.EVENT_CORE_FAILURE, failure)
    })
    this.processManager.on('state-change', (state: CoreState) => {
      if (state === 'starting' || state === 'running') this.failure = null
      if (state === 'running') {
        this.runningSince = Date.now()
        clearTimeout(this.restartTimer)
        this.restartTimer = undefined
      } else if (state === 'error') {
        if (this.runningSince !== null && Date.now() - this.runningSince >= 60_000) this.restartAttempts = 0
        this.runningSince = null
        this.scheduleCoreRestart()
      }
      if (state === 'running' && !this.isIdleCoreRunning) this.sessionStartedAt = Date.now()
      else if (this.isIdleCoreRunning || state !== 'running') this.sessionStartedAt = null
      this.broadcaster?.('event:core-status', this.getStatus())
      if (state === 'running' && !this.isIdleCoreRunning) {
        this.apiClient.startTrafficStream()
      } else if (state === 'stopped' || state === 'error' || this.isIdleCoreRunning) {
        this.apiClient.stopAllStreams()
      }
    })

    this.processManager.on('log', (entry: LogEntry) => {
      this.broadcaster?.(IPC_CHANNELS.EVENT_LOG, entry)
    })

    this.processManager.on('tun-error', (errText: string) => {
      this.reportFailure(new Error(errText))
      this.broadcaster?.('event:tun-error', errText)
      if (this.settingService.getSettings().kernel.tun.enable) {
        void this.stop()
      }
    })

    this.apiClient.on('traffic', (stats: TrafficStats) => {
      this.broadcaster?.('event:traffic', stats)
    })

    // The process pipes are the single source of core logs, including startup
    // and background operation. A parallel WebSocket stream duplicates entries.
  }

  async initialize(): Promise<void> {
    powerMonitor?.on('suspend', this.onSuspend)
    powerMonitor?.on('resume', this.onResume)
    const settings = this.settingService.getSettings()
    if (this.startupRunning ?? settings.general.autoConnect) {
      await this.start()
    }
  }

  async dispose(): Promise<void> {
    powerMonitor?.removeListener('suspend', this.onSuspend)
    powerMonitor?.removeListener('resume', this.onResume)
    await this.stop()
    this.geoIp.dispose()
  }

  getStatus(): CoreState {
    if (this.isIdleCoreRunning) return 'stopped'
    return this.processManager.getState()
  }

  getSessionStartedAt(): number | null { return this.sessionStartedAt }

  async getVersion(): Promise<MihomoVersion> {
    try {
      return await this.apiClient.getVersion()
    } catch {
      return { version: 'unknown', meta: true }
    }
  }

  private enqueueLifecycle(action: () => Promise<void>): Promise<void> {
    const task = this.lifecycle.then(action)
    this.lifecycle = task.catch(() => {})
    return task
  }

  start(): Promise<void> {
    this.failure = null
    this.desiredRunning = true
    this.restartAttempts = 0
    this.cancelResume()
    const sequence = this.recoverySequence
    return this.enqueueLifecycle(() => this.startCore()).catch(error => {
      if (sequence === this.recoverySequence) this.scheduleCoreRestart()
      throw this.reportFailure(error)
    })
  }

  async startIdleCore(): Promise<void> {
    if (this.isProcessRunning()) return
    if (this.idleStartPromise) return this.idleStartPromise
    this.idleStartPromise = (async () => {
      try {
        if (this.isProcessRunning() || this.processManager.getState() === 'starting') return
        const profile = this.profileService.getActiveProfile()
        if (!profile) return
        const settings = this.settingService.getSettings()
        const idleSettings: AppConfig = {
          ...settings,
          kernel: { ...settings.kernel, tun: { ...settings.kernel.tun, enable: false } },
          sysProxy: { ...settings.sysProxy, enable: false }
        }
        const paths = getAppPaths()
        await installGeoResources(paths)
        const activeProfile = await this.configBuilder.build(idleSettings, false, undefined, false).catch(error => { throw this.reportFailure(error, 'configuration') })
        this.apiClient.reconfigure(
          '127.0.0.1',
          settings.kernel.controllerPort,
          settings.kernel.controllerSecret
        )
        this.isIdleCoreRunning = true
        await this.processManager.start(
          paths.mihomoDir,
          paths.activeConfigPath,
          settings.kernel.controllerPort,
          settings.kernel.controllerSecret,
          settings.kernel.channel
        )
        this.warnInvalidRules(activeProfile?.id)
        await restoreProxySelection(activeProfile, this.apiClient).catch(() => {})
      } catch (err) {
        this.isIdleCoreRunning = false
        logger.warn(`Failed to start idle core: ${String(err)}`)
      } finally {
        this.idleStartPromise = null
      }
    })()
    return this.idleStartPromise
  }

  private async startCore(settings = this.settingService.getSettings(), binaryPath?: string, persistRules = true): Promise<void> {
    if (this.getStatus() === 'running' || this.getStatus() === 'starting') return
    this.failure = null
    this.resetDirectTraffic()
    this.invalidateGlobe()
    const paths = getAppPaths()

    if (settings.kernel.tun.enable && process.platform === 'win32' && !isProcessElevated()) {
      throw new KernelOperationError('permission', 'TUN requires administrator privileges')
    }

    // Capture the physical source before TUN can alter routing if the 3D globe is active.
    // Skip external unproxied origin lookups in lite dashboard mode or direct routing.
    if (!settings.general?.liteDashboard && settings.kernel?.mode !== 'direct') {
      const origin = this.geoIp.captureOrigin(false).catch(() => {})
      if (settings.kernel.tun.enable) await origin
    }

    await installGeoResources(paths)

    const activeProfile = await this.configBuilder.build(settings, false, binaryPath, persistRules).catch(error => { throw this.reportFailure(error, 'configuration') })
    this.subscriptionTraffic.beginSession(activeProfile)

    this.apiClient.reconfigure(
      '127.0.0.1',
      settings.kernel.controllerPort,
      settings.kernel.controllerSecret
    )

    if (this.isIdleCoreRunning && this.isProcessRunning()) {
      try {
        await this.apiClient.reloadConfig(paths.activeConfigPath, true)
        this.isIdleCoreRunning = false
        this.sessionStartedAt = Date.now()
        this.warnInvalidRules(activeProfile?.id)
        await restoreProxySelection(activeProfile, this.apiClient)
        this.apiClient.startTrafficStream()
        this.broadcaster?.('event:core-status', 'running')
        return
      } catch {
        await this.processManager.stop()
        this.isIdleCoreRunning = false
      }
    }

    this.isIdleCoreRunning = false
    await this.processManager.start(
      paths.mihomoDir,
      paths.activeConfigPath,
      settings.kernel.controllerPort,
      settings.kernel.controllerSecret,
      binaryPath ?? settings.kernel.channel
    )
    this.warnInvalidRules(activeProfile?.id)
    await restoreProxySelection(activeProfile, this.apiClient)
  }

  private warnInvalidRules(profileId?: string): void {
    this.ruleWarning = null
    if (!profileId || !this.profileService.getCustomRules(profileId).some((rule) => rule.enabled !== false && rule.validationError)) return
    const settings = this.settingService.getSettings()
    this.ruleWarning = nativeMessage(settings.general.language, 'invalidUserRulesMessage', settings.general)
    this.broadcaster?.(IPC_CHANNELS.EVENT_WARNING, this.ruleWarning)
  }

  stop(): Promise<void> {
    this.desiredRunning = false
    this.cancelResume()
    this.invalidateGlobe()
    return this.enqueueLifecycle(() => this.stopCore())
  }

  pauseStreams(): void {
    // Traffic remains active for tray statistics while the renderer is hidden.
    this.globeResolver.releaseCaches()
    this.geoIp.releaseWorker()
  }

  resumeStreams(): void {
    if (this.getStatus() === 'running') {
      this.apiClient.startTrafficStream()
    }
  }

  private async stopCore(): Promise<void> {
    this.isIdleCoreRunning = false
    this.serviceCheckAbort?.abort()
    this.apiClient.stopAllStreams()
    if (this.getStatus() === 'running' || this.isProcessRunning()) {
      try {
        // Gracefully request Mihomo to teardown TUN adapter before process termination
        await Promise.race([
          this.apiClient.patchConfigs({ tun: { enable: false } }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 800))
        ]).catch(() => {})

        // Gracefully close active proxy streams in Mihomo engine
        await Promise.race([
          this.apiClient.closeAllConnections(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500))
        ]).catch(() => {})
      } catch {
        // Fallback silently if API is unreachable
      }
    }
    await this.processManager.stop()
    this.resetDirectTraffic()
    flushSystemDns()
  }

  restart(): Promise<void> {
    this.failure = null
    this.desiredRunning = true
    this.restartAttempts = 0
    this.cancelResume()
    this.invalidateGlobe()
    const sequence = this.recoverySequence
    return this.enqueueLifecycle(async () => {
      await this.stopCore()
      await this.startCore()
    }).catch(error => {
      if (sequence === this.recoverySequence) this.scheduleCoreRestart()
      throw this.reportFailure(error)
    })
  }

  setProcessBinaryPath(binaryPath: string | null): void {
    this.processManager.setBinaryPath(binaryPath)
  }

  async switchCoreBinary(targetChannel: CoreChannel, candidateBinaryPath: string, installation?: {
    promote: () => Promise<string>
    rollback: () => Promise<void>
    commit?: () => Promise<void>
  }): Promise<void> {
    return this.enqueueLifecycle(async () => {
      const paths = getAppPaths()
      const settings = this.settingService.getSettings()
      const previousBinary = this.processManager.getBinaryPath() || resolveCoreBinaryPath(settings.kernel.channel ?? 'stable')
      const wasRunning = ['running', 'starting'].includes(this.getStatus())
      const testSettings = { ...settings, kernel: { ...settings.kernel, channel: targetChannel } }
      const testConfigFile = path.join(paths.mihomoDir, `.test-core-${randomUUID()}.yaml`)
      try {
        const activeProfile = this.profileService.getActiveProfile()
        const content = activeProfile ? await this.profileService.getProfileContent(activeProfile.id) : null
        if (activeProfile && content === null) throw new Error('Active profile file is missing')
        const configYaml = await this.configBuilder.prepare(content, testSettings, activeProfile?.id, candidateBinaryPath, false)
        await fs.writeFile(testConfigFile, configYaml, 'utf8')
        await runFile(candidateBinaryPath, ['-t', '-d', paths.mihomoDir, '-f', testConfigFile], {
          windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024
        })
      } catch (testError) {
        const err = testError as Error & { stdout?: string; stderr?: string }
        const output = [err.stderr, err.stdout, err.message].filter(Boolean).join('\n')
        throw new Error(`Core configuration test failed (-t): ${output}`, { cause: testError })
      } finally {
        await fs.unlink(testConfigFile).catch(() => {})
      }

      let settingsSaved = false
      try {
        if (wasRunning) await this.stopCore()
        // File promotion is part of the lifecycle transaction, after the old process stops.
        const binary = installation ? await installation.promote() : candidateBinaryPath
        this.processManager.setBinaryPath(binary)
        if (wasRunning) await this.startCore(testSettings, binary, false)
        await this.settingService.updateSettings({ kernel: { ...this.settingService.getSettings().kernel, channel: targetChannel } })
        settingsSaved = true
        await installation?.commit?.()
      } catch (error) {
        let rolledBack = false
        try {
          if (wasRunning) await this.stopCore()
          if (installation) await installation.rollback()
          if (settingsSaved) await this.settingService.updateSettings({ kernel: { ...this.settingService.getSettings().kernel, channel: settings.kernel.channel } })
          this.processManager.setBinaryPath(previousBinary)
          if (wasRunning) await this.startCore(settings, previousBinary, false)
          rolledBack = true
        } catch (rollbackError) {
          logger.error('Failed to restore previous core', rollbackError)
        }
        throw Object.assign(new Error(
          `Core switch failed: ${error instanceof Error ? error.message : String(error)}. ${rolledBack ? 'Rolled back to previous core.' : 'Rollback failed.'}`,
          { cause: error }
        ), { rolledBack })
      }
      this.broadcaster?.(IPC_CHANNELS.EVENT_SETTINGS_CHANGED, null)
    })
  }

  async reloadConfig(force = true): Promise<void> {
    this.serviceCheckAbort?.abort()
    return this.enqueueLifecycle(async () => {
      // Recheck after queued start/stop operations: applying a profile never starts a stopped core.
      if (!this.isProcessRunning()) return
      this.failure = null
      this.invalidateGlobe()
      const configPath = getAppPaths().activeConfigPath
      const previous = await fs.readFile(configPath, 'utf8')
      const settings = this.settingService.getSettings()
      const effectiveSettings: AppConfig = !this.isIdleCoreRunning
        ? settings
        : {
            ...settings,
            kernel: { ...settings.kernel, tun: { ...settings.kernel.tun, enable: false } },
            sysProxy: { ...settings.sysProxy, enable: false }
          }
      let activeProfile
      try {
        activeProfile = await this.configBuilder.build(effectiveSettings, true)
      } catch (error) {
        await writeFileAtomicAsync(configPath, previous)
        throw this.reportFailure(error, 'configuration')
      }
      try {
        await this.apiClient.reloadConfig(configPath, force)
      } catch (err) {
        // A rejected configuration leaves the old runtime intact. Do not destroy it with a restart.
        const rejected = axios.isAxiosError(err) && [400, 422].includes(err.response?.status ?? 0)
        let healthy = false
        if (!rejected) {
          try { await this.apiClient.getVersion(); healthy = true } catch { /* Recover an unreachable core below. */ }
        }
        if (rejected || healthy) {
          await writeFileAtomicAsync(configPath, previous)
          throw this.reportFailure(err, rejected ? 'configuration' : undefined)
        }
        logger.warn('Hot config reload failed and the controller is unreachable; restarting the core')
        await this.stopCore()
        await this.startCore()
        return
      }
      logger.info('Mihomo configuration reloaded on the fly via REST API')
      this.warnInvalidRules(activeProfile?.id)
      // Selection restoration must not turn an applied configuration into a failed reload.
      await restoreProxySelection(activeProfile, this.apiClient)
        .catch(error => logger.warn(`Could not restore proxy selections after config reload: ${String(error)}`))
      this.broadcaster?.(IPC_CHANNELS.EVENT_SETTINGS_CHANGED, null)
    }).catch(error => { throw this.reportFailure(error) })
  }

  // Proxied Mihomo API calls
  async getProviders(kind: ProviderKind): Promise<ProviderSummary[]> {
    if (!this.isProcessRunning()) return []
    return this.apiClient.getProviders(kind)
  }

  async updateProvider(kind: ProviderKind, name: string): Promise<void> {
    return this.enqueueLifecycle(async () => {
      if (!this.isProcessRunning()) {
        await this.startIdleCore()
      }
      if (!this.isProcessRunning()) throw new Error('Start the VPN core before updating providers')
      const providers = await this.apiClient.getProviders(kind)
      const provider = providers.find(item => item.name === name)
      if (!provider || provider.vehicleType.toLowerCase() !== 'http') throw new Error('Provider cannot be updated remotely')
      await this.apiClient.updateProvider(kind, name)
      this.invalidateGlobe()
      this.broadcaster?.(IPC_CHANNELS.EVENT_SETTINGS_CHANGED, null)
    })
  }

  async getConfigs(): Promise<Record<string, unknown>> {
    return this.apiClient.getConfigs()
  }

  async getMixedPort(): Promise<number> {
    const configs = await this.getConfigs()
    const port = configs['mixed-port']
    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Mihomo mixed listener is unavailable')
    return port
  }

  async getEffectiveCore(patch: Partial<AppConfig> = {}): Promise<EffectiveCoreValues> {
    const settings = mergeSettings(this.settingService.getSettings(), patch)
    const profile = this.profileService.getActiveProfile()
    const content = profile ? await this.profileService.getProfileContent(profile.id) : null
    if (profile && content === null) throw new Error('Profile file is missing')
    return resolveEffectiveCore(content === null ? {} : parseProfileConfig(content), settings)
  }

  async getConfigPreview(patch: Partial<AppConfig> = {}): Promise<ConfigPreview> {
    const settings = mergeSettings(this.settingService.getSettings(), patch)
    const profile = this.profileService.getActiveProfile()
    const content = profile ? await this.profileService.getProfileContent(profile.id) : null
    if (profile && content === null) throw new Error('Profile file is missing')
    return {
      profileName: profile?.name ?? null, original: content ?? '',
      effective: MihomoConfigFactory.synthesize(content, settings, profile ? this.profileService.getCustomRules(profile.id) : [])
    }
  }

  async patchConfigs(patch: Record<string, unknown>): Promise<void> {
    await this.apiClient.patchConfigs(patch)
    this.invalidateGlobe()
  }

  async getProxies(): Promise<Record<string, ProxyNode>> {
    if (this.isProcessRunning()) {
      try {
        return await this.apiClient.getProxies()
      } catch (err) {
        logger.warn(`Failed to load proxies from API: ${String(err)}`)
      }
    }
    const profile = this.profileService.getActiveProfile()
    if (!profile) return {}
    try {
      const content = await this.profileService.getProfileContent(profile.id)
      if (content === null) return {}
      return await offlineProxies(yaml.parse(content) as Record<string, unknown>, getAppPaths().mihomoDir, profile.selectedGroupProxies)
    } catch (err) {
      logger.warn(`Failed to load offline proxies: ${String(err)}`)
      return {}
    }
  }

  async selectProxy(group: string, proxy: string): Promise<void> {
    return this.enqueueLifecycle(async () => {
      const profile = this.profileService.getActiveProfile()
      if (!profile) throw new Error('No active profile')
      const proxies = await this.getProxies()
      if (!(proxies[group] as ProxyGroup | undefined)?.all?.includes(proxy)) throw new Error('Proxy is not available in this group')
      if (this.isProcessRunning()) {
        await this.apiClient.selectProxy(group, proxy)
        if (this.settingService.getSettings().general.autoCloseConnection) await this.apiClient.closeAllConnections()
      }
      await this.profileService.setSelectedProxy(profile.id, group, proxy)
      this.invalidateGlobe()
    })
  }

  async testDelay(name: string, url?: string, timeout?: number): Promise<number> {
    const general = this.settingService.getSettings().general
    if (!this.isProcessRunning()) {
      await this.startIdleCore()
    }
    return this.apiClient.testProxyDelay(name, url ?? general.delayTestUrl, timeout ?? general.delayTestTimeout)
  }

  async getRules(scope?: 'summary'): Promise<MihomoRule[]> {
    if (this.isProcessRunning()) {
      try {
        const rules = await this.apiClient.getRules()
        return scope === 'summary' ? summarizeRules(rules) : rules
      } catch (err) {
        logger.warn(`Failed to fetch rules from Mihomo API, falling back to offline rules: ${String(err)}`)
      }
    }
    const profile = this.profileService.getActiveProfile()
    if (!profile) return []
    try {
      const content = await this.profileService.getProfileContent(profile.id)
      if (content === null) return []
      const customRules = this.profileService.getCustomRules(profile.id)
      const rules = offlineRules(yaml.parse(content) as Record<string, unknown>, customRules)
      return scope === 'summary' ? summarizeRules(rules) : rules
    } catch (err) {
      logger.warn(`Failed to load offline rules: ${String(err)}`)
      return []
    }
  }

  async getConnections(): Promise<ConnectionsSnapshot> {
    if (this.getStatus() !== 'running') {
      return { downloadTotal: 0, uploadTotal: 0, connections: [],
        subscriptionTraffic: this.subscriptionTraffic.get(this.profileService.getActiveProfile()) }
    }
    const snapshot = this.trafficAccounting.sample(await this.apiClient.getConnections())
    return {
      ...snapshot,
      subscriptionTraffic: this.subscriptionTraffic.sample(this.profileService.getActiveProfile(),
        (snapshot.vpnDownloadTotal ?? 0) + (snapshot.vpnUploadTotal ?? 0))
    }
  }

  private invalidateGlobe(): void {
    this.globeResolver.invalidate()
  }

  getGlobeLocations(): Promise<GlobeLocations> {
    return this.globeResolver.getLocations()
  }

  async closeConnection(id: string): Promise<void> {
    await this.apiClient.closeConnection(id)
  }

  async closeAllConnections(): Promise<void> {
    await this.apiClient.closeAllConnections()
  }
}
