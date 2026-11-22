const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn, execFileSync } = require('node:child_process')

async function verify() {
  if (process.platform !== 'win32') { console.log('SKIP: Windows network watchdog'); return }
  const root = path.resolve('artifacts/network-watchdog')
  fs.mkdirSync(root, { recursive: true })
  const directory = fs.mkdtempSync(path.join(root, 'run-'))
  const csc = ['Framework64', 'Framework'].map(name => path.join(process.env.SystemRoot, 'Microsoft.NET', name, 'v4.0.30319', 'csc.exe')).find(fs.existsSync)
  const source = path.resolve('scripts/runner/NetworkWatchdog.cs')
  const watchdog = path.join(directory, 'watchdog.exe')
  const fixture = path.join(directory, 'core.exe')
  const tests = path.join(directory, 'tests.exe')
  const compile = args => execFileSync(csc, ['/nologo', '/reference:System.Web.Extensions.dll', '/reference:System.Management.dll', ...args], { windowsHide: true, stdio: 'pipe' })
  compile([`/out:${watchdog}`, source])
  compile([`/out:${tests}`, '/main:WatchdogTests', source, path.resolve('scripts/runner/WatchdogTests.cs')])
  execFileSync(tests, [directory], { windowsHide: true, stdio: 'pipe' })
  const coreSource = path.join(directory, 'Core.cs')
  fs.writeFileSync(coreSource, 'class Core { static void Main() { System.Threading.Thread.Sleep(60000); } }')
  compile([`/out:${fixture}`, coreSource])
  const protectedCores = path.join(directory, 'protected-runtime', 'cores')
  const stable = path.join(protectedCores, 'stable', 'mihomo.exe')
  const alpha = path.join(protectedCores, 'alpha', 'mihomo.exe')
  const foreign = path.join(directory, 'cores', 'stable', 'mihomo.exe')
  const runtimeRoot = path.join(directory, 'protected-runtime', 'executables')
  const cached = path.join(runtimeRoot, 'a'.repeat(64), 'mihomo.exe')
  const invalidCached = path.join(runtimeRoot, 'b'.repeat(63), 'mihomo.exe')
  for (const destination of [stable, alpha, foreign, cached, invalidCached]) {
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(fixture, destination)
  }
  const parentScript = path.join(directory, 'parent.cjs')
  fs.writeFileSync(parentScript, `
    const { spawn } = require('node:child_process');
    const { loadTypeScript } = require(${JSON.stringify(path.resolve('scripts/fixtures/typescript.cjs'))});
    const { NetworkWatchdog } = loadTypeScript(${JSON.stringify(path.resolve('src/main/utils/network-watchdog.ts'))}, {
      './paths': { getAppPaths: () => ({ geoFilesDir: ${JSON.stringify(directory)}, coreBinaryPath: ${JSON.stringify(fixture)}, userData: ${JSON.stringify(directory)}, coresDir: ${JSON.stringify(protectedCores)} }) },
      './logger': { logger: { error() {} } },
      './executable-security': {
        prepareExecutableForExecution: (file, role) => {
          if (role !== 'watchdog') throw new Error('Unexpected helper role');
          return ${JSON.stringify(watchdog)};
        },
        getProtectedRuntimeDirectory: () => ${JSON.stringify(runtimeRoot)}
      },
      'node:child_process': { spawn: (file, args, options) => {
        if (file !== ${JSON.stringify(watchdog)}) throw new Error('Watchdog must execute the prepared helper');
        return spawn(file, args, options);
      } }
    });
    (async () => {
      const watcher = new NetworkWatchdog(error => { throw error });
      await watcher.start();
      process.on('message', async message => {
        if (message !== 'stop') return;
        await watcher.stop();
        process.send({ stopped: true }, () => process.exit(0));
      });
      const core = spawn(${JSON.stringify(fixture)}, [], { windowsHide: true, stdio: 'ignore' });
      await watcher.trackCore(core.pid);
      const stable = spawn(${JSON.stringify(stable)}, [], { windowsHide: true, stdio: 'ignore' });
      await watcher.trackCore(stable.pid);
      const alpha = spawn(${JSON.stringify(alpha)}, [], { windowsHide: true, stdio: 'ignore' });
      await watcher.trackCore(alpha.pid);
      const cached = spawn(${JSON.stringify(cached)}, [], { windowsHide: true, stdio: 'ignore' });
      await watcher.trackCore(cached.pid);
      let rejected = false;
      try { await watcher.trackCore(process.pid); } catch { rejected = true; }
      if (!rejected) throw new Error('Foreign executable accepted');
      const foreign = spawn(${JSON.stringify(foreign)}, [], { windowsHide: true, stdio: 'ignore' });
      try {
        let rejected = false;
        try { await watcher.trackCore(foreign.pid); } catch { rejected = true; }
        if (!rejected) throw new Error('Unapproved core directory accepted');
      } finally { foreign.kill(); }
      const invalidCached = spawn(${JSON.stringify(invalidCached)}, [], { windowsHide: true, stdio: 'ignore' });
      try {
        let rejected = false;
        try { await watcher.trackCore(invalidCached.pid); } catch { rejected = true; }
        if (!rejected) throw new Error('Malformed runtime digest accepted');
      } finally { invalidCached.kill(); }
      const unregistered = spawn(${JSON.stringify(fixture)}, [], { windowsHide: true, stdio: 'ignore' });
      const unregisteredAlpha = spawn(${JSON.stringify(alpha)}, [], { windowsHide: true, stdio: 'ignore' });
      const unregisteredCached = spawn(${JSON.stringify(cached)}, [], { windowsHide: true, stdio: 'ignore' });
      process.send({ ready: true, core: core.pid, stable: stable.pid, alpha: alpha.pid, cached: cached.pid,
        unregistered: unregistered.pid, unregisteredAlpha: unregisteredAlpha.pid, unregisteredCached: unregisteredCached.pid });
    })().catch(error => { process.send({ error: error.stack }); process.exit(1); });
  `)
  const parent = spawn(process.execPath, [parentScript], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  let output = ''
  parent.stderr.on('data', data => { output += data })
  const pids = []
  const alive = pid => { try { process.kill(pid, 0); return true } catch { return false } }
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
  try {
    const message = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Watchdog fixture timed out: ' + output)), 35_000)
      parent.once('message', value => { clearTimeout(timer); resolve(value) })
      parent.once('error', error => { clearTimeout(timer); reject(error) })
      parent.once('exit', code => { clearTimeout(timer); reject(new Error(`Parent exited ${code}: ${output}`)) })
    })
    assert.ok(message.ready, message.error)
    pids.push(message.core, message.stable, message.alpha, message.cached, message.unregistered, message.unregisteredAlpha, message.unregisteredCached)
    assert.ok(pids.every(alive))
    // Kill only the parent, leaving the detached watcher and cores to recover.
    parent.kill()
    for (let attempt = 0; attempt < 150 && pids.some(alive); attempt++) await wait(100)
    assert.ok(pids.every(pid => !alive(pid)), 'watcher kills registered and not-yet-registered cores after parent termination')
    // A new app must be able to acquire the previous session lock after recovery.
    let unlocked = false
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const handle = fs.openSync(path.join(directory, 'network-session.lock'), 'r+')
        fs.closeSync(handle)
        unlocked = true
        break
      } catch (error) { if (error.code !== 'EBUSY') throw error; await wait(100) }
    }
    assert.ok(unlocked, 'session lock is released after cleanup')
    const graceful = spawn(process.execPath, [parentScript], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
    try {
      const next = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Graceful fixture did not start')), 30_000)
        graceful.once('message', message => { clearTimeout(timer); resolve(message) })
      })
      assert.ok(next.ready, next.error)
      const gracefulPids = [next.core, next.stable, next.alpha, next.cached, next.unregistered, next.unregisteredAlpha, next.unregisteredCached]
      pids.push(...gracefulPids)
      const stopped = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Graceful watchdog shutdown timed out')), 30_000)
        graceful.once('message', message => { clearTimeout(timer); resolve(message) })
      })
      graceful.send('stop')
      assert.ok((await stopped).stopped)
      assert.ok(gracefulPids.every(pid => !alive(pid)), 'graceful shutdown completes before installer replaces helper files')
    } finally { if (graceful.exitCode === null) graceful.kill() }
    console.log('PASS: bundled/Stable/Alpha/cached core supervision, exact runtime paths, foreign path rejection, parent crash, stable process handles, spawn/registration race and isolated registry recovery')
  } finally {
    if (parent.exitCode === null) parent.kill()
    for (const pid of pids) if (alive(pid)) process.kill(pid)
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
