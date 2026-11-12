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
 */
export function renderingSwitches(platform: string, lowMemoryMode = false): readonly ChromiumSwitch[] {
  return [...policy.common, ...(platform === 'win32' ? policy.win32 : []),
    ...(platform === 'win32' && lowMemoryMode ? policy.compact : [])]
    .map(([name, value]) => [name, value] as const)
}
