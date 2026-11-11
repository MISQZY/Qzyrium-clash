import { useTranslations } from '../../i18n'

import { Layers, ArrowLeft, ListFilter } from 'lucide-react'
import { DisconnectIcon } from '../../lib/icons'

import { Button } from '../ui/button'

import type { ConnectionActions } from '../../hooks/useConnectionActions'

interface ConnectionToolbarProps {
  viewMode: 'process' | 'flat'
  selectedProcessKey: string | null
  setSelectedProcessKey: (key: string | null) => void
  setViewMode: (mode: 'process' | 'flat') => void
  connectionCount: number
  actions: Pick<ConnectionActions, 'closing' | 'close'>
}

export function ConnectionToolbar({ viewMode, selectedProcessKey, setSelectedProcessKey, setViewMode, connectionCount, actions }: ConnectionToolbarProps) {
  const t = useTranslations('connections')
  const { closing, close } = actions
  return (
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
            disabled={closing || !connectionCount}
            className="gap-1.5 text-xs"
          >
            <DisconnectIcon className="size-3.5" />
            <span>{t('closeAll')}</span>
          </Button>
        </div>
  )
}
