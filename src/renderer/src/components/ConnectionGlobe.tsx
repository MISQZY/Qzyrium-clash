import { useEffect, useRef, useState } from 'react'
import createGlobe, { type Globe } from '../lib/canvas-globe'
import { useTranslations } from '../i18n'
import { EmojiText } from './EmojiText'
import type { GlobeRoute } from '../lib/globe'
import { defaultCamera, globeLayout, projectRoutes, groupProjectedEndpoints, layoutEndpointLabels, type ProjectedRoute, type Viewport } from '../lib/cobe-globe'

let cachedCanvas: HTMLCanvasElement | null = null
let cachedCtx: CanvasRenderingContext2D | null = null

function getCssColorRgb(cssVar: string, fallback: [number, number, number]): [number, number, number] {
  if (typeof document === 'undefined') return fallback
  try {
    const val = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim()
    if (!val) return fallback
    if (!cachedCanvas) {
      cachedCanvas = document.createElement('canvas')
      cachedCanvas.width = 1
      cachedCanvas.height = 1
      cachedCtx = cachedCanvas.getContext('2d', { willReadFrequently: true })
    }
    if (!cachedCtx) return fallback
    cachedCtx.fillStyle = '#000000'
    cachedCtx.fillStyle = val
    cachedCtx.fillRect(0, 0, 1, 1)
    const data = cachedCtx.getImageData(0, 0, 1, 1).data
    return [Number((data[0] / 255).toFixed(3)), Number((data[1] / 255).toFixed(3)), Number((data[2] / 255).toFixed(3))]
  } catch {
    return fallback
  }
}

