import { useLocale, useTranslations } from '../i18n'
import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  Search,
  Copy,
  Check,
  AppWindow,
  Terminal,
  Globe,
  Clock,
  Layers,
  ArrowDown,
  ArrowUp,
  Activity,
  ArrowLeft,
  ChevronRight,
  ListFilter,
  Share2,
  ShieldAlert
} from 'lucide-react'
import { ConnectionsIcon, DisconnectIcon } from '../lib/icons'
import type { ConnectionItem, ConnectionsSnapshot } from '@shared/mihomo'
import { Page } from '../components/Page'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '../components/ui/dialog'
import { CopyableCodeLine } from '../components/CopyableCodeLine'
import { ScrollArea } from '../components/ui/scroll-area'
import { formatDuration } from '../lib/format'
import { EmojiText } from '../components/EmojiText'
import { TrafficValue } from '../components/TrafficValue'
import druseSvg from '../assets/brand/druse.svg'

function extractProcessName(processPath?: string): string {
  if (!processPath) return ''
  const base = processPath.split(/[\\/]/).pop() || ''
  return base.trim()
}

function getAppCategoryIcon(processName: string) {
  const lower = processName.toLowerCase()
  if (
    lower.includes('chrome') ||
    lower.includes('msedge') ||
    lower.includes('edge') ||
    lower.includes('firefox') ||
    lower.includes('brave') ||
    lower.includes('opera') ||
    lower.includes('safari') ||
    lower.includes('vivaldi') ||
    lower.includes('yandex')
  ) {
    return Globe
  }
  if (
    lower.includes('terminal') ||
    lower.includes('cmd') ||
    lower.includes('powershell') ||
    lower.includes('pwsh') ||
    lower.includes('bash') ||
    lower.includes('node') ||
    lower.includes('git') ||
    lower.includes('curl') ||
    lower.includes('python') ||
    lower.includes('code')
  ) {
    return Terminal
  }
  if (
    lower.includes('telegram') ||
    lower.includes('discord') ||
    lower.includes('slack') ||
    lower.includes('whatsapp') ||
    lower.includes('signal')
  ) {
    return Share2
  }
  return AppWindow
}

const clientIconCache = new Map<string, string>()

function ProcessIcon({
  processPath,
  processName,
  className = 'size-4.5',
  fallbackClassName = 'size-4.5'
}: {
  processPath?: string
  processName?: string
  className?: string
  fallbackClassName?: string
}) {
  const name = processName || extractProcessName(processPath) || ''
  const lowerName = name.toLowerCase()
  const lowerPath = (processPath || '').toLowerCase()
  const isQzyrium =
    lowerName.includes('qzyrium') ||
    lowerName === 'qzyrium-clash' ||
    lowerName === 'qzyrium-clash.exe' ||
    lowerPath.includes('qzyrium')

  if (isQzyrium) {
    return (
      <img
        src={druseSvg}
        alt={name || 'Qzyrium-clash'}
        className={`${className} object-contain rounded-xs select-none`}
      />
    )
  }

  const [iconUrl, setIconUrl] = useState<string | null>(() => {
    if (!processPath) return null
    return clientIconCache.get(processPath) || null
  })

  useEffect(() => {
    if (!processPath || !window.api?.app?.getProcessIcon) return
    if (clientIconCache.has(processPath)) {
      setIconUrl(clientIconCache.get(processPath) || null)
      return
    }
    let active = true
    window.api.app.getProcessIcon(processPath).then((url) => {
      if (active) {
        clientIconCache.set(processPath, url || '')
        if (url) {
          setIconUrl(url)
        }
      }
    }).catch(() => {
      clientIconCache.set(processPath, '')
    })
    return () => {
      active = false
    }
  }, [processPath])

  const FallbackIcon = getAppCategoryIcon(name)

  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt={name}
        className={`${className} object-contain rounded-xs select-none`}
        onError={() => {
          clientIconCache.set(processPath || '', '')
          setIconUrl(null)
        }}
      />
    )
  }

  return <FallbackIcon className={fallbackClassName} />
}

function getSubDomains(domain: string): string[] {
  const parts = domain.split('.')
  if (parts.length <= 2) return [domain]
  return parts.map((_, i) => parts.slice(i).join('.')).slice(0, -1)
}

function isIPv6(ip: string): boolean {
  return ip.includes(':')
}

interface ProcessGroup {
  key: string
  name: string
  path: string
  connections: ConnectionItem[]
  activeCount: number
  totalUpload: number
  totalDownload: number
  latestStart: number
}

