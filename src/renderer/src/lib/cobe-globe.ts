import type { Coordinate, GlobeRoute } from './globe'

export interface Camera { phi: number; theta: number; scale: number }
export interface Viewport { width: number; height: number; reserved: number }
export interface ProjectedPoint { x: number; y: number; visible: boolean; depth: number }
export interface ProjectedRoute {
  id: string
  routeIds: string[]
  locationKey: string
  path: string
  color: string
  country?: string
  connecting?: boolean
  originPoint?: ProjectedPoint
  endpoint?: ProjectedPoint
  endpoints: { x: number; y: number }[]
}
type Vector = [number, number, number]
const radians = Math.PI / 180
const vector = ([lon, lat]: Coordinate): Vector => [Math.cos(lat * radians) * Math.cos(lon * radians), Math.sin(lat * radians), -Math.cos(lat * radians) * Math.sin(lon * radians)]
export const defaultCamera = (): Camera => ({ phi: -1.95, theta: 0.55, scale: 1.38 })

/** Use the actual land samples, so a tunnel replaces a surface dot. */
export function surfacePoint(coordinate: Coordinate, samples?: Float32Array): Vector {
  const target = vector(coordinate)
  if (!samples?.length) return target
  let best = -Infinity, index = 0
  for (let i = 0; i < samples.length; i += 3) {
    const alignment = target[0] * samples[i] + target[1] * samples[i + 1] + target[2] * samples[i + 2]
    if (alignment > best) { best = alignment; index = i }
  }
  return [samples[index], samples[index + 1], samples[index + 2]]
}

export function globeProjection(camera: Camera, { cx, cy, radius }: { cx: number; cy: number; radius: number }) {
  const sp = Math.sin(camera.phi), cp = Math.cos(camera.phi)
  const st = Math.sin(camera.theta), ct = Math.cos(camera.theta)
  return ([x, y, z]: Vector): ProjectedPoint => {
    const rx = cp * x + sp * z
    const ry = sp * st * x + ct * y - cp * st * z
    const depth = -sp * ct * x + st * y + cp * ct * z
    return { x: cx + rx * radius, y: cy - ry * radius, visible: depth >= 0 || rx * rx + ry * ry >= 1, depth }
  }
}

export function focusConnection(from: Coordinate, to: Coordinate, viewport: Viewport): Camera {
  const a = vector(from), b = vector(to)
  const x = a[0] + b[0], y = a[1] + b[1], z = a[2] + b[2]
  // Keep the midpoint stable across the international date line; avoid NaNs at antipodes.
  if (Math.hypot(x, y, z) < 0.001) return { ...defaultCamera(), scale: 1 }
  const angle = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])))
  const visible = Math.max(120, viewport.width - viewport.reserved)
  return {
    phi: Math.atan2(-x, z), theta: Math.atan2(y, Math.hypot(x, z)),
    scale: Math.max(0.5, Math.min(1.35, visible * 0.62 / (Math.max(1, viewport.height) * 0.8 * Math.max(0.22, Math.sin(angle / 2)))))
  }
}

export function globeLayout(camera: Camera, viewport: Viewport) {
  const available = Math.max(120, viewport.width - viewport.reserved)
  const top = 50, bottom = 110
  const usableHeight = Math.max(100, viewport.height - top - bottom)
  const marginX = 52
  const fitRadius = Math.max(40, Math.min((available - marginX * 2) / 2, usableHeight / 2))
  const scale = Math.min(camera.scale, fitRadius / (viewport.height * 0.4))
  const cx = available / 2, cy = top + usableHeight / 2
  return { cx, cy, scale, radius: viewport.height * 0.4 * scale, offset: [(cx - viewport.width / 2) * 2 / scale, (cy - viewport.height / 2) * 2 / scale] as [number, number] }
}

