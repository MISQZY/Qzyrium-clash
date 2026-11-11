import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslations } from '../../i18n'
import { EmojiText } from '../EmojiText'
import type { GlobeRoute } from '../../lib/globe'
import type { ProjectedRoute } from '../../lib/cobe-globe'

interface GlobeRouteListProps {
  routes: GlobeRoute[]; projected: ProjectedRoute[]; running: boolean; pendingNodes: string[]
  linkedIds: string[]; expandedId: string | null
  onPreview: (id: string) => void; onClearPreview: () => void; onSelect: (id: string) => void
}

export function GlobeRouteList({ routes, projected, running, pendingNodes, linkedIds, expandedId, onPreview, onClearPreview, onSelect }: GlobeRouteListProps) {
  const t = useTranslations('dashboard')
  const isGroupActive = linkedIds.length >= 2
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

  return (
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
                onClick={() => onSelect(route.id)}
                onMouseEnter={() => onPreview(route.id)}
                onMouseLeave={() => onClearPreview()}
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
  )
}
