import { GlobeRouteOverlay } from './globe/GlobeRouteOverlay'
import { GlobeRouteList } from './globe/GlobeRouteList'
import { useGlobeRenderer } from '../hooks/useGlobeRenderer'

import { useMemo, useRef, useState } from 'react'

import { useTranslations } from '../i18n'

import type { GlobeRoute } from '../lib/globe'
import { type ProjectedRoute } from '../lib/cobe-globe'

function getLinkedRouteIds(
  activeId: string | null,
  projected: ProjectedRoute[]
): string[] {
  if (!activeId) return []
  for (const p of projected) {
    if (p.routeIds.includes(activeId)) {
      return p.routeIds
    }
  }
  return [activeId]
}

export function ConnectionGlobe({
  running,
  routes,
  pendingNodes = []
}: {
  running: boolean
  routes: GlobeRoute[]
  pendingNodes?: string[]
}) {
  const t = useTranslations('dashboard')
  const { hostRef, sceneRef, camera, viewport, projected, unavailable, invalidate } = useGlobeRenderer(running, routes)
  const drag = useRef<{ x: number; y: number } | null>(null)

  const [hovered, setHovered] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const previewRoute = (id: string) => {
    if (!drag.current) setHovered(id)
  }
  const endDrag = () => {
    drag.current = null
    setHovered(null)
  }

  // Active selection: hovered takes precedence for instant preview, then expanded
  const activeId = hovered || expandedId

  const linkedIds = useMemo(
    () => getLinkedRouteIds(activeId, projected),
    [activeId, projected]
  )

  const family = sceneRef.current ? getComputedStyle(sceneRef.current).fontFamily : 'sans-serif'
  const toggleEndpoint = (ids: string[]) => {
    setExpandedId((current) => current !== null && ids.includes(current) ? null : ids[0])
  }

  return (
    <div className="connection-globe">
      <div
        ref={sceneRef}
        className="globe-scene"
        tabIndex={0}
        role="group"
        aria-label={t('globeDescription')}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          setHovered(null)
          drag.current = { x: event.clientX, y: event.clientY }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onPointerLeave={() => setHovered(null)}
        onPointerMove={(event) => {
          if (!drag.current) return
          camera.current.phi += (event.clientX - drag.current.x) * 0.005
          camera.current.theta = Math.max(-1.45, Math.min(1.45, camera.current.theta + (event.clientY - drag.current.y) * 0.005))
          drag.current = { x: event.clientX, y: event.clientY }
          invalidate.current()
        }}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) return
          event.preventDefault()
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') camera.current.phi += event.key === 'ArrowLeft' ? -0.12 : 0.12
          else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') camera.current.theta = Math.max(-1.45, Math.min(1.45, camera.current.theta + (event.key === 'ArrowUp' ? -0.1 : 0.1)))
          else camera.current.scale = Math.max(0.8, Math.min(2, camera.current.scale * (event.key === '-' ? 0.9 : 1.1)))
          invalidate.current()
        }}
      >
        <div className={`globe-solid-surface ${running ? 'is-running' : ''}`} aria-hidden="true" />
        <div className="globe-canvas-layer" ref={hostRef} />
        <GlobeRouteOverlay routes={routes} projected={projected} viewport={viewport.current}
          activeId={activeId} expandedId={expandedId} linkedIds={linkedIds} family={family}
          onPreview={previewRoute} onClearPreview={() => setHovered(null)} onToggleEndpoint={toggleEndpoint} />
        {unavailable && <p className="globe-unavailable" role="status">{t('globeUnavailable')}</p>}
      </div>

      <GlobeRouteList routes={routes} projected={projected} running={running} pendingNodes={pendingNodes}
        linkedIds={linkedIds} expandedId={expandedId} onPreview={previewRoute} onClearPreview={() => setHovered(null)}
        onSelect={id => setExpandedId(current => current === id ? null : id)} />
    </div>
  )
}