// Surface dots and route endpoints share the same camera and unit sphere.
export function projectRoutes(routes: GlobeRoute[], camera: Camera, viewport: Viewport, samples?: Float32Array): ProjectedRoute[] {
  const project = globeProjection(camera, globeLayout(camera, viewport))
  const sinPhi = Math.sin(camera.phi), cosPhi = Math.cos(camera.phi)
  const sinTheta = Math.sin(camera.theta), cosTheta = Math.cos(camera.theta)
  // Group by geographic coordinates before projection, never by screen proximity.
  const coordinateKey = ([lon, lat]: Coordinate) => `${(((lon + 180) % 360 + 360) % 360 - 180).toFixed(3)},${lat.toFixed(3)}`
  const groups = new Map<string, GlobeRoute[]>()
  for (const route of [...routes].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = `${coordinateKey(route.from)}>${coordinateKey(route.to)}`
    const group = groups.get(key)
    if (group) group.push(route)
    else groups.set(key, [route])
  }
  return [...groups.values()].map((members) => {
    const route = members[0]
    const a = surfacePoint(route.from, samples), b = surfacePoint(route.to, samples)
    const sum = a.map((value, i) => value + b[i]) as Vector
    const length = Math.hypot(...sum)
    const up = [sinPhi * sinTheta, cosTheta, -cosPhi * sinTheta]
    // Endpoints sit exactly on the surface, with a small lift along the arc.
    const rMid = length > 0.001 ? Math.max(1.03, 2.0725 - 0.5 * length) : 1.03
    const mid: Vector = length > 0.001 ? sum.map((value, i) => (value / length) * rMid + up[i] * 0.015) as Vector : [0, 0.825, 0]
    let path = '', previousVisible = false
    for (let i = 0; i <= 32; i++) {
      const t = i / 32, u = 1 - t
      const p = project(a.map((value, j) => u * u * value + 2 * u * t * mid[j] + t * t * b[j]) as Vector)
      if (p.visible) path += `${previousVisible ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)} `
      previousVisible = p.visible
    }
    const originPoint = project(a)
    const endpoint = project(b)
    endpoint.visible = endpoint.depth >= 0
    originPoint.visible = originPoint.depth >= 0
    return {
      id: route.id,
      routeIds: members.map((member) => member.id),
      locationKey: coordinateKey(route.to),
      path,
      color: route.color,
      country: route.country,
      connecting: members.every((member) => member.connecting),
      originPoint,
      endpoint,
      endpoints: [originPoint, endpoint].filter((p) => p.visible)
    }
  })
}

export interface ProjectedEndpoint {
  id: string
  routeIds: string[]
  point: ProjectedPoint
  color: string
  country?: string
}

export function groupProjectedEndpoints(routes: ProjectedRoute[]): ProjectedEndpoint[] {
  const groups = new Map<string, ProjectedEndpoint>()
  for (const route of routes) {
    if (!route.endpoint?.visible) continue
    const existing = groups.get(route.locationKey)
    if (existing) existing.routeIds.push(...route.routeIds)
    else groups.set(route.locationKey, {
      id: route.locationKey, routeIds: [...route.routeIds], point: route.endpoint,
      color: route.color, country: route.country
    })
  }
  return [...groups.values()]
}

export interface EndpointLabel {
  endpoint: ProjectedEndpoint
  text: string
  x: number
  y: number
  width: number
  height: number
}

// Reserve full text rectangles and marker positions. Active/near-side locations
// get first choice; SVG painting uses the reverse order so they also stay on top.
export function layoutEndpointLabels(
  endpoints: ProjectedEndpoint[], viewport: Viewport, activeId: string | null,
  measureText: (text: string) => number
): EndpointLabel[] {
  const labels: EndpointLabel[] = []
  const right = Math.max(0, viewport.width - viewport.reserved) - 8
  const bottom = viewport.height - 140
  const isActive = (endpoint: ProjectedEndpoint) => activeId !== null && endpoint.routeIds.includes(activeId)
  const ordered = [...endpoints].sort((a, b) =>
    Number(isActive(b)) - Number(isActive(a)) || b.point.depth - a.point.depth || a.id.localeCompare(b.id))
  for (const endpoint of ordered) {
    if (!endpoint.country) continue
    const text = endpoint.country + (endpoint.routeIds.length > 1 ? ` · ${endpoint.routeIds.length}` : '')
    const width = Math.ceil(measureText(text)) + 6, height = 16
    let placed = false
    for (const offset of [0, -20, 20, -40, 40, -60, 60, -80, 80]) {
      for (const side of [1, -1]) {
        const x = side === 1 ? endpoint.point.x + 10 : endpoint.point.x - width - 10
        const y = endpoint.point.y - height / 2 + offset
        if (x < 8 || x + width > right || y < 8 || y + height > bottom) continue
        if (labels.some((label) => x < label.x + label.width + 5 && x + width + 5 > label.x && y < label.y + label.height + 4 && y + height + 4 > label.y)) continue
        if (endpoints.some(({ point }) => point.x + 7 > x && point.x - 7 < x + width && point.y + 7 > y && point.y - 7 < y + height)) continue
        labels.push({ endpoint, text, x, y, width, height })
        placed = true
        break
      }
      if (placed) break
    }
  }
  return labels.reverse()
}
