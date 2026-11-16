const policy = require('../../src/shared/rendering-policy.json')

function renderingSwitches(platform, lowMemoryMode = false, isolateGpu = process.env.UI_ISOLATE_GPU === '1', angle = process.env.UI_ANGLE) {
  if (angle && !['d3d11-warp', 'swiftshader'].includes(angle)) throw new Error(`Unsupported test ANGLE backend: ${angle}`)
  const winSwitches = platform === 'win32'
    ? (isolateGpu ? policy.win32.filter(([name]) => name !== 'in-process-gpu' && name !== 'disable-direct-composition') : policy.win32)
    : []
  return [...policy.common, ...winSwitches,
    ...(platform === 'win32' && lowMemoryMode ? policy.compact : []),
    // Hosted runners have no supported GPU. Exercise the compositing pipeline
    // through a validated software driver without disabling GPU compositing.
    ...(angle ? [['use-gl', 'angle'], ['use-angle', angle], ['ignore-gpu-blocklist']] : [])]
    .map(([name, value]) => [name, value])
}

module.exports = { renderingSwitches }
