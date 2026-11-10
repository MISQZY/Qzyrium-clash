/** Display the provider without exposing the subscription's path or access token. */
export function profileSource(url?: string): string | undefined {
  if (!url) return undefined
  try { return new URL(url).hostname || undefined } catch { return undefined }
}
