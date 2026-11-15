export interface LinuxProxySnapshot {
  version: 1
  backend: 'gnome' | 'kde'
  binary: string
  values: { schema: string; key: string; value: string | null }[]
}
export function entries(backend: LinuxProxySnapshot['backend']): { schema: string; key: string }[]
export function readSnapshot(filename: string): LinuxProxySnapshot | null
export function restoreSnapshot(filename: string, execute: (binary: string, args: string[], options: { timeout: number }) => Promise<unknown>): Promise<void>
