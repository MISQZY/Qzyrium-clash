/** Slugifies free text into a URL/id-safe key; falls back to 'theme' if nothing alphanumeric survives. */
export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'theme'
}

/** Slugifies `base`, then appends `-2`, `-3`, ... until the result isn't in `existing`. */
export function uniqueUrlKey(base: string, existing: string[]): string {
  const slug = slugify(base)
  if (!existing.includes(slug)) return slug
  let suffix = 2
  while (existing.includes(`${slug}-${suffix}`)) suffix++
  return `${slug}-${suffix}`
}