const DORMANT_COLOR_DARK: [number, number, number] = [0.72, 0.74, 0.78]
const DORMANT_COLOR_LIGHT: [number, number, number] = [0.62, 0.65, 0.68]
const IGNITION_DURATION = 950

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
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)

  // Camera orientation is maintained permanently; user rotations are never overridden by routes or tunnels.
  const camera = useRef(defaultCamera())
  const viewport = useRef<Viewport>({ width: 1, height: 1, reserved: 0 })
  const routesRef = useRef(routes)
  routesRef.current = routes
  const runningRef = useRef(running)
  runningRef.current = running
  const prevRunning = useRef(running)
  const ignitionStart = useRef(0)
  const invalidate = useRef(() => {})
  const drag = useRef<{ x: number; y: number } | null>(null)

  const [hovered, setHovered] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [projected, setProjected] = useState<ProjectedRoute[]>([])
  const [unavailable, setUnavailable] = useState(false)

  // Detect running transition to trigger smooth 950ms globe ignition light-up
  useEffect(() => {
    if (running && !prevRunning.current) {
      ignitionStart.current = performance.now()
    } else if (!running) {
      ignitionStart.current = 0
    }
    prevRunning.current = running
    invalidate.current()
  }, [running])

  // Active selection: hovered takes precedence for instant preview, then expanded
  const activeId = hovered || expandedId

  const geometryKey = JSON.stringify(routes.map(({ id, from, to }) => [id, from, to]))

  useEffect(() => {
    const host = hostRef.current
    const scene = sceneRef.current
    if (!host || !scene) return
    const canvas = document.createElement('canvas')
    canvas.className = 'globe-canvas'
    canvas.setAttribute('aria-hidden', 'true')
    host.append(canvas)

    let globe: Globe | undefined, rAfId: number | null = null, disposed = false, frames = 0
    let sizedWidth = 0, sizedHeight = 0, lastTheme = ''
    let lastPhi = -999, lastTheta = -999, lastScale = -999
    let lastColor: [number, number, number] | null = null
    let lastBrightness = -1
    let cachedActiveColor: [number, number, number] | null = null

    const draw = () => {
      rAfId = null
      if (disposed || !globe) return
      const view = viewport.current
      if (view.width < 2 || view.height < 2) return
      const layout = globeLayout(camera.current, view)
      const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      const palette = `${theme}:${document.documentElement.dataset.theme}:${document.documentElement.style.getPropertyValue('--primary')}`
      const resized = sizedWidth !== view.width || sizedHeight !== view.height
      const cameraChanged = Math.abs(lastPhi - camera.current.phi) > 0.0001 || Math.abs(lastTheta - camera.current.theta) > 0.0001 || Math.abs(lastScale - layout.scale) > 0.0001
      const themeChanged = lastTheme !== palette

      // Determine colors and brightness based on running state and smooth ignition transition
      const dormantColor: [number, number, number] = theme === 'dark' ? DORMANT_COLOR_DARK : DORMANT_COLOR_LIGHT
      if (themeChanged || !cachedActiveColor) {
        cachedActiveColor = getCssColorRgb('--primary', theme === 'dark' ? [0.42, 0.65, 0.5] : [0.78, 0.88, 0.8])
      }
      const activeColor = cachedActiveColor

      let targetColor: [number, number, number]
      let targetBrightness: number

      const isCurrentRunning = runningRef.current
      if (!isCurrentRunning) {
        // Disconnected: clean neutral white-gray (standard dark theme)
        targetColor = dormantColor
        targetBrightness = theme === 'dark' ? 1.7 : 0.75
      } else {
        const elapsed = performance.now() - ignitionStart.current
        if (ignitionStart.current > 0 && elapsed < IGNITION_DURATION) {
          // Smooth 950ms ignition wave: transitions color and flares brightness softly before settling
          const p = Math.min(1, elapsed / IGNITION_DURATION)
          const ease = 1 - Math.pow(1 - p, 3)
          targetColor = [
            Number((dormantColor[0] + (activeColor[0] - dormantColor[0]) * ease).toFixed(3)),
            Number((dormantColor[1] + (activeColor[1] - dormantColor[1]) * ease).toFixed(3)),
            Number((dormantColor[2] + (activeColor[2] - dormantColor[2]) * ease).toFixed(3))
          ]
          const flare = Math.sin(p * Math.PI) * 1.4
          targetBrightness = (theme === 'dark' ? 2.6 : 0.85) + flare
          schedule()
        } else {
          targetColor = activeColor
          targetBrightness = theme === 'dark' ? 2.6 : 0.85
        }
      }

      const colorChanged = !lastColor ||
        Math.hypot(lastColor[0] - targetColor[0], lastColor[1] - targetColor[1], lastColor[2] - targetColor[2]) > 0.005 ||
        Math.abs(lastBrightness - targetBrightness) > 0.02

      if (frames < 4 || resized || cameraChanged || themeChanged || colorChanged) {
        globe.update({
          phi: camera.current.phi,
          theta: camera.current.theta,
          scale: layout.scale,
          offset: layout.offset,
          baseColor: targetColor,
          mapBrightness: targetBrightness,
          dark: theme === 'dark' ? 0.94 : 0.1,
          ...(resized || frames < 4 ? { width: view.width, height: view.height } : {})
        })
        sizedWidth = view.width
        sizedHeight = view.height
        lastTheme = palette
        lastPhi = camera.current.phi
        lastTheta = camera.current.theta
        lastScale = layout.scale
        lastColor = targetColor
        lastBrightness = targetBrightness

        canvas.style.clipPath = `circle(${layout.radius}px at ${layout.cx}px ${layout.cy}px)`
        scene.style.setProperty('--globe-cx', `${layout.cx}px`)
        scene.style.setProperty('--globe-cy', `${layout.cy}px`)
        scene.style.setProperty('--globe-radius', `${layout.radius}px`)
        canvas.dataset.globeReady = 'true'
        canvas.dataset.frameCount = String(++frames)
      }

      if (frames < 4 || resized || cameraChanged) {
        setProjected(projectRoutes(routesRef.current, camera.current, view))
      }
    }

    const schedule = () => {
      if (!disposed && rAfId === null) {
        rAfId = requestAnimationFrame(draw)
      }
    }
    invalidate.current = schedule


    try {
      const initialTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      const initialDormant: [number, number, number] = initialTheme === 'dark' ? DORMANT_COLOR_DARK : DORMANT_COLOR_LIGHT
      const initialActive = getCssColorRgb('--primary', initialTheme === 'dark' ? [0.48, 0.74, 0.57] : [0.78, 0.88, 0.8])
      const initialColor = running ? initialActive : initialDormant
      const initialBrightness = running ? (initialTheme === 'dark' ? 2.6 : 0.85) : (initialTheme === 'dark' ? 1.7 : 0.75)

      globe = createGlobe(canvas, {
        width: 1, height: 1, offset: [0, 0],
        phi: camera.current.phi, theta: camera.current.theta, scale: camera.current.scale,
        dark: initialTheme === 'dark' ? 0.94 : 0.1,
        mapBrightness: initialBrightness,
        baseColor: initialColor
      })
      lastColor = initialColor
      lastBrightness = initialBrightness
      setUnavailable(false)
    } catch { setUnavailable(true) }

    const measure = (width: number, height: number) => {
      const reserved = parseFloat(getComputedStyle(scene).getPropertyValue('--overview-reserved')) || 0
      width = Math.round(width); height = Math.round(height)
      if (viewport.current.width === width && viewport.current.height === height && viewport.current.reserved === reserved) return
      viewport.current = { width, height, reserved }
      if (rAfId !== null) cancelAnimationFrame(rAfId)
      rAfId = null
      draw()
    }
    const resize = new ResizeObserver(([entry]) => measure(entry.contentRect.width, entry.contentRect.height))
    resize.observe(scene)
    const bounds = scene.getBoundingClientRect()
    measure(bounds.width, bounds.height)

    void document.fonts.ready.then(schedule)
    const t1 = setTimeout(schedule, 40)
    const t2 = setTimeout(schedule, 120)
    const t3 = setTimeout(schedule, 300)

    const theme = new MutationObserver(schedule)
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') schedule()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      disposed = true; invalidate.current = () => {}
      if (rAfId !== null) cancelAnimationFrame(rAfId)
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3)
      resize.disconnect(); theme.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      globe?.destroy()
      host.replaceChildren()
    }
  }, [])

  // When routes update, redraw SVG projection without resetting camera orientation
  useEffect(() => {
    invalidate.current()
  }, [geometryKey])

  useEffect(() => {
    if (viewport.current.width > 1 && viewport.current.height > 1) {
      setProjected(projectRoutes(routesRef.current, camera.current, viewport.current))
    }
  }, [routes])

  const containsActive = (ids: string[]) => activeId !== null && ids.includes(activeId)
  const orderedRoutes = [...projected].sort((a, b) =>
    Number(containsActive(a.routeIds)) - Number(containsActive(b.routeIds)) ||
    (a.endpoint?.depth ?? 0) - (b.endpoint?.depth ?? 0) || a.id.localeCompare(b.id))
  const endpoints = groupProjectedEndpoints(projected).sort((a, b) =>
    Number(containsActive(a.routeIds)) - Number(containsActive(b.routeIds)) ||
    a.point.depth - b.point.depth || a.id.localeCompare(b.id))
  const family = sceneRef.current ? getComputedStyle(sceneRef.current).fontFamily : 'sans-serif'
  const labels = layoutEndpointLabels(endpoints, viewport.current, activeId, (text) => {
    if (!cachedCtx) return text.length * 9
    cachedCtx.font = `700 10px ${family}`
    return cachedCtx.measureText(text).width + text.length * 0.2
  })
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
          drag.current = { x: event.clientX, y: event.clientY }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerUp={() => { drag.current = null }}
        onPointerCancel={() => { drag.current = null }}
        onLostPointerCapture={() => { drag.current = null }}
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
          {/* Route lines with graceful, progressive 1.6s draw animation */}
          {orderedRoutes.map((route) => {
            const isRouteActive = containsActive(route.routeIds)
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
                  className={`globe-route-dash ${isRouteActive ? 'is-active' : ''} ${route.connecting ? 'is-connecting' : ''}`}
                  style={{ stroke: route.color }}
                />
                {/* Broad hit line for hovering and click-to-pin */}
                <path
                  d={route.path}
                  className="globe-route-hit"
                  aria-label={routes.filter((item) => route.routeIds.includes(item.id)).map((item) => item.node).join(', ')}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerEnter={() => setHovered(route.id)}
                  onPointerLeave={() => setHovered(null)}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleEndpoint(route.routeIds)
                  }}
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
              r={2.5} className="globe-route-origin" />
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
            return (
              <g key={endpoint.id} className="globe-endpoint-group cursor-pointer"
                onPointerDown={(event) => event.stopPropagation()}
                onPointerEnter={() => setHovered(endpoint.routeIds[0])}
                onPointerLeave={() => setHovered(null)}
                onClick={(event) => { event.stopPropagation(); toggleEndpoint(endpoint.routeIds) }}>
                <title>{routes.filter((route) => endpoint.routeIds.includes(route.id)).map((route) => route.node).join('\n')}</title>
                {isActive && <circle cx={endpoint.point.x} cy={endpoint.point.y} r={isPinned ? 10 : 8}
                  className="globe-route-pulse" style={{ stroke: endpoint.color }} />}
                <circle cx={endpoint.point.x} cy={endpoint.point.y}
                  r={isActive ? 5 : endpoint.routeIds.length > 1 ? 4.5 : 3.5}
                  className="globe-route-endpoint" style={{ fill: endpoint.color }} />
              </g>
            )
          })}

          {/* Labels are the final SVG layer; near and selected locations paint last. */}
          {labels.map(({ endpoint, text, x, y, height }) => (
            <g key={`label-${endpoint.id}`} className="globe-endpoint-label"
              role="button" tabIndex={0} aria-label={text}
              onFocus={() => setHovered(endpoint.routeIds[0])}
              onBlur={() => setHovered(null)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault(); event.stopPropagation(); toggleEndpoint(endpoint.routeIds)
                }
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerEnter={() => setHovered(endpoint.routeIds[0])}
              onPointerLeave={() => setHovered(null)}
              onClick={(event) => { event.stopPropagation(); toggleEndpoint(endpoint.routeIds) }}>
              <title>{routes.filter((route) => endpoint.routeIds.includes(route.id)).map((route) => route.node).join('\n')}</title>
              <text x={x + 3} y={y + height / 2} dominantBaseline="central"
                className={`globe-endpoint-text ${containsActive(endpoint.routeIds) ? 'is-active' : ''}`}
                style={{ fill: endpoint.color }}>{text}</text>
            </g>
          ))}
        </svg>
        {unavailable && <p className="globe-unavailable" role="status">{t('globeUnavailable')}</p>}
      </div>

      <div className="globe-footer">
        {(routes.length > 0 || (running && pendingNodes.length > 0)) && (
          <div className="globe-routes">
            {routes.map((route) => (
              <button
                type="button"
                key={route.id}
                onClick={() => setExpandedId((current) => current === route.id ? null : route.id)}
                onMouseEnter={() => setHovered(route.id)}
                onMouseLeave={() => setHovered(null)}
                className={`globe-route-summary ${activeId === route.id ? 'is-active' : ''}`}
                aria-pressed={expandedId === route.id}
                title={route.node}
              >
                <span className="globe-route-dot" style={{ backgroundColor: projected.find((group) => group.routeIds.includes(route.id))?.color ?? route.color }} aria-hidden="true" />
                <span className="globe-route-name"><EmojiText text={route.node} /></span>
                {route.delay !== undefined && route.delay > 0 && (
                  <span className="globe-route-latency">{t('latency', { value: route.delay })}</span>
                )}
              </button>
            ))}
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
