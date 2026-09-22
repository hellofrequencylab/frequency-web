// THE VIEWER'S ZONE, once (LIVE-468). The staff drawer and the Ask Vera box each carried a copy of
// this. One export, one fallback: the house zone (lib/time/zone.ts HOME_TZ, restated here so a client
// module does not pull the tz tables in for one string).

const FALLBACK_ZONE = 'America/Los_Angeles'

/** The browser's IANA zone, or the house zone when the browser cannot say. Client only. */
export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_ZONE
  } catch {
    return FALLBACK_ZONE
  }
}
