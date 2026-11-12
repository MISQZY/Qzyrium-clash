const policy = require('../../src/shared/rendering-policy.json')

function renderingSwitches(platform, lowMemoryMode = false) {
  return [...policy.common, ...(platform === 'win32' ? policy.win32 : []),
    ...(platform === 'win32' && lowMemoryMode ? policy.compact : [])]
}

module.exports = { renderingSwitches }
