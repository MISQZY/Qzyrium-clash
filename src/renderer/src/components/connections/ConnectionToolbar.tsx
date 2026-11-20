import { useTranslations } from '../../i18n'
import { ArrowLeft, Pause, Play } from 'lucide-react'
import { DisconnectIcon } from '../../lib/icons'
import { Button } from '../ui/button'
import type { ConnectionActions } from '../../hooks/useConnectionActions'

interface ConnectionToolbarProps {
  selectedProcessKey: string | null
  setSelectedProcessKey: (key: string | null) => void
  connectionCount: number
  actions: Pick<ConnectionActions, 'closing' | 'close'>
  paused?: boolean
  onTogglePause?: () => void
}

export function ConnectionToolbar({
  selectedProcessKey,
  setSelectedProcessKey,
  connectionCount,
  actions,
  paused,
  onTogglePause
}: ConnectionToolbarProps) {
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

      {onTogglePause && (
        <Button
          variant={paused ? 'secondary' : 'outline'}
          size="sm"
          onClick={onTogglePause}
          className={`gap-1.5 text-xs ${paused ? 'border-amber-500/50 text-amber-600 dark:text-amber-400 font-medium' : ''}`}
          title={paused ? t('resumeLiveUpdates') : t('pauseLiveUpdates')}
          aria-label={paused ? t('resumeLiveUpdates') : t('pauseLiveUpdates')}
          aria-pressed={paused}
        >
          {paused ? <Play className="size-3.5 fill-current" /> : <Pause className="size-3.5" />}
          <span>{paused ? t('resume') : t('pause')}</span>
        </Button>
      )}

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
