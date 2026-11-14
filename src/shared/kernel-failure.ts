import type { AppConfig } from './app-config'
import { nativeMessage } from './localization'

const messages = {
  configuration: 'kernelFailureConfiguration', 'port-in-use': 'kernelFailurePort', permission: 'kernelFailurePermission',
  watchdog: 'kernelFailureWatchdog', 'missing-core': 'kernelFailureMissing', timeout: 'kernelFailureTimeout',
  crash: 'kernelFailureCrash', unknown: 'kernelFailureUnknown'
} as const
export type KernelFailureReason = keyof typeof messages
export interface KernelFailure { reason: KernelFailureReason; occurredAt: string; exitCode?: number }

export function kernelFailureMessage(failure: KernelFailure, general: AppConfig['general']): string {
  return nativeMessage(general.language, messages[failure.reason] ?? messages.unknown, general)
}
