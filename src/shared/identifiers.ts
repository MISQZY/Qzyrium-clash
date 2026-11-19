const WINDOWS_RESERVED_NAMES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

export function isSafeIdentifier(value: unknown, maxLength = 64): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= maxLength &&
    /^[a-zA-Z0-9_-]+$/.test(value) &&
    !WINDOWS_RESERVED_NAMES.test(value)
  )
}
