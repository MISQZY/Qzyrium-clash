const { app, BrowserWindow, contextBridge } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

if (process.type === 'renderer') {
  const expose = contextBridge.exposeInMainWorld.bind(contextBridge)
  contextBridge.exposeInMainWorld = (name, api) => {
    const original = 'rules:\n' + Array.from({ length: 400 }, (_, i) => `  - DOMAIN,service-${i}.example.com,DIRECT`).join('\n')
    api.mihomo.getConfigPreview = async () => ({
      profileName: 'Long subscription name '.repeat(30), original,
      effective: original.replaceAll('DIRECT', 'PROXY')
    })
    expose(name, api)
  }
  require('./verify-ui.cjs')
} else {
  const assert = require('node:assert/strict')
  const output = path.resolve('artifacts/config-preview-ui')
  fs.mkdirSync(output, { recursive: true })
  app.setPath('userData', path.join(output, 'user-data'))
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, width: 1100, height: 760, webPreferences: {
      preload: __filename, sandbox: false, contextIsolation: true, backgroundThrottling: false
    } })
    const evaluate = code => win.webContents.executeJavaScript(code)
    const waitFor = async code => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(code)) return
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      throw new Error(`Timed out: ${code}`)
    }
    try {
      await win.loadFile(path.resolve('out/renderer/index.html'))
      await waitFor(`!!document.querySelector('nav [aria-label="Settings"]')`)
      await evaluate(`document.querySelector('nav [aria-label="Settings"]').click()`)
      await waitFor(`!!document.querySelector('[data-nav-target="mihomo"]')`)
      await evaluate(`document.querySelector('[data-nav-target="mihomo"]').click()`)
      await waitFor(`Array.from(document.querySelectorAll('button')).some(button => button.textContent.includes('Preview final configuration') && !button.disabled)`)
      await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Preview final configuration')).click()`)
      await waitFor(`!!document.querySelector('[data-config-preview="yaml"] .cm-editor')`)
      const toggle = label => evaluate(`Array.from(document.querySelectorAll('[role="dialog"] label')).find(label => label.textContent.includes(${JSON.stringify(label)})).querySelector('[role="switch"]').click()`)
      await toggle('Show changes')
      await waitFor(`document.querySelectorAll('[data-config-preview="diff"] .cm-editor').length === 2`)
      for (const dark of [false, true]) {
        await evaluate(`document.documentElement.classList.toggle('dark', ${dark})`)
        const expectedLineColor = dark ? 'rgba(244, 63, 94, 0.16)' : 'rgba(239, 68, 68, 0.12)'
        await waitFor(`getComputedStyle(document.querySelector('.cm-merge-a .cm-changedLine')).backgroundColor === ${JSON.stringify(expectedLineColor)}`)
        await waitFor(`!!document.querySelector('.cm-merge-a .cm-changedText')`)
        const highlights = await evaluate(`Array.from(document.querySelectorAll('.cm-mergeView .cm-changedText')).map(node => {
          const style = getComputedStyle(node)
          return { text: node.textContent, image: style.backgroundImage, color: style.backgroundColor, decoration: style.textDecorationLine }
        })`)
        assert.ok(highlights.length > 0)
        assert.ok(highlights.every(mark => ['DIRECT', 'PROXY'].includes(mark.text)), 'Only changed values receive strong highlighting')
        assert.ok(highlights.every(mark => mark.image === 'none' && mark.decoration === 'none' && mark.color !== 'rgba(0, 0, 0, 0)'), 'Changes use solid backgrounds without underline gradients')
        const lineColors = await evaluate(`['a','b'].map(side => getComputedStyle(document.querySelector('.cm-merge-' + side + ' .cm-changedLine')).backgroundColor)`)
        assert.notEqual(lineColors[0], lineColors[1], 'Original and modified lines have distinct colors')
      }
      for (const [width, height, zoom] of [[1100, 760, 1], [840, 600, 1], [1100, 760, 1.5]]) {
        win.setSize(width, height)
        win.webContents.setZoomFactor(zoom)
        await new Promise(resolve => setTimeout(resolve, 200))
        const layout = await evaluate(`(() => {
          const dialog = document.querySelector('[role="dialog"]').getBoundingClientRect()
          const merge = document.querySelector('.cm-mergeView')
          const box = merge.getBoundingClientRect()
          return { dialogFits: dialog.x >= 0 && dialog.right <= innerWidth + 1 && dialog.y >= 0 && dialog.bottom <= innerHeight + 1,
            editorFits: box.bottom <= dialog.bottom && box.height > 50,
            scrollable: merge.scrollHeight > merge.clientHeight && getComputedStyle(merge).overflowY === 'auto' }
        })()`)
        assert.deepEqual(layout, { dialogFits: true, editorFits: true, scrollable: true }, `${width}x${height} zoom ${zoom}`)
        await evaluate(`document.querySelector('.cm-mergeView').scrollTop = document.querySelector('.cm-mergeView').scrollHeight`)
        await waitFor(`document.querySelector('.cm-mergeView').scrollTop > 1000`)
        await waitFor(`(() => {
          const merge = document.querySelector('.cm-mergeView'); merge.scrollTop = merge.scrollHeight;
          return Array.from(merge.querySelectorAll('.cm-content')).every(pane => pane.textContent.includes('service-399'))
        })()`)
        await evaluate(`document.querySelector('.cm-mergeView').scrollTop = 0`)
      }
      win.webContents.setZoomFactor(1)
      win.setSize(1100, 760)
      await new Promise(resolve => setTimeout(resolve, 150))
      const point = await evaluate(`(() => { const r = document.querySelector('.cm-mergeView').getBoundingClientRect(); return { x: Math.round(r.x + 100), y: Math.round(r.y + 50) } })()`)
      // Dispatch directly to Chromium so wheel input also works in a hidden test window.
      win.webContents.debugger.attach('1.3')
      try {
        await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 0, deltaY: 240 })
      } finally { win.webContents.debugger.detach() }
      await waitFor(`document.querySelector('.cm-mergeView').scrollTop > 0`)
      fs.writeFileSync(path.join(output, 'comparison.png'), (await win.webContents.capturePage()).toPNG())
      await toggle('Side by side')
      await waitFor(`document.querySelectorAll('[data-config-preview="diff"] .cm-editor').length === 1 && !!document.querySelector('.cm-deletedChunk')`)
      assert.equal(await evaluate(`document.querySelectorAll('[role="dialog"] .cm-content[contenteditable="true"]').length`), 0, 'Unified preview must remain read-only')
      await evaluate(`document.querySelector('[data-config-preview="diff"] .cm-scroller').scrollTop = 1000`)
      await waitFor(`document.querySelector('[data-config-preview="diff"] .cm-scroller').scrollTop > 0`)
      await toggle('Show changes')
      await waitFor(`!!document.querySelector('[data-config-preview="yaml"] .cm-editor')`)
      assert.equal(await evaluate(`document.querySelectorAll('[role="dialog"] .cm-content[contenteditable="true"]').length`), 0, 'Plain preview must remain read-only')
      assert.ok(await evaluate(`document.querySelector('[data-config-preview="yaml"] .cm-content').textContent.includes('PROXY')`))
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).some(button => button.textContent.includes('Save & Apply'))`), false, 'Preview must not offer profile editing actions')
      await toggle('Show changes')
      await waitFor(`document.querySelectorAll('[data-config-preview="diff"] .cm-editor').length === 1`)
      await toggle('Side by side')
      await waitFor(`document.querySelectorAll('[data-config-preview="diff"] .cm-editor').length === 2`)
      console.log('PASS: shared file editor controls, read-only plain/unified/side-by-side preview, highlights, small/zoomed layout and scrolling')
    } finally { win.destroy(); app.quit() }
  }).catch(error => { console.error(error); app.exit(1) })
}
