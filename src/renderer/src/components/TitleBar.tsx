import { memo, type CSSProperties } from 'react'
import { Minus, Square, X } from 'lucide-react'
import { useTranslations } from '../i18n'
import druse from '../assets/brand/druse.svg'

// Keep this surface opaque and in normal document flow. A backdrop filter
// creates a separate compositor layer which can lag during live Windows resize.
export const TitleBar = memo(function TitleBar() {
  const isWindows = window.api?.platform === 'win32'
  const common = useTranslations('common')

  return (
    <div className="app-titlebar flex items-center justify-between">
      <div className="app-titlebar-content flex-1" style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
        <img src={druse} alt="" className="size-5 shrink-0 object-contain" draggable={false} />
        <span className="text-xs font-semibold tracking-wide">
          Qzyrium <span className="text-muted-foreground font-normal">- clash</span>
        </span>
      </div>
      {!isWindows && (
        <div className="flex items-center h-full shrink-0" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          <button
            type="button"
            onClick={() => window.api?.window.minimize()}
            className="inline-flex h-full w-10 items-center justify-center text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            aria-label={common('minimize')}
          >
            <Minus className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => window.api?.window.maximize()}
            className="inline-flex h-full w-10 items-center justify-center text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            aria-label={common('maximize')}
          >
            <Square className="size-3" />
          </button>
          <button
            type="button"
            onClick={() => window.api?.window.close()}
            className="inline-flex h-full w-10 items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
            aria-label={common('close')}
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
})
