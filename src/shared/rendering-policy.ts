import policy from './rendering-policy.json'

type ChromiumSwitch = readonly [name: string, value?: string]

/**
 * On Windows, host GPU work in the main process so its native windows cannot
 * produce a second application group in Task Manager. Hardware composition
 * and GPU rasterization remain enabled for interactive window resizing.
 * In-process GPU requires the non-DirectComposition presentation path on
 * Windows: otherwise the renderer paints but the native window stays gray.
 * Compact mode additionally reduces caches while retaining full-color textures.
 * JSON lets fixtures share the policy without loading a TypeScript compiler
 * into the measured Electron process and inflating its memory usage.
 *
 * When isolateGpu is true, GPU execution runs in an isolated Chromium GPU process.
 * This prevents main process crashes on driver faults or WebGL wake issues.
 */
export function renderingSwitches(platform: string, lowMemoryMode = false, isolateGpu = false): readonly ChromiumSwitch[] {
  const winSwitches = platform === 'win32'
    ? (isolateGpu ? policy.win32.filter(([name]) => name !== 'in-process-gpu' && name !== 'disable-direct-composition') : policy.win32)
    : []
  return [...policy.common, ...winSwitches,
    ...(platform === 'win32' && lowMemoryMode ? policy.compact : [])]
    .map(([name, value]) => [name, value] as const)
}
