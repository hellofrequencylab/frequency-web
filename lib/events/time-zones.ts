// The curated IANA time zones the Event and Circle editors offer, HOME first.
//
// PURE (no imports), so the Event manifest can declare `timeZone` as a `select` over this list
// (ADR-1281) and the two admin modules can read the same rows. It used to live inside
// `components/admin/modules/event-shared-fields-module.tsx`, a `'use client'` file a manifest may
// not import; that file re-exports it for its remaining consumer.
//
// A stored zone that falls outside this list is not lost: the field kit's `select` keeps an
// off-list value selectable and marked (ADR-879), which is what the modules used to do by hand
// when they prepended the saved zone.

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

/** The zone an event without one shows: the first row, which is HOME. */
export const HOME_TIME_ZONE = COMMON_TIME_ZONES[0].value
