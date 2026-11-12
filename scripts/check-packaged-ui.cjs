const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { spawn, execFile } = require('node:child_process')
const { promisify } = require('node:util')
const execute = promisify(execFile)
const WebSocket = require('ws')
const stress = process.argv.includes('--resize-stress')
const resizeOnly = process.argv.includes('--resize-only')
const stressDuration = Number(process.argv.find(arg => arg.startsWith('--stress-ms='))?.slice('--stress-ms='.length) || 60000)
assert.ok(Number.isInteger(stressDuration) && stressDuration >= 1000 && stressDuration <= 180000, 'stress duration must be between 1 and 180 seconds')
// Run the packaged application against a fresh profile with VPN, system proxy,
// updates and login registration disabled. Inspect only our own paused child.
const output = path.resolve(__dirname, '../artifacts/packaged-ui', `${Date.now()}-${stress ? 'stress' : process.argv.includes('--silent') ? 'silent' : 'normal'}`)
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(path.join(output, 'settings.json'), JSON.stringify({ general: { autoConnect: false, autoStart: false,
  autoCheckUpdates: false, updateProfilesOnStart: false, autoUpdateProfiles: false, theme: 'one-dark', language: 'ru',
  lowMemoryMode: false, disableGpu: false, shortcuts: {}, silentStart: process.argv.includes('--silent') }, kernel: { tun: { enable: false } }, sysProxy: { enable: false } }))
