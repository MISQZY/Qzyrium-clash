import path from 'node:path'

/**
 * Resolves a standard Windows system utility from System32 using %SystemRoot%
 * to prevent binary hijacking when PATH is modified or untrusted.
 */
export function getSystemBinary(name: string): string {
  if (process.platform !== 'win32') return name
  const systemRoot = process.env?.SystemRoot
  const exeName = name.toLowerCase().endsWith('.exe') ? name : `${name}.exe`
  return systemRoot ? path.join(systemRoot, 'System32', exeName) : exeName
}
