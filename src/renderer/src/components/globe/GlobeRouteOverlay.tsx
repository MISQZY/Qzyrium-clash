import { useMemo } from 'react'
import { useTranslations } from '../../i18n'
import type { GlobeRoute } from '../../lib/globe'
import { groupProjectedEndpoints, layoutEndpointLabels, type ProjectedRoute, type Viewport } from '../../lib/cobe-globe'
import { measureGlobeLabel } from '../../lib/globe-palette'

interface GlobeRouteOverlayProps {
  routes: GlobeRoute[]; projected: ProjectedRoute[]; viewport: Viewport
  activeId: string | null; expandedId: string | null; linkedIds: string[]; family: string
  onPreview: (id: string) => void; onClearPreview: () => void; onToggleEndpoint: (ids: string[]) => void
}

export function GlobeRouteOverlay({ routes, projected, viewport, activeId, expandedId, linkedIds, family, onPreview, onClearPreview, onToggleEndpoint }: GlobeRouteOverlayProps) {
  const t = useTranslations('dashboard')
  const isGroupActive = linkedIds.length >= 2
  const containsActive = (ids: string[]) => linkedIds.some(id => ids.includes(id))
  // Sort is stable: based on endpoint depth and id, never on active state to prevent DOM re-parenting
  const orderedRoutes = useMemo(
    () => [...projected].sort((a, b) => (a.endpoint?.depth ?? 0) - (b.endpoint?.depth ?? 0) || a.id.localeCompare(b.id)),
    [projected]
  )
  const endpoints = useMemo(
    () => groupProjectedEndpoints(projected).sort((a, b) => a.point.depth - b.point.depth || a.id.localeCompare(b.id)),
    [projected]
  )
  const labels = layoutEndpointLabels(endpoints, viewport, activeId, text => measureGlobeLabel(text, family))

  return (
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
              onPointerEnter={() => onPreview(route.id)}
              onPointerLeave={() => onClearPreview()}
              onClick={(e) => {
                e.stopPropagation()
                onToggleEndpoint(route.routeIds)
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
            onPointerEnter={() => onPreview(endpoint.routeIds[0])}
            onPointerLeave={() => onClearPreview()}
            onClick={(event) => { event.stopPropagation(); onToggleEndpoint(endpoint.routeIds) }}>
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
            onFocus={() => onPreview(endpoint.routeIds[0])}
            onBlur={() => onClearPreview()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault(); event.stopPropagation(); onToggleEndpoint(endpoint.routeIds)
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerEnter={() => onPreview(endpoint.routeIds[0])}
            onPointerLeave={() => onClearPreview()}
            onClick={(event) => { event.stopPropagation(); onToggleEndpoint(endpoint.routeIds) }}>
            <title>{routes.filter((route) => endpoint.routeIds.includes(route.id)).map((route) => route.node).join('\n')}</title>
            <text x={x + 3} y={y + height / 2} dominantBaseline="central"
              className={`globe-endpoint-text ${isActive ? 'is-active' : ''} ${isActive && isGroupActive ? 'is-group-active' : ''}`}
              >{text}</text>
          </g>
        )
      })}
    </svg>
  )
}
