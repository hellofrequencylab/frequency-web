// The curated IANA time zones the event and circle admin modules offer.
//
// WHAT THIS FILE USED TO BE, and why almost all of it is gone (2026-08-10). It held two shared
// field clusters, `EventTimeFields` and `EventLocationFields`, extracted from
// `event-settings-module` so that "the Basics editor and the Place & Time editor render the SAME
// controls without copying them." That is a good reason. The Place & Time editor was never built
// — no such file exists — so the extraction never gained its second consumer, and the first one
// went on hand-rolling the identical `starts_at`/`ends_at` inputs inline
// (`event-settings-module.tsx:430,434`). ~215 lines that read as shared infrastructure and were
// reachable from nothing: a repo-wide search for either component returned only its own definition.
//
// Deleted with them: `EventLocationInitial` (the clusters' only caller), the `maplibre` dynamic
// import of `event-location-picker`, and the six imports that fed them.
//
// `COMMON_TIME_ZONES` is the whole of what anything actually imported from here — by
// `event-settings-module.tsx:49` and `circle-place-time-module.tsx:9`. If the Place & Time editor
// is built later, re-extract from the consumer that exists then. An extraction with one caller is
// an extraction waiting to drift.

/** The curated IANA zones the event/circle editors offer, HOME first. The event's own saved
 *  zone is prepended by the module when it falls outside this list, so no zone is ever lost. */
export const COMMON_TIME_ZONES: { value: string; label: string }[] = [
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Central Europe (Paris)' },
  { value: 'Europe/Athens', label: 'Eastern Europe (Athens)' },
  { value: 'Asia/Dubai', label: 'Gulf (Dubai)' },
  { value: 'Asia/Kolkata', label: 'India (Kolkata)' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Tokyo', label: 'Japan (Tokyo)' },
  { value: 'Australia/Sydney', label: 'Sydney' },
]
