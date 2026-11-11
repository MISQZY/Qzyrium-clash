const { EventEmitter } = require('node:events')

function createIpcFixture() {
  const url = 'file:///fixture/renderer/index.html'
  const webContents = Object.assign(new EventEmitter(), {
    mainFrame: { url }, isDestroyed: () => false
  })
  const win = Object.assign(new EventEmitter(), {
    webContents, isDestroyed: () => false, isFocused: () => true
  })
  return {
    event: { sender: webContents, senderFrame: webContents.mainFrame },
    windowService: { getMainWindow: () => win, getRendererUrl: () => url }
  }
}

module.exports = { createIpcFixture }
