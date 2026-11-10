// Pure geometry checks: no Electron, network, core, or system proxy.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const code = ts.transpileModule(fs.readFileSync('src/renderer/src/lib/cobe-globe.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
const geometry = { exports: {} }
new Function('exports', code)(geometry.exports)
const { projectRoutes, groupProjectedEndpoints, layoutEndpointLabels, surfacePoint, globeProjection, globeLayout } = geometry.exports
const view = { width: 1040, height: 620, reserved: 312 }
const camera = { phi: 0, theta: 0, scale: 1 }
const route = (id, to, country = 'Netherlands', from = [0, 0]) => ({
  id, node: id, from, to, country, color: '#0ea5e9'
})
const routes = [route('b', [-90, 20]), route('a', [-90, 20]), route('c', [-80, 20])]
const grouped = projectRoutes(routes, camera, view)
assert.equal(grouped.length, 2, 'co-located tunnels share one arc')
assert.deepEqual(grouped[0].routeIds, ['a', 'b'])
assert.deepEqual(projectRoutes([...routes].reverse(), camera, view), grouped, 'input order cannot reorder groups')
const destinations = groupProjectedEndpoints(projectRoutes([...routes, route('d', [-90, 20], 'Netherlands', [20, 0])], camera, view))
assert.equal(destinations.length, 2, 'one destination marker even with different origins')
assert.deepEqual(destinations[0].routeIds, ['a', 'b', 'd'])
assert.equal(groupProjectedEndpoints(projectRoutes([route('rear', [90, 0])], camera, view)).length, 0, 'rear markers stay behind the globe')
const many = Array.from({ length: 18 }, (_, i) => route(`node-${i}`, [-90, 20]))
assert.equal(projectRoutes(many, camera, view)[0].routeIds.length, 18, 'group members are never truncated')

const endpoints = Array.from({ length: 9 }, (_, i) => ({
  id: `location-${i}`, routeIds: [`node-${i}`], color: '#0ea5e9',
  country: i % 2 ? 'United Kingdom' : 'Netherlands',
  point: { x: 290 + i * 4, y: 230 + i * 2, depth: 1 - i / 20, visible: true }
}))
const measure = (text) => text.length * 8
function checkLabels(labels, markers, viewport) {
  for (const a of labels) {
    assert.ok(a.x >= 8 && a.x + a.width <= viewport.width - viewport.reserved - 8, 'horizontal bounds')
    assert.ok(a.y >= 8 && a.y + a.height <= viewport.height - 140, 'vertical bounds leave room for the tunnel list')
    for (const b of labels) {
      if (a === b) continue
      assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, 'full label rectangles never overlap')
    }
    for (const { point } of markers) {
      assert.ok(point.x + 7 <= a.x || point.x - 7 >= a.x + a.width || point.y + 7 <= a.y || point.y - 7 >= a.y + a.height, 'labels do not cover markers')
    }
  }
}
const labels = layoutEndpointLabels(endpoints, view, 'node-8', measure)
assert.equal(labels.length, endpoints.length, 'dense cluster is laid out without dropping labels when space exists')
assert.equal(labels.at(-1).endpoint.id, 'location-8', 'selected location paints last')
checkLabels(labels, endpoints, view)
assert.deepEqual(layoutEndpointLabels([...endpoints].reverse(), view, 'node-8', measure), labels, 'layout is independent of input ordering')
const counted = layoutEndpointLabels(destinations, view, 'b', measure)
assert.ok(counted.some((label) => label.text.endsWith(' · 3')), 'group label includes tunnel count')
for (const viewport of [view, { width: 600, height: 460, reserved: 264 }]) {
  for (let phi = -3; phi <= 3; phi += 0.3) {
    const markers = groupProjectedEndpoints(projectRoutes(routes, { ...camera, phi }, viewport))
    checkLabels(layoutEndpointLabels(markers, viewport, 'b', measure), markers, viewport)
  }
}
const land = new Float32Array([0, 1, 0, 0, 0, 1, 1, 0, 0])
const snapped = surfacePoint([-88, 2], land)
assert.deepEqual(snapped, [0, 0, 1], 'endpoint selects the nearest actual sample instead of the gap between samples')
for (const viewport of [view, { width: 1920, height: 1000, reserved: 336 }]) {
  for (let phi = -3; phi <= 3; phi += 0.3) {
    const camera = { phi, theta: 0.55, scale: 1.38 }
    const projected = projectRoutes([route('snapped', [-88, 2])], camera, viewport, land)[0]
    const dot = globeProjection(camera, globeLayout(camera, viewport))(snapped)
    assert.equal(projected.endpoint.x, dot.x, 'marker and surface dot have identical horizontal coordinates')
    assert.equal(projected.endpoint.y, dot.y, 'marker and surface dot have identical vertical coordinates')
    assert.equal(projected.endpoint.visible, dot.depth >= 0, 'surface dot and marker share rear occlusion')
  }
}
console.log('PASS: surface alignment across rotations/sizes, geographic grouping, stable ordering, rear occlusion and label collisions')
