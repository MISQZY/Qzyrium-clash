import path from 'node:path'
import type { AppConfig } from '@shared/app-config'
import { MihomoProcessManager } from '../core/MihomoProcessManager'
import { MihomoApiClient } from '../core/MihomoApiClient'
import { ActiveConfigBuilder, type ProfileConfigSource } from '../core/ActiveConfigBuilder'
import { TrafficAccounting } from '../core/TrafficAccounting'
import { GeoIpService } from './GeoIpService'
import { LocalGeoIp } from '../utils/local-geoip'
import { getAppPaths } from '../utils/paths'

/** Infrastructure is created here so the kernel can accept a complete test runtime. */
export function createKernelRuntime(settings: AppConfig, profiles: ProfileConfigSource) {
  const processManager = new MihomoProcessManager()
  const apiClient = new MihomoApiClient('127.0.0.1', settings.kernel.controllerPort, settings.kernel.controllerSecret)
  const geoIp = new GeoIpService(new LocalGeoIp(() => {
    try { return path.resolve(getAppPaths().geoFilesDir, 'geoip.dat') }
    catch { return undefined }
  }), async host => {
    if (processManager.getState() !== 'running') return null
    try { return await apiClient.resolveHost(host) }
    catch { return null }
  })
  return { processManager, apiClient, geoIp,
    configBuilder: new ActiveConfigBuilder(profiles), trafficAccounting: new TrafficAccounting() }
}
