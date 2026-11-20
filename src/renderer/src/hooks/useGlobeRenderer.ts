import { useEffect, useMemo, useRef, useState } from 'react'
import createGlobe, { landPoints, type Globe } from '../lib/canvas-globe'
import type { GlobeRoute } from '../lib/globe'
import { defaultCamera, getSavedCamera, saveGlobeCamera, globeLayout, projectRoutes, type Viewport, type ProjectedRoute } from '../lib/cobe-globe'
import { readGlobeColor, DORMANT_COLOR_DARK, DORMANT_COLOR_LIGHT } from '../lib/globe-palette'

const IGNITION_DURATION = 950

export function useGlobeRenderer(running: boolean, routes: GlobeRoute[]) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)

  // Camera orientation is maintained permanently; user rotations are never overridden by routes or tunnels.
  const camera = useRef(getSavedCamera())
  const renderedCamera = useRef({ ...camera.current })
  const velocity = useRef({ phi: 0, theta: 0 })
  const viewport = useRef<Viewport>({ width: 1, height: 1, reserved: 0 })
  const renderedScaleRef = useRef(camera.current.scale)
  const surface = useRef<Float32Array | undefined>(undefined)
  const routesRef = useRef(routes)
  routesRef.current = routes
  const runningRef = useRef(running)
  runningRef.current = running
  const prevRunning = useRef(running)
  const ignitionStart = useRef(0)
  const invalidate = useRef(() => {})
  const [projectedGeometry, setProjected] = useState<ProjectedRoute[]>([])
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
    let sizedWidth = 0, sizedHeight = 0, lastDpr = 0, lastTheme = ''
    let lastPhi = -999, lastTheta = -999, lastScale = -999
    let lastColor: [number, number, number] | null = null
    let lastBrightness = -1
    let cachedActiveColor: [number, number, number] | null = null
    let cachedDormantColor: [number, number, number] | null = null
    let renderedRadius = -1
    let renderedScale = -1
    let renderedPhi = -999
    let renderedTheta = -999
    let lastFrameTime = 0
    let wasVelocityActive = false

    let saveTimeout: ReturnType<typeof setTimeout> | null = null
    const scheduleSave = () => {
      if (saveTimeout !== null) clearTimeout(saveTimeout)
      saveTimeout = setTimeout(() => {
        saveTimeout = null
        saveGlobeCamera(camera.current)
      }, 250)
    }

    const flushSave = () => {
      if (saveTimeout !== null) {
        clearTimeout(saveTimeout)
        saveTimeout = null
      }
      saveGlobeCamera(camera.current)
    }

    const draw = () => {
      rAfId = null
      if (disposed || !globe) return
      const view = viewport.current
      if (view.width < 2 || view.height < 2) return
      const now = performance.now()
      const dt = lastFrameTime > 0 ? Math.min(0.1, Math.max(0.001, (now - lastFrameTime) / 1000)) : 0.016
      lastFrameTime = now

      // 1. Inertia / momentum update with exponential decay
      const v = velocity.current
      const hasVelocity = Math.abs(v.phi) > 0.001 || Math.abs(v.theta) > 0.001
      if (hasVelocity) {
        wasVelocityActive = true
        camera.current.phi += v.phi * dt
        camera.current.theta = Math.max(-1.45, Math.min(1.45, camera.current.theta + v.theta * dt))

        const friction = 3.2
        const decay = Math.exp(-dt * friction)
        v.phi *= decay
        v.theta *= decay

        if (camera.current.theta <= -1.45 || camera.current.theta >= 1.45) {
          v.theta = 0
        }
        if (Math.abs(v.phi) <= 0.001) v.phi = 0
        if (Math.abs(v.theta) <= 0.001) v.theta = 0

        schedule()
      } else if (wasVelocityActive) {
        wasVelocityActive = false
        flushSave()
      }

      // 2. Smooth camera rotation angle interpolation (LERP / exponential damping)
      if (frames < 4 || renderedPhi === -999) {
        renderedPhi = camera.current.phi
        renderedTheta = camera.current.theta
      } else {
        const phiDiff = camera.current.phi - renderedPhi
        const thetaDiff = camera.current.theta - renderedTheta
        const angleDiff = Math.hypot(phiDiff, thetaDiff)

        if (angleDiff > 0.0002) {
          const blend = 1 - Math.exp(-dt * 20)
          renderedPhi += phiDiff * blend
          renderedTheta += thetaDiff * blend
          if (Math.abs(camera.current.phi - renderedPhi) <= 0.0002) {
            renderedPhi = camera.current.phi
          }
          if (Math.abs(camera.current.theta - renderedTheta) <= 0.0002) {
            renderedTheta = camera.current.theta
          }
          schedule()
        } else {
          renderedPhi = camera.current.phi
          renderedTheta = camera.current.theta
        }
      }
      renderedCamera.current.phi = renderedPhi
      renderedCamera.current.theta = renderedTheta

      // 3. Smooth radius / scale interpolation
      const layout = globeLayout(camera.current, view)

      if (frames < 4 || renderedRadius <= 0) {
        renderedRadius = layout.radius
      } else {
        const radiusDiff = layout.radius - renderedRadius
        if (Math.abs(radiusDiff) > 0.05) {
          const blend = 1 - Math.exp(-dt * 14)
          renderedRadius += radiusDiff * blend
          if (Math.abs(layout.radius - renderedRadius) <= 0.05) {
            renderedRadius = layout.radius
          }
          schedule()
        } else {
          renderedRadius = layout.radius
        }
      }
      renderedScale = renderedRadius / (view.height * 0.4)
      renderedScaleRef.current = renderedScale
      renderedCamera.current.scale = renderedScale

      const activeRadius = renderedRadius
      const activeOffset: [number, number] = [
        (layout.cx - view.width / 2) * 2 / renderedScale,
        (layout.cy - view.height / 2) * 2 / renderedScale
      ]
      const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      const palette = `${theme}:${document.documentElement.dataset.theme}:${document.documentElement.style.cssText}`
      const resized = sizedWidth !== view.width || sizedHeight !== view.height || lastDpr !== window.devicePixelRatio
      const cameraChanged = Math.abs(lastPhi - renderedPhi) > 0.0001 || Math.abs(lastTheta - renderedTheta) > 0.0001 || Math.abs(lastScale - renderedScale) > 0.0001
      const themeChanged = lastTheme !== palette

      // Determine colors and brightness based on running state and smooth ignition transition
      if (themeChanged || !cachedActiveColor) {
        cachedActiveColor = readGlobeColor('--primary', theme === 'dark' ? [0.42, 0.65, 0.5] : [0.78, 0.88, 0.8])
        cachedDormantColor = readGlobeColor('--muted-foreground', theme === 'dark' ? DORMANT_COLOR_DARK : DORMANT_COLOR_LIGHT)
      }
      const dormantColor = cachedDormantColor!
      const activeColor = cachedActiveColor

      let targetColor: [number, number, number]
      let targetBrightness: number

      const isCurrentRunning = runningRef.current
      if (!isCurrentRunning) {
        // Neutral land remains visible against the surface in every theme.
        targetColor = dormantColor
        targetBrightness = 1.8
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
          targetBrightness = (theme === 'dark' ? 2.6 : 2.2) + flare
          schedule()
        } else {
          targetColor = activeColor
          targetBrightness = theme === 'dark' ? 2.6 : 2.2
        }
      }

      const colorChanged = !lastColor ||
        Math.hypot(lastColor[0] - targetColor[0], lastColor[1] - targetColor[1], lastColor[2] - targetColor[2]) > 0.005 ||
        Math.abs(lastBrightness - targetBrightness) > 0.02

      if (frames < 4 || resized || cameraChanged || themeChanged || colorChanged) {
        globe.update({
          phi: renderedPhi,
          theta: renderedTheta,
          scale: renderedScale,
          offset: activeOffset,
          baseColor: targetColor,
          mapBrightness: targetBrightness,
          dark: theme === 'dark' ? 0.94 : 0.1,
          ...(resized || frames < 4 ? { width: view.width, height: view.height } : {})
        })
        sizedWidth = view.width
        sizedHeight = view.height
        lastDpr = window.devicePixelRatio
        lastTheme = palette
        lastPhi = renderedPhi
        lastTheta = renderedTheta
        lastScale = renderedScale
        lastColor = targetColor
        lastBrightness = targetBrightness

        scene.style.setProperty('--globe-cx', `${layout.cx}px`)
        scene.style.setProperty('--globe-cy', `${layout.cy}px`)
        scene.style.setProperty('--globe-radius', `${activeRadius}px`)
        canvas.dataset.globeReady = 'true'
        canvas.dataset.frameCount = String(++frames)

        if (frames >= 4 && cameraChanged) {
          scheduleSave()
        }
      }

      if (frames < 4 || resized || cameraChanged) {
        setProjected(surface.current ? projectRoutes(routesRef.current, { phi: renderedPhi, theta: renderedTheta, scale: renderedScale }, view, surface.current) : [])
      }
    }

    const schedule = () => {
      if (!disposed && rAfId === null) {
        rAfId = requestAnimationFrame(draw)
      }
    }
    invalidate.current = schedule
    void landPoints().then((points) => {
      if (disposed) return
      surface.current = points
      setProjected(projectRoutes(routesRef.current, { ...renderedCamera.current }, viewport.current, points))
      schedule()
    }).catch(() => {})


    try {
      const initialTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      const initialDormant = readGlobeColor('--muted-foreground', initialTheme === 'dark' ? DORMANT_COLOR_DARK : DORMANT_COLOR_LIGHT)
      const initialActive = readGlobeColor('--primary', initialTheme === 'dark' ? [0.48, 0.74, 0.57] : [0.78, 0.88, 0.8])
      const initialColor = runningRef.current ? initialActive : initialDormant
      const initialBrightness = runningRef.current ? (initialTheme === 'dark' ? 2.6 : 2.2) : 1.8

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
      // Native resizing can deliver several layouts before one presentation.
      // Draw only the newest viewport once per animation frame.
      schedule()
    }
    const resize = new ResizeObserver(([entry]) => measure(entry.contentRect.width, entry.contentRect.height))
    resize.observe(scene)
    const measureScene = () => {
      // Use layout pixels, matching ResizeObserver and the canvas CSS dimensions.
      measure(scene.clientWidth, scene.clientHeight)
      schedule()
    }
    window.addEventListener('resize', measureScene)
    measureScene()

    void document.fonts.ready.then(schedule)
    const t1 = setTimeout(schedule, 40)
    const t2 = setTimeout(schedule, 120)
    const t3 = setTimeout(schedule, 300)

    const theme = new MutationObserver(schedule)
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') schedule()
      else flushSave()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('beforeunload', flushSave)

    return () => {
      disposed = true; invalidate.current = () => {}
      if (rAfId !== null) cancelAnimationFrame(rAfId)
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3)
      window.removeEventListener('beforeunload', flushSave)
      flushSave()
      resize.disconnect(); theme.disconnect()
      window.removeEventListener('resize', measureScene)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      globe?.destroy()
      host.replaceChildren()
    }
  }, [])

  // Latency, counters and labels do not change the spherical geometry.
  useEffect(() => {
    invalidate.current()
    if (viewport.current.width > 1 && viewport.current.height > 1) {
      setProjected(surface.current ? projectRoutes(routesRef.current, { ...renderedCamera.current }, viewport.current, surface.current) : [])
    }
  }, [geometryKey])

  const projected = useMemo(() => {
    const currentRoutes = new Map(routes.map(route => [route.id, route]))
    return projectedGeometry.flatMap(group => {
      const members = group.routeIds.flatMap(id => currentRoutes.get(id) ?? [])
      if (!members.length) return []
      return [{ ...group, color: members[0].color, country: members[0].country,
        connecting: members.every(route => route.connecting) }]
    })
  }, [projectedGeometry, routes])

  return { hostRef, sceneRef, camera, renderedCamera, viewport, projected, unavailable, invalidate, velocity }
}
