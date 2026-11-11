import { ProcessIcon } from '../ProcessIcon'

import { useTranslations } from '../../i18n'

import { ChevronRight } from 'lucide-react'

import { Card } from '../ui/card'
import { Badge } from '../ui/badge'

import { TrafficValue } from '../TrafficValue'

import type { ProcessGroup } from '../../lib/connections'

interface ProcessGroupCardProps {
  group: ProcessGroup
  onSelect: (key: string) => void
}

export function ProcessGroupCard({ group, onSelect }: ProcessGroupCardProps) {
  const t = useTranslations('connections')

  return (
(
              <Card
                key={group.key}
                onClick={() => onSelect(group.key)}
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
  )
}
