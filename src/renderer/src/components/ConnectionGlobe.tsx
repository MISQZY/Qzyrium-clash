import { GlobeRouteOverlay } from './globe/GlobeRouteOverlay'
import { GlobeRouteList } from './globe/GlobeRouteList'
import { useGlobeRenderer } from '../hooks/useGlobeRenderer'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { useTranslations } from '../i18n'

import type { GlobeRoute } from '../lib/globe'
import { type ProjectedRoute } from '../lib/cobe-globe'

function getLinkedRouteIds(
  activeId: string | null,
  projected: ProjectedRoute[],
  routes: GlobeRoute[]
): string[] {
  if (!activeId) return []
  const matchingChainRoute = routes.find((r) => r.chainId === activeId || r.id === activeId)
  if (matchingChainRoute?.chainId) {
    const chainIds = routes.filter((r) => r.chainId === matchingChainRoute.chainId).map((r) => r.id)
    if (chainIds.length > 0) return chainIds
  }
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
  const { hostRef, sceneRef, camera, renderedCamera, viewport, projected, unavailable, invalidate, velocity } = useGlobeRenderer(running, routes)
  const drag = useRef<{
    x: number
    y: number
    lastTime: number
    recentMoves: { dx: number; dy: number; dt: number; time: number }[]
  } | null>(null)

  const [hovered, setHovered] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const previewRoute = (id: string) => {
    if (!drag.current) setHovered(id)
  }
  const endDrag = () => {
    if (drag.current) {
      const now = performance.now()
      const recent = drag.current.recentMoves.filter((m) => now - m.time <= 100)
      if (recent.length > 0) {
        const totalDt = recent.reduce((sum, m) => sum + m.dt, 0)
        const totalDx = recent.reduce((sum, m) => sum + m.dx, 0)
        const totalDy = recent.reduce((sum, m) => sum + m.dy, 0)
        if (totalDt > 10) {
          let vPhi = (totalDx * 0.005 / totalDt) * 1000
          let vTheta = (totalDy * 0.005 / totalDt) * 1000
          const maxV = 8.0
          const vLen = Math.hypot(vPhi, vTheta)
          if (vLen > maxV) {
            vPhi = (vPhi / vLen) * maxV
            vTheta = (vTheta / vLen) * maxV
          }
          if (vLen > 0.08) {
            velocity.current.phi = vPhi
            velocity.current.theta = vTheta
            invalidate.current()
          }
        }
      }
      drag.current = null
    }
    setHovered(null)
  }

  // Active selection: hovered takes precedence for instant preview, then expanded
  const activeId = hovered || expandedId

  const linkedIds = useMemo(
    () => getLinkedRouteIds(activeId, projected, routes),
    [activeId, projected, routes]
  )

  const [family, setFamily] = useState('sans-serif')
  useLayoutEffect(() => {
    if (sceneRef.current) {
      const computed = getComputedStyle(sceneRef.current).fontFamily
      if (computed) setFamily(computed)
    }
  }, [sceneRef])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const factor = event.ctrlKey
        ? Math.max(0.5, Math.min(1.5, 1 - event.deltaY * 0.01))
        : (event.deltaY < 0 ? 1.1 : 0.9)
      camera.current.scale = Math.max(0.8, Math.min(2, camera.current.scale * factor))
      invalidate.current()
    }
    scene.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      scene.removeEventListener('wheel', handleWheel)
    }
  }, [camera, invalidate, sceneRef])

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
          velocity.current.phi = 0
          velocity.current.theta = 0
          camera.current.phi = renderedCamera.current.phi
          camera.current.theta = renderedCamera.current.theta
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            lastTime: performance.now(),
            recentMoves: []
          }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onPointerLeave={() => setHovered(null)}
        onPointerMove={(event) => {
          if (!drag.current) return
          const now = performance.now()
          const dt = Math.max(1, now - drag.current.lastTime)
          const dx = event.clientX - drag.current.x
          const dy = event.clientY - drag.current.y
          camera.current.phi += dx * 0.005
          camera.current.theta = Math.max(-1.45, Math.min(1.45, camera.current.theta + dy * 0.005))
          drag.current.recentMoves.push({ dx, dy, dt, time: now })
          drag.current.recentMoves = drag.current.recentMoves.filter((m) => now - m.time <= 100)
          drag.current.x = event.clientX
          drag.current.y = event.clientY
          drag.current.lastTime = now
          invalidate.current()
        }}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) return
          event.preventDefault()
          velocity.current.phi = 0
          velocity.current.theta = 0
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') camera.current.phi += event.key === 'ArrowLeft' ? -0.15 : 0.15
          else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') camera.current.theta = Math.max(-1.45, Math.min(1.45, camera.current.theta + (event.key === 'ArrowUp' ? -0.12 : 0.12)))
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
