const assert = require('node:assert/strict')
const { loadTypeScript } = require('./fixtures/typescript.cjs')
const geometry = loadTypeScript('src/renderer/src/lib/cobe-globe.ts')

const slots = [], effects = []
let cursor = 0, dirty = false, projections = 0, surface
const react = {
  useRef(initial) {
    const index = cursor++
    if (!slots[index]) {
      slots[index] = { current: initial }
      if (initial === undefined) surface = slots[index]
    }
    return slots[index]
  },
  useState(initial) {
    const index = cursor++
    slots[index] ??= { value: initial }
    return [slots[index].value, value => {
      if (!Object.is(slots[index].value, value)) { slots[index].value = value; dirty = true }
    }]
  },
  useMemo(fn, deps) {
    const index = cursor++
    if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index].deps[i]))) slots[index] = { value: fn(), deps }
    return slots[index].value
  },
  useEffect(fn, deps) {
    const index = cursor++
    if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index].deps[i]))) {
      const previous = slots[index]
      slots[index] = { deps }
      effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn() })
    }
  }
}
const { useGlobeRenderer } = loadTypeScript('src/renderer/src/hooks/useGlobeRenderer.ts', {
  react,
  '../lib/canvas-globe': {},
  '../lib/globe-palette': {},
  '../lib/cobe-globe': { ...geometry, projectRoutes: (...args) => { projections++; return geometry.projectRoutes(...args) } }
})
function render(routes) {
  for (let attempt = 0; attempt < 5; attempt++) {
    cursor = 0; dirty = false
    const view = useGlobeRenderer(true, routes)
    surface.current ??= new Float32Array()
    view.viewport.current = { width: 800, height: 600, reserved: 0 }
    while (effects.length) effects.shift()()
    if (!dirty) return view
  }
  throw Error('Unbounded hook renders')
}
const route = { id: 'node', from: [37.62, 55.75], to: [4.9, 52.37], node: 'Proxy', color: '#00ff00', country: 'NL', connecting: true }
const first = render([route])
assert.equal(projections, 1)
const statistics = render([{ ...route, delay: 42, connectionCount: 100 }])
assert.equal(projections, 1, 'latency and counters do not reproject the sphere')
assert.equal(statistics.projected[0].endpoint, first.projected[0].endpoint, 'projected coordinates are reused')
const metadata = render([{ ...route, color: '#ff0000', country: 'Netherlands', connecting: false }])
assert.equal(projections, 1, 'route styling and labels do not reproject geometry')
assert.equal(metadata.projected[0].color, '#ff0000')
assert.equal(metadata.projected[0].country, 'Netherlands')
assert.equal(metadata.projected[0].connecting, false)
assert.equal(metadata.projected[0].path, first.projected[0].path)
render([{ ...route, to: [13.4, 52.5] }])
assert.equal(projections, 2, 'changed coordinates invalidate the projection')
const removed = render([])
assert.equal(projections, 3)
assert.deepEqual(removed.projected, [])
console.log('PASS: globe geometry is reused for statistics and metadata; coordinates and removed routes invalidate projection')
