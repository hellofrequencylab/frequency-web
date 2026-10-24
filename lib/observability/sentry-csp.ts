/** Permit the configured HTTPS ingest origin, without DSN credentials or path.
 * No vendor wildcard: self-hosted and regional endpoints get only their own origin. */
export function sentryCspSource(dsn: string | null | undefined): string {
  if (!dsn) return ''
  try {
    const url = new URL(dsn)
    return url.protocol === 'https:' ? url.origin : ''
  } catch {
    return ''
  }
}
