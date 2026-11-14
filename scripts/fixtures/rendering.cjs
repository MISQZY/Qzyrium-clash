const policy = require('../../src/shared/rendering-policy.json')

function renderingSwitches(platform, lowMemoryMode = false, angle = process.env.UI_ANGLE) {
  if (angle && !['d3d11-warp', 'swiftshader'].includes(angle)) throw new Error(`Unsupported test ANGLE backend: ${angle}`)
  return [...policy.common, ...(platform === 'win32' ? policy.win32 : []),
    ...(platform === 'win32' && lowMemoryMode ? policy.compact : []),
    // Hosted runners have no supported GPU. Exercise the compositing pipeline
    // through a validated software driver without disabling GPU compositing.
    ...(angle ? [['use-gl', 'angle'], ['use-angle', angle], ['ignore-gpu-blocklist']] : [])]
}

module.exports = { renderingSwitches }