let addressResolve
const address = new Promise(resolve => { addressResolve = resolve })
const child = spawn(path.resolve('dist/win-unpacked/Qzyrium-clash.exe'), ['--inspect-brk=127.0.0.1:0', '--noadmin', '--no-admin-task'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
let stderrBytes = 0
let graphicsFailure = false
child.stderr.on('data', data => {
  if (stderrBytes < 16384) process.stderr.write(data.subarray(0, 16384-stderrBytes))
  stderrBytes += data.length
  if (/D3D11 device was removed|context already lost|GPU process isn't usable|Requested GL implementation|Failed to create shared context for virtualization/.test(data.toString())) {
    graphicsFailure = true
    child.kill()
  }
  const match = data.toString().match(/ws:\/\/127\.0\.0\.1:\d+\/[\w-]+/)
  if (match) addressResolve(match[0])
})
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const watchdog = setTimeout(() => { child.kill(); process.exit(1) }, stress ? 300000 : 180000)
const report = []
let socket
;(async () => {
  socket = new WebSocket(await address)
  await new Promise(resolve => socket.on('open', resolve))
  let sequence = 0, pauseResolve
  const pending = new Map()
  socket.on('message', buffer => { const value = JSON.parse(buffer); if (value.id) { pending.get(value.id)?.(value); pending.delete(value.id) } else if (value.method === 'Debugger.paused') pauseResolve?.(value.params) })
  const call = (method, params = {}) => new Promise(resolve => { const id = ++sequence; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })) })
  await call('Debugger.enable')
  const regex = 'app[.]asar[/\\\\]out[/\\\\]main[/\\\\]index[.]js$'
  await call('Debugger.setBreakpointByUrl', { lineNumber: 0, urlRegex: regex })
  let paused = new Promise(resolve => { pauseResolve = resolve })
  await call('Runtime.runIfWaitingForDebugger')
  let state = await paused
  for (let i = 0; i < 8; i++) {
    const probe = await call('Debugger.evaluateOnCallFrame', { callFrameId: state.callFrames[0].callFrameId, expression: `typeof require === 'function' && typeof __filename === 'string' ? __filename : ''`, returnByValue: true })
    if (String(probe.result?.result?.value).includes('out')) break
    paused = new Promise(resolve => { pauseResolve = resolve }); await call('Debugger.resume'); state = await paused
  }
  const injection = await call('Debugger.evaluateOnCallFrame', { callFrameId: state.callFrames[0].callFrameId,
    expression: `(() => { globalThis.smokeRequire=require; const {app}=require('electron'); app.setPath('userData', ${JSON.stringify(output)}); Object.defineProperty(app,'isPackaged',{value:false}); app.setAsDefaultProtocolClient=()=>false; return app.getPath('userData'); })()`, returnByValue: true })
  assert.equal(injection.result?.result?.value, output)
  const line = fs.readFileSync('out/main/index.js', 'utf8').split('\n').findIndex(line => line.includes('const initialProto = extractProtocolUrl(process.argv)'))
  assert.ok(line > 0)
  await call('Debugger.setBreakpointByUrl', { lineNumber: line, urlRegex: regex })
  paused = new Promise(resolve => { pauseResolve = resolve }); await call('Debugger.resume'); state = await paused
  await call('Debugger.evaluateOnCallFrame', { callFrameId: state.callFrames[0].callFrameId, expression: 'globalThis.smokeServices=services; true', returnByValue: true })
  await call('Debugger.disable')
  const evaluate = async expression => {
    const response = await Promise.race([
      call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
      exited.then(exit => { throw Error(`Packaged process exited during evaluation: ${JSON.stringify(exit)}; graphics failure: ${graphicsFailure}`) })
    ])
    if (response.result?.exceptionDetails) throw Error(JSON.stringify(response.result.exceptionDetails))
    return response.result?.result?.value
  }
  if (!process.argv.includes('--with-onboarding')) {
    await evaluate(`smokeServices.windowService.getMainWindow().webContents.executeJavaScript("localStorage.setItem('qzyrium:onboarding-shown','1');document.querySelector('.tour-close')?.click()")`)
  }
  await evaluate(`(() => { globalThis.menuShows=0; globalThis.menuCloses=0; globalThis.leftClicks=0; globalThis.rightClicks=0; const tray=smokeServices.trayService.tray;
    tray.on('click',()=>leftClicks++);tray.on('right-click',()=>rightClicks++);
    const original=tray.setContextMenu.bind(tray); tray.setContextMenu=menu=>{ globalThis.trayMenu=menu; menu.on('menu-will-show',()=>{menuShows++}); menu.on('menu-will-close',()=>{menuCloses++}); original(menu) };
    smokeServices.trayService.updateContextMenu(); return true; })()`)
  const pointer = action => execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-File', path.resolve('scripts/fixtures/tray-pointer.ps1'), 'Qzyrium-clash', action], { windowsHide: true, timeout: 15000 })
  const check = async (name, fn) => { await fn(); report.push({ name, status: 'passed' }); console.log('PASS:', name) }
  if (stress) {
    await evaluate('smokeServices.windowService.show();smokeServices.windowService.getMainWindow().setPosition(20,20);smokeServices.windowService.getMainWindow().setSize(940,660)')
    await delay(1500)
    await nativeCapture('stress-before')
    const info = await evaluate(`({ handle:smokeServices.windowService.getMainWindow().getNativeWindowHandle().readBigUInt64LE().toString(),ids:smokeRequire('electron').app.getAppMetrics().map(p=>p.pid) })`)
    const memory = () => evaluate(`smokeRequire('electron').app.getAppMetrics().map(p=>({pid:p.pid,type:p.type,...p.memory}))`)
    const before = await memory()
    console.log('STRESS:',stressDuration,'ms; private commit before:', before.reduce((sum,p)=>sum+p.privateBytes,0)/1024)
    console.log('EFFECTIVE SWITCHES',JSON.stringify(await evaluate(`(()=>{const app=smokeRequire('electron').app;return {inProcess:app.commandLine.hasSwitch('in-process-gpu'),noDcomp:app.commandLine.hasSwitch('disable-direct-composition'),angle:app.commandLine.getSwitchValue('use-angle'),processes:app.getAppMetrics().map(p=>({pid:p.pid,type:p.type}))}})()`)))
    const {stdout} = await execute('powershell.exe', ['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-File',path.resolve('scripts/fixtures/stress-native-window.ps1'),info.handle,info.ids.join(','),String(stressDuration)], {windowsHide:true,timeout:stressDuration+30000})
    const samples=JSON.parse(stdout)
    const cooldown=[]
    for(let step=0;step<6;step++){await delay(3000);cooldown.push({elapsedMs:(step+1)*3000,processes:await memory()})}
    const result={before,samples,cooldown};fs.writeFileSync(path.join(output,'stress.json'),JSON.stringify(result,null,2))
    console.log('STRESS RESULT',JSON.stringify({peakPrivateMiB:Math.max(...samples.map(s=>s.privateMiB)),last: samples.at(-1),cooldownPrivateMiB:cooldown.map(s=>s.processes.reduce((sum,p)=>sum+p.privateBytes,0)/1024)}))
    assert.ok(samples.at(-1).elapsedMs>=stressDuration-1000,'stress must complete without hitting the 1200 MiB guard')
    assert.ok(new Set(samples.map(sample=>sample.width)).size>=5,'stress must exercise real changing native window sizes')
    const baseline=before.reduce((sum,p)=>sum+p.privateBytes,0)/1024
    const settled=cooldown.at(-1).processes.reduce((sum,p)=>sum+p.privateBytes,0)/1024
    assert.ok(settled<baseline+256,'graphics memory must return near its warm baseline after resize')
    if(stressDuration>=60000){
      const middle=samples.filter(sample=>sample.elapsedMs>=stressDuration*.25 && sample.elapsedMs<stressDuration*.5)
      const tail=samples.filter(sample=>sample.elapsedMs>=stressDuration*.75)
      const average=rows=>rows.reduce((sum,row)=>sum+row.privateMiB,0)/rows.length
      assert.ok(average(tail)<=average(middle)+128,'sustained resize memory must plateau rather than keep growing')
    }
    await nativeCapture('stress-after')
    const layout=await evaluate(`smokeServices.windowService.getMainWindow().webContents.executeJavaScript("({transform:document.getElementById('root').style.transform,width:document.getElementById('root').clientWidth,height:document.getElementById('root').clientHeight,viewportWidth:innerWidth,viewportHeight:innerHeight})")`)
    assert.equal(layout.transform,'','native resizing must not leave a transformed document')
    assert.ok(Math.abs(layout.width-layout.viewportWidth)<=2 && Math.abs(layout.height-layout.viewportHeight)<=2,'final layout must match the native viewport')
    await pointer('right');await delay(200);assert.ok(await evaluate('menuShows')>0);await pointer('escape')
    await check('sustained native resize retains responsive UI and tray', async()=>{})
  } else {
  if (!resizeOnly) {
  await check('real tray right click', async () => {
    await pointer('right'); await delay(300); assert.ok(await evaluate('menuShows') > 0);
    const { stdout } = await execute('powershell.exe', ['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-File',path.resolve('scripts/fixtures/capture-native-menu.ps1'),String(child.pid),path.join(output,'tray-menu.png')],{windowsHide:true,timeout:15000});
    const menu=JSON.parse(stdout);assert.ok(menu.colors>32,'real tray menu must paint its text');assert.ok(menu.labels.length>5,'tray menu must expose its actions');
    await pointer('escape'); assert.ok(await evaluate('menuCloses') > 0)
  })
  await check('tray left click restores closed window', async () => {
    await evaluate('smokeServices.windowService.close()'); assert.equal(await evaluate('smokeServices.windowService.getMainWindow().isVisible()'), false)
    await pointer('left'); await delay(700)
    assert.equal(await evaluate('smokeServices.windowService.getMainWindow().isVisible()'), true)
  })
  await check('tray left click restores minimized window', async () => {
    await evaluate('smokeServices.windowService.minimize()'); await delay(200); await pointer('left'); await delay(700)
    assert.equal(await evaluate('smokeServices.windowService.getMainWindow().isMinimized()'), false)
  })
  await check('native screen after resize and renderer cache release', async () => {
    await evaluate(`(async()=>{const win=smokeServices.windowService.getMainWindow(); win.setPosition(20,20); win.setSize(850,640);
      await win.webContents.executeJavaScript('window.api.window.releaseUnusedMemory()'); await new Promise(r=>setTimeout(r,300)); win.setSize(1200,850);win.focus();})()`)
    await delay(600)
    await nativeCapture('after-cache-resize')
  })
  await check('core only destroys renderer and tray recreates it', async () => {
    await evaluate('smokeServices.windowService.setCoreOnlyMode(true)'); await delay(500)
    assert.equal(await evaluate(`smokeRequire('electron').BrowserWindow.getAllWindows().length`), 0)
    await pointer('right'); await delay(200); await pointer('escape'); await pointer('left'); await delay(2000)
    assert.equal(await evaluate('smokeServices.windowService.getMainWindow().isVisible()'), true)
  })
  await check('real context menu opens after renderer recreation', async () => {
    const before = await evaluate('menuShows'); await pointer('right'); await delay(300)
    assert.ok(await evaluate('menuShows') > before); await pointer('escape')
  })
  }
  await check('native grow/shrink under actual mouse resize', async () => {
    await evaluate('smokeServices.windowService.getMainWindow().setPosition(20,20);smokeServices.windowService.getMainWindow().setSize(940,660)')
    await nativeCapture('before-drag')
    await evaluate(`(()=>{globalThis.boundsTrace=[];const w=smokeServices.windowService.getMainWindow();w.on('will-resize',(_event,bounds)=>boundsTrace.push({t:Date.now(),bounds,current:w.getBounds(),content:w.getContentBounds()}));return w.webContents.executeJavaScript("window.resizeTrace=[];window.addEventListener('resize',()=>resizeTrace.push({t:Date.now(),w:innerWidth,h:innerHeight,rootWidth:document.getElementById('root').clientWidth,rootLeft:document.getElementById('root').getBoundingClientRect().left,bodyMargin:getComputedStyle(document.body).marginLeft,rootTransform:document.getElementById('root').style.transform}))")})()`)
    const handle = await evaluate('smokeServices.windowService.getMainWindow().getNativeWindowHandle().readBigUInt64LE().toString()')
    const dpr = await evaluate(`smokeServices.windowService.getMainWindow().webContents.executeJavaScript('devicePixelRatio')`)
    const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-File', path.resolve('scripts/fixtures/drag-native-window.ps1'), handle, output, String(dpr)], { windowsHide: true, timeout: 30000 })
    const samples=JSON.parse(stdout);fs.writeFileSync(path.join(output,'drag.json'),JSON.stringify(samples,null,2));
    fs.writeFileSync(path.join(output,'drag-diagnostics.json'),JSON.stringify(await evaluate(`(async()=>({main:boundsTrace,renderer:await smokeServices.windowService.getMainWindow().webContents.executeJavaScript('resizeTrace')}))()`),null,2))
    assert.ok(new Set(samples.map(s=>s.width)).size>1);
    for(const sample of samples)assertColors(sample.colors,'drag '+sample.step)
    await nativeCapture('after-drag')
  })
  await check('maximize/unmaximize, restore and zoom presentation', async () => {
    await evaluate('smokeServices.windowService.getMainWindow().maximize()');await nativeCapture('maximized');
    await evaluate('smokeServices.windowService.getMainWindow().unmaximize()');await nativeCapture('unmaximized');
    await evaluate('smokeServices.windowService.getMainWindow().webContents.setZoomFactor(1.25)');await nativeCapture('zoomed');
    await evaluate('smokeServices.windowService.getMainWindow().webContents.setZoomFactor(1)');await nativeCapture('zoom-restored');
  })
  await check('accelerated process model without a separate GPU process', async () => {
    const metrics=await evaluate(`({gpu:smokeRequire('electron').app.getGPUFeatureStatus(),processes:smokeRequire('electron').app.getAppMetrics().map(p=>({pid:p.pid,type:p.type}))})`)
    assert.equal(metrics.gpu.gpu_compositing,'enabled')
    assert.ok(!metrics.processes.some(p=>p.type==='GPU'))
  })
  }
  await evaluate(`smokeRequire('electron').app.quit()`)
  socket.close()
  const exit = await exited
  assert.equal(exit.code, 0, 'packaged application exits cleanly')
  report.push({name:'clean application shutdown',status:'passed'})
  clearTimeout(watchdog)
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log('REPORT', output)
  function assertColors(colors,label){const expected=[0,0,255,0,255,0,255,0,0,0,255,255];assert.equal(colors.length,12);assert.ok(colors.every((v,i)=>expected[i]?v>170:v<120),`${label}: missing corner pixels: ${colors}`)}
  async function nativeCapture(stage) {
    const dimensions=await evaluate(`(async()=>{const w=smokeServices.windowService.getMainWindow();await w.webContents.executeJavaScript(\`(()=>{if(document.querySelector('#native-probes'))return;const d=document.createElement('div');d.id='native-probes';const s=['top:64px;left:12px;background:#ff0000','top:64px;right:12px;background:#00ff00','bottom:12px;left:12px;background:#0000ff','bottom:12px;right:12px;background:#ffff00'];d.innerHTML=s.map(x=>'<div style="position:fixed;visibility:visible;width:16px;height:16px;z-index:2147483647;'+x+'"></div>').join('');document.documentElement.append(d)})()\`);return {handle:w.getNativeWindowHandle().readBigUInt64LE().toString(),...await w.webContents.executeJavaScript('({width:innerWidth,height:innerHeight})')};})()`)
    await delay(500)
    const {stdout}=await execute('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-File',path.resolve('scripts/fixtures/capture-native-window.ps1'),dimensions.handle,path.join(output,stage+'.png'),String(dimensions.width),String(dimensions.height)],{windowsHide:true,timeout:15000})
    const result=JSON.parse(stdout);assertColors(result.probes,stage);return result
  }
})().catch(error => { console.error(error); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ error: String(error), report }, null, 2)); socket?.close(); child.kill(); clearTimeout(watchdog); process.exitCode=1 })
