import type { CSSProperties } from 'react'
import druse from '../assets/brand/druse.svg'

// Keep this surface opaque and in normal document flow. A backdrop filter
// creates a separate compositor layer which can lag during live Windows resize.
export function TitleBar() {
  return <div className="app-titlebar">
    <div className="app-titlebar-content" style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
      <img src={druse} alt="" className="size-5 shrink-0 object-contain" draggable={false} />
      <span className="text-xs font-semibold tracking-wide">Qzyrium <span className="text-muted-foreground font-normal">- clash</span></span>
    </div>
  </div>
}
