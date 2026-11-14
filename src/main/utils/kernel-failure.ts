import type { KernelFailure, KernelFailureReason } from '@shared/kernel-failure'
import { cleanLogMessage } from '@shared/logs'

export class KernelOperationError extends Error {
  constructor(readonly reason: KernelFailureReason, message: string) { super(message); this.name = 'KernelOperationError' }
}

export function kernelFailureDetails(error: unknown, output: readonly string[] = []): string {
  const detail = error as { message?: unknown; code?: unknown; stdout?: unknown; stderr?: unknown; cause?: unknown } | null
  const parts = [detail?.message, detail?.code, detail?.stdout, detail?.stderr, ...output]
  if (detail?.cause && detail.cause !== error) {
    const cause = detail.cause as { message?: unknown; code?: unknown }
    parts.push(cause.message, cause.code)
  }
  return cleanLogMessage(parts.filter((part): part is string => typeof part === 'string').join('\n'))
    .replace(/(["']?(?:password|secret|token|uuid|private-key)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[REDACTED]')
    .slice(-16_384)
}

export function classifyKernelFailure(error: unknown, output: readonly string[] = [], context?: KernelFailureReason, exitCode?: number | null): KernelFailure {
  const details = kernelFailureDetails(error, output)
  let reason: KernelFailureReason
  if (error instanceof KernelOperationError) reason = error.reason
  else if (context === 'watchdog') reason = 'watchdog'
  else if (/EADDRINUSE|address already in use|Only one usage of each socket address|разрешается только одно использование.*сокет|bind[^\n]*(?:10048|already in use)/i.test(details)) reason = 'port-in-use'
  else if (/\b(?:EACCES|EPERM)\b|permission denied|access (?:is )?denied|operation not permitted|requires? (?:admin|elevation)|insufficient privileges|required privilege.*not held|forbidden by its access permissions|отказано в доступе/i.test(details)) reason = 'permission'
  else if (/\bENOENT\b/.test(details) && (context !== 'configuration' || /\bspawn\b/i.test(details))) reason = 'missing-core'
  else if (context === 'configuration' || /parse (?:config|yaml)|yaml:|unmarshal|invalid (?:config|profile)|rules\[\d+\]|Profile (?:validation failed|file is missing)|Profile does not contain|Profile must contain/i.test(details)) reason = 'configuration'
  else if (/timed? out|timeout|did not become ready|ECONNABORTED|ETIMEDOUT/i.test(details)) reason = 'timeout'
  else if (context === 'crash' || /panic:|fatal error|crashed|terminated prematurely/i.test(details)) reason = 'crash'
  else reason = 'unknown'
  return { reason, occurredAt: new Date().toISOString(), ...(typeof exitCode === 'number' ? { exitCode } : {}) }
}
