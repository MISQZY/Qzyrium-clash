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

// Match COBE 2's projection and quadratic arcs. Only a few routes are projected on camera changes.
export function projectRoutes(routes: GlobeRoute[], camera: Camera, viewport: Viewport): ProjectedRoute[] {
  const { cx, cy, radius } = globeLayout(camera, viewport)
  const sinPhi = Math.sin(camera.phi), cosPhi = Math.cos(camera.phi)
  const sinTheta = Math.sin(camera.theta), cosTheta = Math.cos(camera.theta)
  const project = ([x, y, z]: Vector): ProjectedPoint => {
    const rx = cosPhi * x + sinPhi * z
    const ry = sinPhi * sinTheta * x + cosTheta * y - cosPhi * sinTheta * z
    const rz = -sinPhi * cosTheta * x + sinTheta * y + cosPhi * cosTheta * z
    return { x: cx + rx * radius / 0.8, y: cy - ry * radius / 0.8, visible: rz >= 0 || rx * rx + ry * ry >= 0.64, depth: rz }
  }
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
    const a = vector(route.from), b = vector(route.to)
    const sum = a.map((value, i) => value + b[i]) as Vector
    const length = Math.hypot(...sum)
    const up = [sinPhi * sinTheta, cosTheta, -cosPhi * sinTheta]
    // Flatter, gentler arc: peak altitude only ~3% above the globe surface (0.805 * 1.03 = 0.829)
    const rMid = length > 0.001 ? Math.max(0.825, 1.658 - 0.4025 * length) : 0.825
    const mid: Vector = length > 0.001 ? sum.map((value, i) => (value / length) * rMid + up[i] * 0.015) as Vector : [0, 0.825, 0]
    let path = '', previousVisible = false
    for (let i = 0; i <= 32; i++) {
      const t = i / 32, u = 1 - t
      const p = project(a.map((value, j) => u * u * value * 0.805 + 2 * u * t * mid[j] + t * t * b[j] * 0.805) as Vector)
      if (p.visible) path += `${previousVisible ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)} `
      previousVisible = p.visible
    }
    const originPoint = project(a.map((value) => value * 0.805) as Vector)
    const endpoint = project(b.map((value) => value * 0.805) as Vector)
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
