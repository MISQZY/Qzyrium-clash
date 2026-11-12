import { useLocale, useTranslations } from '../i18n'

import { Copy, Check, AppWindow, Globe, Clock, Layers, ArrowDown, ArrowUp, Activity } from 'lucide-react'
import { DisconnectIcon } from '../lib/icons'
import type { ConnectionItem } from '@shared/mihomo'

import { Button } from './ui/button'

import { Badge } from './ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog'
import { CopyableCodeLine } from './CopyableCodeLine'

import { ScrollArea } from './ui/scroll-area'
import { formatDuration } from '../lib/format'
import { EmojiText } from './EmojiText'
import { TrafficValue } from './TrafficValue'
import druseSvg from '../assets/brand/druse.svg'

import { ProcessIcon } from './ProcessIcon'
import { extractProcessName, getSubDomains, formatChain, isIPv6 } from '../lib/connections'

export function ConnectionDetailsDialog({ activeDetail, setSelectedConnection, handleCopy, copiedKey, closing, close }: {
  activeDetail: ConnectionItem | null
  setSelectedConnection: (item: ConnectionItem | null) => void
  handleCopy: (text: string, key: string) => Promise<void>
  copiedKey: string | null
  closing: boolean
  close: (id?: string) => Promise<void>
}) {
  const t = useTranslations('connections')
  const common = useTranslations('common')
  const locale = useLocale()
  return (
      <Dialog open={Boolean(activeDetail)} onOpenChange={(open) => !open && setSelectedConnection(null)}>
        {activeDetail && (
          <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden rounded-2xl">
            <DialogHeader className="p-5 pb-4 border-b border-border/60 bg-muted/20">
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
                      {t('transfer')}
                    </span>
                    <TrafficValue key={`${activeDetail.id}-download`} value={activeDetail.download} direction="download" showIcon={false} className="font-mono text-base font-bold" />
                  </div>

                  <div className="flex flex-col gap-0.5 p-3 rounded-xl bg-muted/20 border border-border/50">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <ArrowUp className="size-3 text-muted-foreground" />
                      {t('transfer')}
                    </span>
                    <TrafficValue key={`${activeDetail.id}-upload`} value={activeDetail.upload} direction="upload" showIcon={false} className="font-mono text-base font-bold" />
                  </div>
                </div>

                {/* Destination Section */}
                <div className="rounded-xl border border-border/60 bg-muted/15 p-3.5 flex flex-col gap-3">
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
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
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
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
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
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
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
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
                          const chainVal = formatChain(activeDetail.chains)
                          handleCopy(chainVal, `chain-${activeDetail.id}`)
                        }}
                        title={formatChain(activeDetail.chains)}
                      >
                        <span className="select-all text-xs leading-relaxed text-foreground min-w-0 flex-1 break-words">
                          <EmojiText text={formatChain(activeDetail.chains)} />
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            const chainVal = formatChain(activeDetail.chains)
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
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
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

            <DialogFooter className="p-4 border-t border-border/60 bg-muted/20 flex flex-row items-center justify-between">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => close(activeDetail.id)}
                disabled={closing}
                className="gap-1.5 text-xs"
              >
                <DisconnectIcon className="size-3.5" />
                <span>{t('closeConnection')}</span>
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
  )
}
