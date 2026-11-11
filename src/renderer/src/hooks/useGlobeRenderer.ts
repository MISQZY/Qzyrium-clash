import { useEffect, useRef, useState } from 'react'
import createGlobe, { landPoints, type Globe } from '../lib/canvas-globe'
import type { GlobeRoute } from '../lib/globe'
import { defaultCamera, globeLayout, projectRoutes, type Viewport, type ProjectedRoute } from '../lib/cobe-globe'
import { readGlobeColor, DORMANT_COLOR_DARK, DORMANT_COLOR_LIGHT } from '../lib/globe-palette'

const IGNITION_DURATION = 950

export function useGlobeRenderer(running: boolean, routes: GlobeRoute[]) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)

  // Camera orientation is maintained permanently; user rotations are never overridden by routes or tunnels.
  const camera = useRef(defaultCamera())
  const viewport = useRef<Viewport>({ width: 1, height: 1, reserved: 0 })
  const surface = useRef<Float32Array | undefined>(undefined)
  const routesRef = useRef(routes)
  routesRef.current = routes
  const runningRef = useRef(running)
  runningRef.current = running
  const prevRunning = useRef(running)
  const ignitionStart = useRef(0)
  const invalidate = useRef(() => {})
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

    const draw = () => {
      rAfId = null
      if (disposed || !globe) return
      const view = viewport.current
      if (view.width < 2 || view.height < 2) return
      const layout = globeLayout(camera.current, view)
      const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      const palette = `${theme}:${document.documentElement.dataset.theme}:${document.documentElement.style.cssText}`
      const resized = sizedWidth !== view.width || sizedHeight !== view.height || lastDpr !== window.devicePixelRatio
      const cameraChanged = Math.abs(lastPhi - camera.current.phi) > 0.0001 || Math.abs(lastTheta - camera.current.theta) > 0.0001 || Math.abs(lastScale - layout.scale) > 0.0001
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
        lastDpr = window.devicePixelRatio
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
        setProjected(surface.current ? projectRoutes(routesRef.current, camera.current, view, surface.current) : [])
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
      setProjected(projectRoutes(routesRef.current, camera.current, viewport.current, points))
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
      if (rAfId !== null) cancelAnimationFrame(rAfId)
      rAfId = null
      draw()
    }
    const resize = new ResizeObserver(([entry]) => measure(entry.contentRect.width, entry.contentRect.height))
    resize.observe(scene)
    const measureScene = () => {
      const bounds = scene.getBoundingClientRect()
      measure(bounds.width, bounds.height)
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
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      disposed = true; invalidate.current = () => {}
      if (rAfId !== null) cancelAnimationFrame(rAfId)
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3)
      resize.disconnect(); theme.disconnect()
      window.removeEventListener('resize', measureScene)
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
      setProjected(surface.current ? projectRoutes(routesRef.current, camera.current, viewport.current, surface.current) : [])
    }
  }, [routes])

  return { hostRef, sceneRef, camera, viewport, projected, unavailable, invalidate }
}
