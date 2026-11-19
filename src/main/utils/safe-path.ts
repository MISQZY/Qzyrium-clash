import path from 'node:path'
import { isSafeIdentifier } from '@shared/identifiers'

export function resolveSafeChildPath(baseDir: string, id: string, extension: string): string {
  if (!isSafeIdentifier(id)) {
    throw new Error(`Invalid identifier format: ${id}`)
  }
  const resolvedBase = path.resolve(baseDir)
  const boundary = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep
  const normalizedExt = extension.startsWith('.') ? extension : `.${extension}`
  const filePath = path.resolve(path.join(resolvedBase, `${id}${normalizedExt}`))
  if (!filePath.startsWith(boundary)) {
    throw new Error(`Path traversal detected for identifier: ${id}`)
  }
  return filePath
}
