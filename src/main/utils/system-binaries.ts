import path from 'node:path'
import { app } from 'electron'
import { trustedSystemBinary } from './executable-security'

/**
 * Packaged applications use the OS loader's system directory, independently of
 * PATH and SystemRoot. Development retains the environment-based fixture path.
 */
export function getSystemBinary(name: string): string {
  if (process.platform !== 'win32') return name
  const systemRoot = process.env?.SystemRoot
  const exeName = name.toLowerCase().endsWith('.exe') ? name : `${name}.exe`
  if (app?.isPackaged === true) return trustedSystemBinary(exeName)
  return systemRoot ? path.join(systemRoot, 'System32', exeName) : exeName
}
