import axios, { AxiosInstance } from 'axios'
import WebSocket from 'ws'
import { EventEmitter } from 'events'
import {
  ConnectionsSnapshot,
  MihomoRule,
  ProxyNode
} from '@shared/mihomo'
import { LogEntry, MihomoVersion, TrafficStats } from '@shared/types'
import { logger } from '../utils/logger'

export class MihomoApiClient extends EventEmitter {
  private axiosInstance: AxiosInstance | null = null
  private host: string
  private port: number
  private secret: string

  private trafficWs: WebSocket | null = null
  private logsWs: WebSocket | null = null
  private memoryWs: WebSocket | null = null
  private shouldStreamTraffic = false
  private shouldStreamLogs = false
  private currentLogLevel = 'info'

  constructor(host = '127.0.0.1', port = 9090, secret = '') {
    super()
    this.host = host
    this.port = port
    this.secret = secret
    this.reconfigure(host, port, secret)
  }

  reconfigure(host: string, port: number, secret: string): void {
    this.host = host
    this.port = port
    this.secret = secret

    this.axiosInstance = axios.create({
      baseURL: `http://${host}:${port}`,
      timeout: 10000,
      headers: {
        Authorization: secret ? `Bearer ${secret}` : undefined,
        'Content-Type': 'application/json'
      }
    })
  }

  private get client(): AxiosInstance {
    if (!this.axiosInstance) {
      throw new Error('MihomoApiClient not initialized')
    }
    return this.axiosInstance
  }

  // --- REST Endpoints ---

  async getVersion(): Promise<MihomoVersion> {
    const res = await this.client.get<MihomoVersion>('/version')
    return res.data
  }

  async getConfigs(): Promise<Record<string, unknown>> {
    const res = await this.client.get<Record<string, unknown>>('/configs')
    return res.data
  }

  async patchConfigs(patch: Record<string, unknown>): Promise<void> {
    await this.client.patch('/configs', patch)
  }

  async reloadConfig(force = true): Promise<void> {
    await this.client.put(`/configs?force=${force}`)
  }

  async getProxies(): Promise<Record<string, ProxyNode>> {
    const res = await this.client.get<{ proxies: Record<string, ProxyNode> }>('/proxies')
    return res.data.proxies || {}
  }

  async selectProxy(groupName: string, proxyName: string): Promise<void> {
    await this.client.put(`/proxies/${encodeURIComponent(groupName)}`, {
      name: proxyName
    })
  }

  async testProxyDelay(
    proxyName: string,
    url = 'http://www.gstatic.com/generate_204',
    timeout = 5000
  ): Promise<number> {
    const res = await this.client.get<{ delay: number }>(
      `/proxies/${encodeURIComponent(proxyName)}/delay`,
      {
        params: { url, timeout }
      }
    )
    return res.data.delay
  }

  async getRules(): Promise<MihomoRule[]> {
    const res = await this.client.get<{ rules: MihomoRule[] }>('/rules')
    return res.data.rules || []
  }

  async getConnections(): Promise<ConnectionsSnapshot> {
    const res = await this.client.get<ConnectionsSnapshot>('/connections')
    return res.data
  }

  async closeConnection(id: string): Promise<void> {
    await this.client.delete(`/connections/${encodeURIComponent(id)}`)
  }

  async closeAllConnections(): Promise<void> {
    await this.client.delete('/connections')
  }

  // --- WebSocket Streaming ---

  startTrafficStream(): void {
    this.shouldStreamTraffic = true
    if (this.trafficWs) return

    const wsUrl = `ws://${this.host}:${this.port}/traffic${this.secret ? `?token=${this.secret}` : ''}`
    this.trafficWs = new WebSocket(wsUrl)

    this.trafficWs.on('message', (data: WebSocket.RawData) => {
      try {
        const stats: TrafficStats = JSON.parse(data.toString())
        this.emit('traffic', stats)
      } catch {
        // ignore parse errors
      }
    })

    this.trafficWs.on('error', (err) => {
      logger.debug(`Traffic WS error: ${err.message}`)
    })

    this.trafficWs.on('close', () => {
      this.trafficWs = null
      if (this.shouldStreamTraffic) {
        setTimeout(() => {
          if (this.shouldStreamTraffic) this.startTrafficStream()
        }, 2000)
      }
    })
  }

  stopTrafficStream(): void {
    this.shouldStreamTraffic = false
    if (this.trafficWs) {
      this.trafficWs.terminate()
      this.trafficWs = null
    }
  }

  startLogStream(level = 'info'): void {
    this.shouldStreamLogs = true
    this.currentLogLevel = level
    if (this.logsWs) return

    const wsUrl = `ws://${this.host}:${this.port}/logs?level=${level}${this.secret ? `&token=${this.secret}` : ''}`
    this.logsWs = new WebSocket(wsUrl)

    this.logsWs.on('message', (data: WebSocket.RawData) => {
      try {
        const parsed = JSON.parse(data.toString())
        const entry: LogEntry = {
          type: parsed.type || 'info',
          payload: parsed.payload || '',
          time: new Date().toLocaleTimeString()
        }
        this.emit('log', entry)
      } catch {
        // ignore parse errors
      }
    })

    this.logsWs.on('error', (err) => {
      logger.debug(`Logs WS error: ${err.message}`)
    })

    this.logsWs.on('close', () => {
      this.logsWs = null
      if (this.shouldStreamLogs) {
        setTimeout(() => {
          if (this.shouldStreamLogs) this.startLogStream(this.currentLogLevel)
        }, 2000)
      }
    })
  }

  stopLogStream(): void {
    this.shouldStreamLogs = false
    if (this.logsWs) {
      this.logsWs.terminate()
      this.logsWs = null
    }
  }

  stopAllStreams(): void {
    this.stopTrafficStream()
    this.stopLogStream()
  }
}