export function ConnectionsPage({
  connections,
  onRefresh
}: {
  connections: ConnectionsSnapshot
  onRefresh: () => void
}) {
  const t = useTranslations('connections')
  const common = useTranslations('common')
  const locale = useLocale()

  const [viewMode, setViewMode] = useState<'process' | 'flat'>('process')
  const [selectedProcessKey, setSelectedProcessKey] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [flatLimit, setFlatLimit] = useState(100)
  const [processLimit, setProcessLimit] = useState(100)
  const [protocolFilter, setProtocolFilter] = useState<'all' | 'tcp' | 'udp'>('all')
  const [sortBy, setSortBy] = useState<'traffic' | 'time' | 'process'>('traffic')
  const [selectedConnection, setSelectedConnection] = useState<ConnectionItem | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState('')

  const handleCopy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev))
    }, 1800)
  }, [])

  const close = async (id?: string) => {
    if (!window.api || closing || (!id && !confirm(t('terminateAllActiveSessions')))) return
    setClosing(true)
    setError('')
    try {
      if (id) {
        await window.api.mihomo.closeConnection(id)
        if (selectedConnection?.id === id) {
          setSelectedConnection(null)
        }
      } else {
        await window.api.mihomo.closeAllConnections()
        setSelectedConnection(null)
      }
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setClosing(false)
    }
  }

  const closeProcessConnections = async (group: ProcessGroup) => {
    if (!window.api || closing) return
    setClosing(true)
    setError('')
    try {
      await Promise.all(group.connections.map((item) => window.api.mihomo.closeConnection(item.id)))
      if (selectedConnection && group.connections.some((c) => c.id === selectedConnection.id)) {
        setSelectedConnection(null)
      }
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setClosing(false)
    }
  }

  // Filter individual connections by protocol and search query
  const matchesConnectionFilters = useCallback(
    (item: ConnectionItem, q: string) => {
      if (protocolFilter !== 'all' && item.metadata.network.toLowerCase() !== protocolFilter) {
        return false
      }
      if (!q) return true
      const proc = extractProcessName(item.metadata.processPath) || item.metadata.process || ''
      const str = `${proc} ${item.metadata.host || ''} ${item.metadata.destinationIP || ''} ${item.metadata.processPath || ''} ${item.rule || ''} ${item.chains.join(' ')}`.toLowerCase()
      return str.includes(q)
    },
    [protocolFilter]
  )

  // Construct Process Groups
  const processGroups = useMemo(() => {
    const q = query.toLowerCase().trim()
    const groupMap = new Map<string, ProcessGroup>()

    for (const item of connections.connections) {
      if (!matchesConnectionFilters(item, q)) continue

      const rawPath = item.metadata.processPath || item.metadata.process || ''
      const procName =
        item.metadata.process ||
        extractProcessName(item.metadata.processPath) ||
        (item.metadata.sourceIP ? `IP: ${item.metadata.sourceIP}` : '') ||
        t('system')

      const groupKey = rawPath || item.metadata.process || procName || 'system'
      const startTime = new Date(item.start).getTime()

      const existing = groupMap.get(groupKey)
      if (existing) {
        existing.connections.push(item)
        existing.activeCount++
        existing.totalUpload += item.upload
        existing.totalDownload += item.download
        if (startTime > existing.latestStart) {
          existing.latestStart = startTime
        }
      } else {
        groupMap.set(groupKey, {
          key: groupKey,
          name: procName,
          path: rawPath,
          connections: [item],
          activeCount: 1,
          totalUpload: item.upload,
          totalDownload: item.download,
          latestStart: startTime
        })
      }
    }

    const groups = Array.from(groupMap.values())

    groups.sort((a, b) => {
      if (sortBy === 'traffic') {
        return b.totalDownload + b.totalUpload - (a.totalDownload + a.totalUpload)
      }
      if (sortBy === 'time') {
        return b.latestStart - a.latestStart
      }
      if (sortBy === 'process') {
        return a.name.localeCompare(b.name)
      }
      return 0
    })

    return groups
  }, [connections.connections, query, matchesConnectionFilters, sortBy, t])

  // Flat list of connections
  const filteredAndSortedList = useMemo(() => {
    const q = query.toLowerCase().trim()
    return connections.connections
      .filter((item) => matchesConnectionFilters(item, q))
      .sort((a, b) => {
        if (sortBy === 'traffic') {
          return b.download + b.upload - (a.download + a.upload)
        }
        if (sortBy === 'time') {
          return new Date(b.start).getTime() - new Date(a.start).getTime()
        }
        if (sortBy === 'process') {
          const nameA = extractProcessName(a.metadata.processPath) || a.metadata.process || t('system')
          const nameB = extractProcessName(b.metadata.processPath) || b.metadata.process || t('system')
          return nameA.localeCompare(nameB)
        }
        return 0
      })
  }, [connections.connections, query, matchesConnectionFilters, sortBy, t])

  // Active selected group in drilldown view
  const activeProcessGroup = useMemo(() => {
    if (!selectedProcessKey) return null
    return processGroups.find((g) => g.key === selectedProcessKey) || null
  }, [selectedProcessKey, processGroups])

  // Keep selectedConnection fresh with real-time speed/data if it updates
  const activeDetail = useMemo(() => {
    if (!selectedConnection) return null
    return connections.connections.find((c) => c.id === selectedConnection.id) || selectedConnection
  }, [selectedConnection, connections.connections])

  const renderConnectionCard = (item: ConnectionItem) => {
    const procName = extractProcessName(item.metadata.processPath) || item.metadata.process || t('system')
    const IconComponent = getAppCategoryIcon(procName)
    const isUdp = item.metadata.network.toLowerCase() === 'udp'
    const duration = formatDuration(Math.max(0, Date.now() - new Date(item.start).getTime()))
    const hostOrIp = item.metadata.host || item.metadata.destinationIP || t('unknownHost')
    const fullDestination = `${hostOrIp}${item.metadata.destinationPort ? `:${item.metadata.destinationPort}` : ''}`

    return (
      <Card
        key={item.id}
        onClick={() => setSelectedConnection(item)}
        className="group relative cursor-pointer border border-border/70 bg-card hover:bg-muted/30 hover:border-primary/40 transition-colors p-3 shadow-none rounded-xl"
      >
        <div className="flex items-center justify-between gap-3">
          {/* Left: Process icon & Details */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 group-hover:scale-105 transition-transform overflow-hidden p-1">
              <ProcessIcon
                processPath={item.metadata.processPath}
                processName={procName}
                className="size-5"
                fallbackClassName="size-4.5"
              />
            </div>

            <div className="flex flex-col min-w-0 flex-1">
              {/* Top line: Process name, Protocol Badge, Rule Badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-foreground truncate max-w-[180px] sm:max-w-[260px]">
                  {procName}
                </span>
                <Badge
                  variant="outline"
                  className={`text-[9px] font-mono px-1.5 py-0 uppercase border ${
                    isUdp
                      ? 'border-warning/40 text-warning bg-warning/10'
                      : 'border-primary/40 text-primary bg-primary/10'
                  }`}
                >
                  {item.metadata.network}
                </Badge>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                  {item.rule}
                </Badge>
              </div>

              {/* Bottom line: Code-style destination chip with embedded copy button */}
              <div className="flex items-center gap-2 mt-1 min-w-0 flex-wrap">
                <div
                  className="group/codechip inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-border/60 bg-muted/40 dark:bg-zinc-950/40 font-mono text-[11px] text-foreground/90 max-w-[260px] sm:max-w-[360px] hover:border-primary/40 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCopy(fullDestination, `host-${item.id}`)
                  }}
                  title={fullDestination}
                >
                  <span className="truncate font-mono">
                    <EmojiText text={hostOrIp} />
                    {item.metadata.destinationPort ? `:${item.metadata.destinationPort}` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCopy(fullDestination, `host-${item.id}`)
                    }}
                    title={copiedKey === `host-${item.id}` ? t('copied') : t('copy')}
                    aria-label={copiedKey === `host-${item.id}` ? t('copied') : t('copy')}
                    className="shrink-0 p-0.5 rounded text-muted-foreground/60 hover:text-foreground hover:bg-background/80 transition-colors"
                  >
                    {copiedKey === `host-${item.id}` ? (
                      <Check className="size-3 text-success" />
                    ) : (
                      <Copy className="size-3 opacity-60 group-hover/codechip:opacity-100" />
                    )}
                  </button>
                </div>

                <span className="text-border text-xs hidden sm:inline">•</span>
                <span className="text-[11px] text-muted-foreground hidden sm:inline">
                  <EmojiText text={item.chains.join(' → ') || 'DIRECT'} />
                </span>
              </div>
            </div>
          </div>

          {/* Right: Traffic, Duration & Disconnect Action */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex flex-col items-end text-right font-mono text-[11px] leading-tight">
              <TrafficValue value={item.download} direction="download" />
              <TrafficValue value={item.upload} direction="upload" className="mt-0.5" />
            </div>

            <div className="hidden sm:flex flex-col items-end text-right text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1 font-mono">
                <Clock className="size-2.5" />
                {duration}
              </span>
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('closeConnection', { host: item.metadata.host || item.metadata.destinationIP })}
              disabled={closing}
              onClick={(e) => {
                e.stopPropagation()
                close(item.id)
              }}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <DisconnectIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Page
      title={selectedProcessKey && activeProcessGroup ? activeProcessGroup.name : t('connections')}
      actions={
        <div className="flex items-center gap-2">
          {selectedProcessKey && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedProcessKey(null)}
              className="gap-1.5 text-xs"
            >
              <ArrowLeft className="size-3.5" />
              <span>{t('backToProcesses')}</span>
            </Button>
          )}

          {/* View mode toggle: By Process vs Flat list */}
          <div className="flex items-center rounded-lg border border-border/80 bg-muted/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => {
                setViewMode('process')
                setSelectedProcessKey(null)
              }}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                viewMode === 'process'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Layers className="size-3" />
              <span>{t('groupByProcess')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('flat')
                setSelectedProcessKey(null)
              }}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                viewMode === 'flat'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ListFilter className="size-3" />
              <span>{t('allConnections')}</span>
            </button>
          </div>

          <Button
            onClick={() => close()}
            variant="destructive"
            size="sm"
            disabled={closing || !connections.connections.length}
            className="gap-1.5 text-xs"
          >
            <DisconnectIcon className="size-3.5" />
            <span>{t('closeAll')}</span>
          </Button>
        </div>
      }
    >
      {/* Search & Filters Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            aria-label={t('searchConnections')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9 h-9 text-xs"
            placeholder={t('searchHostProcessOrRoutingRule')}
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Protocol filter chips */}
          <div className="flex items-center rounded-lg border border-border/80 bg-muted/40 p-0.5 text-xs">
            {(['all', 'tcp', 'udp'] as const).map((proto) => (
              <button
                key={proto}
                type="button"
                onClick={() => setProtocolFilter(proto)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  protocolFilter === proto
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {proto === 'all' ? t('all') : proto.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Sort selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'traffic' | 'time' | 'process')}
            aria-label={t('sortBy')}
            className="h-8 rounded-lg border border-border/80 bg-muted/40 px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="traffic">{t('sortByTraffic')}</option>
            <option value="time">{t('sortByTime')}</option>
            <option value="process">{t('sortByProcess')}</option>
          </select>

          <span className="shrink-0 text-xs tabular-nums text-muted-foreground px-1">
            {viewMode === 'process' && !selectedProcessKey
              ? t('processesCount', { count: processGroups.length })
              : t('sessions', { count: filteredAndSortedList.length })}
          </span>
        </div>
      </div>

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      {/* Main Content View */}
      {viewMode === 'process' && selectedProcessKey && activeProcessGroup ? (
        /* Level 2: Drilldown into selected process */
        <div className="flex flex-col gap-3">
          {/* Hero Process Banner */}
          <Card className="p-4 rounded-xl border border-border/70 bg-card/60 backdrop-blur-xs flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 border border-primary/25 overflow-hidden p-1.5">
                  <ProcessIcon
                    processPath={activeProcessGroup.path}
                    processName={activeProcessGroup.name}
                    className="size-6"
                    fallbackClassName="size-5.5"
                  />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-foreground truncate">
                      {activeProcessGroup.name}
                    </h3>
                    <Badge className="min-w-5 h-5 justify-center px-1.5 leading-none text-[11px] font-semibold bg-primary text-primary-foreground border-0 rounded-full">
                      {t('sessions', { count: activeProcessGroup.connections.length })}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs font-mono">
                    <TrafficValue key={`${activeProcessGroup.key}-download`} value={activeProcessGroup.totalDownload} direction="download" />
                    <TrafficValue key={`${activeProcessGroup.key}-upload`} value={activeProcessGroup.totalUpload} direction="upload" />
                  </div>
                </div>
              </div>

              <Button
                variant="destructive"
                size="sm"
                onClick={() => closeProcessConnections(activeProcessGroup)}
                disabled={closing || !activeProcessGroup.connections.length}
                className="gap-1.5 text-xs shrink-0 self-start sm:self-center"
              >
                <DisconnectIcon className="size-3.5" />
                <span>{t('closeProcessConnections')}</span>
              </Button>
            </div>
          </Card>

          {/* List of connections for this process */}
          <div className="flex flex-col gap-2">
            {activeProcessGroup.connections.slice(0, processLimit).map(renderConnectionCard)}

            {activeProcessGroup.connections.length > processLimit && (
              <div className="flex justify-center pt-2 pb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setProcessLimit((prev) => prev + 100)}
                  className="gap-2 text-xs"
                >
                  {t('showMore', { count: activeProcessGroup.connections.length - processLimit })}
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : viewMode === 'process' ? (
        /* Level 1: Process Cards List */
        <div className="flex flex-col gap-2">
          {processGroups.map((group) => {
            const IconComponent = getAppCategoryIcon(group.name)

            return (
              <Card
                key={group.key}
                onClick={() => setSelectedProcessKey(group.key)}
                className="group relative cursor-pointer border border-border/70 bg-card hover:bg-muted/30 hover:border-primary/40 transition-colors p-3.5 shadow-none rounded-xl"
              >
                <div className="flex items-center justify-between gap-3">
                  {/* Left: Process icon & Details */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 group-hover:scale-105 transition-transform overflow-hidden p-1.5">
                      <ProcessIcon
                        processPath={group.path}
                        processName={group.name}
                        className="size-5.5"
                        fallbackClassName="size-5"
                      />
                    </div>

                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {group.name}
                        </span>
                        <Badge className="min-w-5 h-5 justify-center px-1.5 leading-none text-[11px] font-semibold bg-primary text-primary-foreground border-0 rounded-full">
                          {group.activeCount}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground truncate">
                        <span className="font-mono text-[11px] truncate text-muted-foreground/80">
                          {group.path || group.name}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Traffic totals & Chevron */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex flex-col items-end text-right font-mono text-[11px] leading-tight">
                      <TrafficValue value={group.totalDownload} direction="download" />
                      <TrafficValue value={group.totalUpload} direction="upload" className="mt-0.5" />
                    </div>

                    <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              </Card>
            )
          })}

          {!processGroups.length && (
            <Card className="p-8 text-center flex flex-col items-center justify-center gap-3 border-dashed">
              <div className="size-12 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
                <ConnectionsIcon className="size-6" />
              </div>
              <p className="text-xs text-muted-foreground">
                {query ? t('noConnectionsMatchYourSearch') : t('noActiveConnections')}
              </p>
            </Card>
          )}
        </div>
      ) : (
        /* Flat Connections List */
        <div className="flex flex-col gap-2">
          {filteredAndSortedList.slice(0, flatLimit).map(renderConnectionCard)}

          {filteredAndSortedList.length > flatLimit && (
            <div className="flex justify-center pt-2 pb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFlatLimit((prev) => prev + 100)}
                className="gap-2 text-xs"
              >
                {t('showMore', { count: filteredAndSortedList.length - flatLimit })}
              </Button>
            </div>
          )}

          {!filteredAndSortedList.length && (
            <Card className="p-8 text-center flex flex-col items-center justify-center gap-3 border-dashed">
              <div className="size-12 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
                <ConnectionsIcon className="size-6" />
              </div>
              <p className="text-xs text-muted-foreground">
                {query ? t('noConnectionsMatchYourSearch') : t('noActiveConnections')}
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Connection Details Modal with Monospace Code Lines & Embedded Copy Buttons */}
      <Dialog open={Boolean(activeDetail)} onOpenChange={(open) => !open && setSelectedConnection(null)}>
        {activeDetail && (
          <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden rounded-2xl">
            <DialogHeader className="p-5 pb-4 bg-muted/20">
              <div className="flex items-center justify-between gap-3 pr-6">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 border border-primary/25 overflow-hidden p-1">
                    <ProcessIcon
                      processPath={activeDetail.metadata.processPath}
                      processName={extractProcessName(activeDetail.metadata.processPath) || activeDetail.metadata.process || ''}
                      className="size-6"
                      fallbackClassName="size-5"
                    />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <DialogTitle className="text-base font-semibold truncate flex items-center gap-2">
                      <span>
                        {extractProcessName(activeDetail.metadata.processPath) ||
                          activeDetail.metadata.process ||
                          t('system')}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[9px] uppercase px-1.5 py-0 ${
                          activeDetail.metadata.network.toLowerCase() === 'udp'
                            ? 'border-warning/40 text-warning bg-warning/10'
                            : 'border-primary/40 text-primary bg-primary/10'
                        }`}
                      >
                        {activeDetail.metadata.network}
                      </Badge>
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground truncate font-mono mt-0.5">
                      {activeDetail.metadata.host || activeDetail.metadata.destinationIP}:
                      {activeDetail.metadata.destinationPort}
                    </DialogDescription>
                  </div>
                </div>
              </div>
            </DialogHeader>

            <ScrollArea className="max-h-[68vh] p-5">
              <div className="flex flex-col gap-4">
                {/* Traffic Stats Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-0.5 p-3 rounded-xl bg-muted/20 border border-border/50">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <ArrowDown className="size-3 text-muted-foreground" />
                      {t('transfer')} (↓)
                    </span>
                    <TrafficValue key={`${activeDetail.id}-download`} value={activeDetail.download} direction="download" className="font-mono text-base font-bold" />
                  </div>

                  <div className="flex flex-col gap-0.5 p-3 rounded-xl bg-muted/20 border border-border/50">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <ArrowUp className="size-3 text-muted-foreground" />
                      {t('transfer')} (↑)
                    </span>
                    <TrafficValue key={`${activeDetail.id}-upload`} value={activeDetail.upload} direction="upload" className="font-mono text-base font-bold" />
                  </div>
                </div>

                {/* Destination Section */}
                <div className="rounded-xl border border-border/60 bg-muted/15 p-3.5 flex flex-col gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Globe className="size-3 text-primary" />
                    {t('destination')}
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {activeDetail.metadata.host && (
                      <div className="sm:col-span-2">
                        <CopyableCodeLine
                          label={t('host')}
                          value={activeDetail.metadata.host}
                          clashRuleOptions={[
                            { label: 'DOMAIN', value: `DOMAIN,${activeDetail.metadata.host}` },
                            ...getSubDomains(activeDetail.metadata.host).map((sub) => ({
                              label: 'DOMAIN-SUFFIX',
                              value: `DOMAIN-SUFFIX,${sub}`
                            }))
                          ]}
                        />
                      </div>
                    )}

                    {activeDetail.metadata.sniffHost && (
                      <div className="sm:col-span-2">
                        <CopyableCodeLine
                          label={t('sniffHost')}
                          value={activeDetail.metadata.sniffHost}
                          clashRuleOptions={[
                            { label: 'DOMAIN', value: `DOMAIN,${activeDetail.metadata.sniffHost}` },
                            { label: 'DOMAIN-SUFFIX', value: `DOMAIN-SUFFIX,${activeDetail.metadata.sniffHost}` }
                          ]}
                        />
                      </div>
                    )}

                    <CopyableCodeLine
                      label={t('destination')}
                      value={`${activeDetail.metadata.destinationIP}:${activeDetail.metadata.destinationPort}`}
                    />

                    <CopyableCodeLine
                      label={t('destinationIP')}
                      value={activeDetail.metadata.destinationIP}
                      clashRuleOptions={[
                        {
                          label: 'IP-CIDR',
                          value: `IP-CIDR,${activeDetail.metadata.destinationIP}${
                            isIPv6(activeDetail.metadata.destinationIP) ? '/128' : '/32'
                          }`
                        }
                      ]}
                    />

                    <CopyableCodeLine
                      label={t('destinationPort')}
                      value={activeDetail.metadata.destinationPort}
                      clashRuleOptions={[
                        { label: 'DST-PORT', value: `DST-PORT,${activeDetail.metadata.destinationPort}` }
                      ]}
                    />

                    {activeDetail.metadata.remoteDestination && (
                      <CopyableCodeLine
                        label={t('remoteDestination')}
                        value={activeDetail.metadata.remoteDestination}
                        clashRuleOptions={[
                          {
                            label: 'IP-CIDR',
                            value: `IP-CIDR,${activeDetail.metadata.remoteDestination}${
                              isIPv6(activeDetail.metadata.remoteDestination) ? '/128' : '/32'
                            }`
                          }
                        ]}
                      />
                    )}

                    {activeDetail.metadata.destinationIPASN && (
                      <CopyableCodeLine
                        label="ASN"
                        value={activeDetail.metadata.destinationIPASN}
                        clashRuleOptions={[
                          {
                            label: 'IP-ASN',
                            value: `IP-ASN,${activeDetail.metadata.destinationIPASN.split(' ')[0]}`
                          }
                        ]}
                      />
                    )}

                    {activeDetail.metadata.destinationGeoIP && activeDetail.metadata.destinationGeoIP.length > 0 && (
                      <CopyableCodeLine
                        label="GeoIP"
                        value={activeDetail.metadata.destinationGeoIP.join(', ')}
                        clashRuleOptions={activeDetail.metadata.destinationGeoIP.map((code) => ({
                          label: 'GEOIP',
                          value: `GEOIP,${code}`
                        }))}
                      />
                    )}
                  </div>
                </div>

                {/* Source & Inbound Section */}
                <div className="rounded-xl border border-border/60 bg-muted/15 p-3.5 flex flex-col gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Activity className="size-3 text-primary" />
                    {t('source')} & {t('inbound')}
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <CopyableCodeLine
                      label={t('source')}
                      value={`${activeDetail.metadata.sourceIP}:${activeDetail.metadata.sourcePort}`}
                    />

                    <CopyableCodeLine
                      label={t('sourceIP')}
                      value={activeDetail.metadata.sourceIP}
                      clashRuleOptions={[
                        {
                          label: 'SRC-IP-CIDR',
                          value: `SRC-IP-CIDR,${activeDetail.metadata.sourceIP}${
                            isIPv6(activeDetail.metadata.sourceIP) ? '/128' : '/32'
                          }`
                        }
                      ]}
                    />

                    <CopyableCodeLine
                      label={t('sourcePort')}
                      value={activeDetail.metadata.sourcePort}
                      clashRuleOptions={[
                        { label: 'SRC-PORT', value: `SRC-PORT,${activeDetail.metadata.sourcePort}` }
                      ]}
                    />

                    {activeDetail.metadata.inboundIP && (
                      <CopyableCodeLine
                        label={t('inboundIP')}
                        value={activeDetail.metadata.inboundIP}
                        clashRuleOptions={[
                          {
                            label: 'SRC-IP-CIDR',
                            value: `SRC-IP-CIDR,${activeDetail.metadata.inboundIP}${
                              isIPv6(activeDetail.metadata.inboundIP) ? '/128' : '/32'
                            }`
                          }
                        ]}
                      />
                    )}

                    {activeDetail.metadata.inboundPort && activeDetail.metadata.inboundPort !== '0' && (
                      <CopyableCodeLine
                        label={t('inboundPort')}
                        value={activeDetail.metadata.inboundPort}
                        clashRuleOptions={[
                          { label: 'SRC-PORT', value: `SRC-PORT,${activeDetail.metadata.inboundPort}` }
                        ]}
                      />
                    )}

                    {activeDetail.metadata.inboundName && (
                      <CopyableCodeLine
                        label={t('inboundName')}
                        value={activeDetail.metadata.inboundName}
                        clashRuleOptions={[
                          { label: 'IN-NAME', value: `IN-NAME,${activeDetail.metadata.inboundName}` }
                        ]}
                      />
                    )}

                    {activeDetail.metadata.inboundUser && (
                      <CopyableCodeLine
                        label={t('inboundUser')}
                        value={activeDetail.metadata.inboundUser}
                        clashRuleOptions={[
                          { label: 'IN-USER', value: `IN-USER,${activeDetail.metadata.inboundUser}` }
                        ]}
                      />
                    )}
                  </div>
                </div>

                {/* Application Section */}
                <div className="rounded-xl border border-border/60 bg-muted/15 p-3.5 flex flex-col gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <AppWindow className="size-3 text-primary" />
                    {t('processName')}
                  </span>

                  <div className="flex flex-col gap-2.5">
                    <CopyableCodeLine
                      label={t('processName')}
                      value={
                        extractProcessName(activeDetail.metadata.processPath) ||
                        activeDetail.metadata.process ||
                        t('system')
                      }
                      clashRuleOptions={[
                        {
                          label: 'PROCESS-NAME',
                          value: `PROCESS-NAME,${
                            extractProcessName(activeDetail.metadata.processPath) ||
                            activeDetail.metadata.process ||
                            ''
                          }`
                        }
                      ]}
                    />

                    {activeDetail.metadata.processPath && (
                      <CopyableCodeLine
                        label={t('processPath')}
                        value={activeDetail.metadata.processPath}
                        truncate={false}
                        clashRuleOptions={[
                          {
                            label: 'PROCESS-PATH',
                            value: `PROCESS-PATH,${activeDetail.metadata.processPath}`
                          }
                        ]}
                      />
                    )}
                  </div>
                </div>

                {/* Routing & Proxy Chain Section */}
                <div className="rounded-xl border border-border/60 bg-muted/15 p-3.5 flex flex-col gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Layers className="size-3 text-primary" />
                    {t('route')}
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <CopyableCodeLine label={t('rule')} value={activeDetail.rule} />

                    {activeDetail.rulePayload && (
                      <CopyableCodeLine label={t('rulePayload')} value={activeDetail.rulePayload} />
                    )}

                    <div className="sm:col-span-2">
                      <CopyableCodeLine
                        label={t('ruleDefinition')}
                        value={
                          activeDetail.rulePayload
                            ? `${activeDetail.rule}(${activeDetail.rulePayload})`
                            : activeDetail.rule
                        }
                      />
                    </div>

                    <div className="sm:col-span-2 flex flex-col gap-1 w-full min-w-0">
                      <span className="text-[11px] font-medium text-muted-foreground">{t('chains')}</span>
                      <div
                        className="group/chainline relative flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-border/70 bg-muted/30 text-xs text-foreground transition-all hover:border-primary/40 hover:bg-muted/50 cursor-pointer"
                        onClick={() => {
                          const chainVal = activeDetail.chains.length > 0 ? activeDetail.chains.join(' → ') : 'DIRECT'
                          handleCopy(chainVal, `chain-${activeDetail.id}`)
                        }}
                        title={activeDetail.chains.length > 0 ? activeDetail.chains.join(' → ') : 'DIRECT'}
                      >
                        <span className="select-all text-xs leading-relaxed text-foreground min-w-0 flex-1 break-words">
                          <EmojiText text={activeDetail.chains.length > 0 ? activeDetail.chains.join(' → ') : 'DIRECT'} />
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            const chainVal = activeDetail.chains.length > 0 ? activeDetail.chains.join(' → ') : 'DIRECT'
                            handleCopy(chainVal, `chain-${activeDetail.id}`)
                          }}
                          title={copiedKey === `chain-${activeDetail.id}` ? t('copied') : t('copy')}
                          aria-label={copiedKey === `chain-${activeDetail.id}` ? t('copied') : t('copy')}
                          className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/80 transition-all focus:outline-none focus:ring-1 focus:ring-primary/40"
                        >
                          {copiedKey === `chain-${activeDetail.id}` ? (
                            <Check className="size-3.5 text-success animate-in zoom-in-75 duration-150" />
                          ) : (
                            <Copy className="size-3.5 opacity-60 group-hover/chainline:opacity-100 transition-opacity" />
                          )}
                        </button>
                      </div>
                    </div>

                    <CopyableCodeLine
                      label={t('network')}
                      value={activeDetail.metadata.network.toUpperCase()}
                      clashRuleOptions={[
                        {
                          label: 'NETWORK',
                          value: `NETWORK,${activeDetail.metadata.network.toLowerCase()}`
                        }
                      ]}
                    />

                    <CopyableCodeLine
                      label={t('type')}
                      value={activeDetail.metadata.type || 'Direct'}
                    />
                  </div>
                </div>

                {/* System & Metadata Section */}
                <div className="rounded-xl border border-border/60 bg-muted/15 p-3.5 flex flex-col gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Clock className="size-3 text-primary" />
                    {t('connectionId')} & {t('duration')}
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="sm:col-span-2">
                      <CopyableCodeLine
                        label={t('connectionId')}
                        value={activeDetail.id}
                        truncate={false}
                      />
                    </div>

                    {activeDetail.metadata.dnsMode && (
                      <CopyableCodeLine
                        label={t('dnsMode')}
                        value={activeDetail.metadata.dnsMode}
                      />
                    )}

                    <CopyableCodeLine
                      label={t('startTime')}
                      value={new Date(activeDetail.start).toLocaleTimeString(locale, { hour12: false })}
                    />

                    <CopyableCodeLine
                      label={t('duration')}
                      value={formatDuration(Math.max(0, Date.now() - new Date(activeDetail.start).getTime()))}
                    />
                  </div>
                </div>
              </div>
            </ScrollArea>

            <DialogFooter className="p-4 bg-muted/20 flex flex-row items-center justify-between">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => close(activeDetail.id)}
                disabled={closing}
                className="gap-1.5 text-xs"
              >
                <DisconnectIcon className="size-3.5" />
                <span>{t('closeConnection', { host: '' })}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedConnection(null)}
                className="text-xs"
              >
                {common('close')}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Page>
  )
}
