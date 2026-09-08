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

// The list itself moved to lib/events/time-zones.ts (ADR-1281), a PURE module the Event manifest
// can import; this re-export keeps the remaining consumer (circle-place-time-module) working.
export { COMMON_TIME_ZONES } from '@/lib/events/time-zones'
