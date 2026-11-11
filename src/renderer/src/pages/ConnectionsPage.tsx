import { ProcessIcon, getAppCategoryIcon } from '../components/ProcessIcon'
import { ConnectionDetailsDialog } from '../components/ConnectionDetailsDialog'
import { extractProcessName, formatChain, type ProcessGroup } from '../lib/connections'
import { useLocale, useTranslations } from '../i18n'
import { useState, useMemo, useCallback } from 'react'
import { Search, Copy, Check, Clock, Layers, ArrowLeft, ChevronRight, ListFilter } from 'lucide-react'
import { ConnectionsIcon, DisconnectIcon } from '../lib/icons'
import type { ConnectionItem, ConnectionsSnapshot } from '@shared/mihomo'
import { Page } from '../components/Page'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'

import { copyToClipboard } from '../lib/clipboard'

import { formatDuration } from '../lib/format'
import { EmojiText } from '../components/EmojiText'
import { TrafficValue } from '../components/TrafficValue'
import druseSvg from '../assets/brand/druse.svg'

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

  const handleCopy = useCallback(async (text: string, key: string) => {
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopiedKey(key)
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev))
      }, 1800)
    }
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
        className="group relative cursor-pointer border border-border/70 bg-card hover:bg-muted/30 hover:border-primary/40 transition-colors p-3 shadow-none rounded-xl [content-visibility:auto] [contain-intrinsic-size:auto_72px]"
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
                  <EmojiText text={formatChain(item.chains)} />
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
              aria-label={t('closeConnection')}
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
                  <div className="flex items-center gap-3 shrink-0 pl-2 pr-1">
                    <div className="flex flex-col items-end text-right font-mono text-[11px] leading-tight">
                      <TrafficValue value={group.totalDownload} direction="download" />
                      <TrafficValue value={group.totalUpload} direction="upload" className="mt-0.5" />
                    </div>

                    <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
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
      <ConnectionDetailsDialog activeDetail={activeDetail} setSelectedConnection={setSelectedConnection} handleCopy={handleCopy} copiedKey={copiedKey} closing={closing} close={close} />
    </Page>
  )
}
