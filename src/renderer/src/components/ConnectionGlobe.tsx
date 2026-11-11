import { useGlobeRenderer } from '../hooks/useGlobeRenderer'
import { measureGlobeLabel } from '../lib/globe-palette'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'

import { useTranslations } from '../i18n'
import { EmojiText } from './EmojiText'
import type { GlobeRoute } from '../lib/globe'
import { groupProjectedEndpoints, layoutEndpointLabels, type ProjectedRoute } from '../lib/cobe-globe'

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

  const routesContainerRef = useRef<HTMLDivElement>(null)
  const [hasScroll, setHasScroll] = useState(false)

  useLayoutEffect(() => {
    const el = routesContainerRef.current
    if (!el) return
    const checkScroll = () => {
      const scrollable = el.scrollHeight > el.clientHeight + 1
      setHasScroll((prev) => prev !== scrollable ? scrollable : prev)
    }
    checkScroll()
    const ro = new ResizeObserver(checkScroll)
    ro.observe(el)
    return () => ro.disconnect()
  }, [routes.length, pendingNodes.length])

  const linkedIds = useMemo(
    () => getLinkedRouteIds(activeId, projected),
    [activeId, projected]
  )
  const isGroupActive = linkedIds.length >= 2
  const containsActive = (ids: string[]) => linkedIds.some((id) => ids.includes(id))

  // Sort is stable: based on endpoint depth and id, never on active state to prevent DOM re-parenting
  const orderedRoutes = useMemo(
    () => [...projected].sort((a, b) => (a.endpoint?.depth ?? 0) - (b.endpoint?.depth ?? 0) || a.id.localeCompare(b.id)),
    [projected]
  )
  const endpoints = useMemo(
    () => groupProjectedEndpoints(projected).sort((a, b) => a.point.depth - b.point.depth || a.id.localeCompare(b.id)),
    [projected]
  )
  const family = sceneRef.current ? getComputedStyle(sceneRef.current).fontFamily : 'sans-serif'
  const labels = layoutEndpointLabels(endpoints, viewport.current, activeId, text => measureGlobeLabel(text, family))
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
        <svg className="globe-route-layer" width="100%" height="100%" aria-label={t('networkMap')}>
          {/* Base route lines with stable ordering (never re-ordered on hover to keep other animations flowing) */}
          {orderedRoutes.map((route) => {
            return (
              <g key={route.id} className="globe-route-group cursor-pointer">
                {/* Solid curve drawing gracefully from origin to endpoint */}
                <path
                  d={route.path}
                  pathLength={100}
                  className={`globe-route-track ${route.connecting ? 'is-connecting' : ''}`}
                  style={{ stroke: route.color }}
                />
                {/* Flowing dashed path that fades in once route is established */}
                <path
                  d={route.path}
                  pathLength={100}
                  className={`globe-route-dash ${route.connecting ? 'is-connecting' : ''}`}
                  style={{ stroke: route.color }}
                />
                {/* Broad hit line for hovering and click-to-pin */}
                <path
                  d={route.path}
                  className="globe-route-hit"
                  aria-label={routes.filter((item) => route.routeIds.includes(item.id)).map((item) => item.node).join(', ')}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerEnter={() => previewRoute(route.id)}
                  onPointerLeave={() => setHovered(null)}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleEndpoint(route.routeIds)
                  }}
                />
              </g>
            )
          })}

          {/* Active / hovered route overlay: drawn on top with fresh animation only for hovered route */}
          {orderedRoutes
            .filter((route) => containsActive(route.routeIds))
            .map((route) => {
              const strokeColor = isGroupActive ? 'var(--warning)' : route.color
              return (
                <g key={`active-top-${route.id}`} className="globe-route-group pointer-events-none">
                  <path
                    d={route.path}
                    pathLength={100}
                    className={`globe-route-glow ${isGroupActive ? 'is-group-active' : ''}`}
                    style={{ stroke: strokeColor }}
                  />
                  <path
                    d={route.path}
                    pathLength={100}
                    className="globe-route-track is-active"
                    style={{ stroke: strokeColor }}
                  />
                  <path
                    d={route.path}
                    pathLength={100}
                    className={`globe-route-dash is-active ${isGroupActive ? 'is-group-active' : ''}`}
                    style={{ stroke: strokeColor }}
                  />
                </g>
              )
            })}

          {/* Shared origins are painted once. */}
          {projected.filter((route, index, all) => route.originPoint?.visible &&
            all.findIndex((other) => other.originPoint?.visible &&
              Math.hypot(other.originPoint.x - route.originPoint!.x, other.originPoint.y - route.originPoint!.y) < 1) === index
          ).map((route) => (
            <circle key={`origin-${route.id}`} cx={route.originPoint!.x} cy={route.originPoint!.y}
              r={2.5} className="globe-route-origin">
              <title>{routes.find((item) => item.id === route.id)?.fromLabel}</title>
            </circle>
          ))}

          {labels.map(({ endpoint, x, y, width, height }) =>
            (Math.abs(y + height / 2 - endpoint.point.y) > 1 || x < endpoint.point.x) && (
              <path key={`leader-${endpoint.id}`}
                d={`M${endpoint.point.x},${endpoint.point.y} L${x > endpoint.point.x ? x : x + width},${y + height / 2}`}
                className="globe-label-leader" style={{ stroke: endpoint.color }} />
            )
          )}

          {endpoints.map((endpoint) => {
            const isActive = containsActive(endpoint.routeIds)
            const isPinned = expandedId !== null && endpoint.routeIds.includes(expandedId)
            const markerColor = isActive && isGroupActive ? 'var(--warning)' : endpoint.color
            return (
              <g key={endpoint.id} className="globe-endpoint-group cursor-pointer"
                onPointerDown={(event) => event.stopPropagation()}
                onPointerEnter={() => previewRoute(endpoint.routeIds[0])}
                onPointerLeave={() => setHovered(null)}
                onClick={(event) => { event.stopPropagation(); toggleEndpoint(endpoint.routeIds) }}>
                <title>{routes.filter((route) => endpoint.routeIds.includes(route.id)).map((route) => route.node).join('\n')}</title>
                {isActive && <circle cx={endpoint.point.x} cy={endpoint.point.y} r={isPinned ? 10 : 8}
                  className="globe-route-pulse" style={{ stroke: markerColor }} />}
                <circle cx={endpoint.point.x} cy={endpoint.point.y}
                  r={isActive ? 5 : endpoint.routeIds.length > 1 ? 4.5 : 3.5}
                  className="globe-route-endpoint" style={{ fill: markerColor }} />
              </g>
            )
          })}

          {/* Labels are the final SVG layer; near and selected locations paint last. */}
          {labels.map(({ endpoint, text, x, y, height }) => {
            const isActive = containsActive(endpoint.routeIds)
            return (
              <g key={`label-${endpoint.id}`} className="globe-endpoint-label"
                role="button" tabIndex={0} aria-label={text}
                onFocus={() => previewRoute(endpoint.routeIds[0])}
                onBlur={() => setHovered(null)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault(); event.stopPropagation(); toggleEndpoint(endpoint.routeIds)
                  }
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerEnter={() => previewRoute(endpoint.routeIds[0])}
                onPointerLeave={() => setHovered(null)}
                onClick={(event) => { event.stopPropagation(); toggleEndpoint(endpoint.routeIds) }}>
                <title>{routes.filter((route) => endpoint.routeIds.includes(route.id)).map((route) => route.node).join('\n')}</title>
                <text x={x + 3} y={y + height / 2} dominantBaseline="central"
                  className={`globe-endpoint-text ${isActive ? 'is-active' : ''} ${isActive && isGroupActive ? 'is-group-active' : ''}`}
                  >{text}</text>
              </g>
            )
          })}
        </svg>
        {unavailable && <p className="globe-unavailable" role="status">{t('globeUnavailable')}</p>}
      </div>

      <div className="globe-footer">
        {(routes.length > 0 || (running && pendingNodes.length > 0)) && (
          <div
            ref={routesContainerRef}
            className={`globe-routes ${hasScroll ? 'has-scroll' : ''}`}
          >
            {routes.map((route) => {
              const isSelected = linkedIds.includes(route.id)
              const isYellowGroup = isSelected && isGroupActive
              const isSingleActive = isSelected && !isGroupActive
              const dotColor = isYellowGroup
                ? 'var(--warning)'
                : (projected.find((group) => group.routeIds.includes(route.id))?.color ?? route.color)
              return (
                <button
                  type="button"
                  key={route.id}
                  onClick={() => setExpandedId((current) => current === route.id ? null : route.id)}
                  onMouseEnter={() => previewRoute(route.id)}
                  onMouseLeave={() => setHovered(null)}
                  className={`globe-route-summary ${isYellowGroup ? 'is-group-active' : isSingleActive ? 'is-active' : ''}`}
                  aria-pressed={expandedId === route.id}
                  title={`${route.fromLabel} → ${route.toLabel}\n${route.node}`}
                >
                  <span
                    className="globe-route-dot"
                    style={{ backgroundColor: dotColor }}
                    aria-hidden="true"
                  />
                  <span className="globe-route-name"><EmojiText text={route.node} /></span>
                  {route.delay !== undefined && route.delay > 0 && (
                    <span className="globe-route-latency">{t('latency', { value: route.delay })}</span>
                  )}
                </button>
              )
            })}
            {running && pendingNodes.map((node) => (
              <span className="globe-pending-node" key={node}>
                <EmojiText text={node} />
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
