// PLAIN WORDS FOR A TIME ZONE (LIVE-471).
//
// "America/Los_Angeles" is a database key. An operator reads "Pacific Time". Every calendar surface
// that names a zone at a person now reads it from HERE, so the mapping exists once: the console
// header beside the month, the staff drawer's "Times are in" line, and the Space setting's own menu.
//
// WHY NOT Intl's own name. `Intl.DateTimeFormat(..., { timeZoneName: 'long' })` says "Pacific Daylight
// Time" in July and "Pacific Standard Time" in December for the same Space, which turns a stable
// setting into something that appears to change twice a year, and `timeZoneName: 'short'` says "PDT",
// which is the abbreviation this row was filed to stop showing. The zone a Space keeps its schedule in
// does not move with the clocks, so the words for it must not either.
//
// PURE: no imports, no Intl, no dates. Safe in a client component, a Server Component and a test
// alike, and it costs a client bundle nothing but this table.
//
// THE FALLBACK IS HONEST, not raw (the row's ask). A zone outside the table is named by its own city
// ("Asia/Kathmandu" -> "Kathmandu Time"), which is words a person can read and act on. Only a value
// that is not a zone at all falls to "Local time", because there is nothing truthful left to say.

/** What a person reads instead of "Local time" when nothing else can be said. */
export const UNKNOWN_ZONE_WORDS = 'Local time'

/**
 * The zones this product actually sees, in the words people use for them. Regional names ("Pacific
 * Time") rather than country-plus-offset, because that is how an operator says where they work.
 * A zone missing from here is NOT a bug: it falls through to its own city name below. Add a row only
 * when the city name reads wrong for a place people are really running a Space from.
 */
const ZONE_WORDS: Readonly<Record<string, string>> = {
  // North America
  'America/Los_Angeles': 'Pacific Time',
  'America/Vancouver': 'Pacific Time',
  'America/Tijuana': 'Pacific Time',
  'America/Denver': 'Mountain Time',
  'America/Edmonton': 'Mountain Time',
  'America/Boise': 'Mountain Time',
  'America/Phoenix': 'Arizona Time',
  'America/Chicago': 'Central Time',
  'America/Winnipeg': 'Central Time',
  'America/Mexico_City': 'Central Time',
  'America/New_York': 'Eastern Time',
  'America/Toronto': 'Eastern Time',
  'America/Detroit': 'Eastern Time',
  'America/Halifax': 'Atlantic Time',
  'America/St_Johns': 'Newfoundland Time',
  'America/Anchorage': 'Alaska Time',
  'Pacific/Honolulu': 'Hawaii Time',
  // Central and South America
  'America/Bogota': 'Colombia Time',
  'America/Lima': 'Peru Time',
  'America/Santiago': 'Chile Time',
  'America/Sao_Paulo': 'Brazil Time',
  'America/Argentina/Buenos_Aires': 'Argentina Time',
  // Europe
  'Europe/London': 'UK Time',
  'Europe/Dublin': 'Ireland Time',
  'Europe/Lisbon': 'Western European Time',
  'Europe/Paris': 'Central European Time',
  'Europe/Berlin': 'Central European Time',
  'Europe/Madrid': 'Central European Time',
  'Europe/Rome': 'Central European Time',
  'Europe/Amsterdam': 'Central European Time',
  'Europe/Brussels': 'Central European Time',
  'Europe/Zurich': 'Central European Time',
  'Europe/Vienna': 'Central European Time',
  'Europe/Prague': 'Central European Time',
  'Europe/Warsaw': 'Central European Time',
  'Europe/Stockholm': 'Central European Time',
  'Europe/Oslo': 'Central European Time',
  'Europe/Copenhagen': 'Central European Time',
  'Europe/Athens': 'Eastern European Time',
  'Europe/Helsinki': 'Eastern European Time',
  'Europe/Bucharest': 'Eastern European Time',
  'Europe/Kyiv': 'Eastern European Time',
  'Europe/Istanbul': 'Turkey Time',
  'Europe/Moscow': 'Moscow Time',
  // Africa and the Middle East
  'Africa/Cairo': 'Egypt Time',
  'Africa/Lagos': 'West Africa Time',
  'Africa/Nairobi': 'East Africa Time',
  'Africa/Johannesburg': 'South Africa Time',
  'Asia/Jerusalem': 'Israel Time',
  'Asia/Dubai': 'Gulf Time',
  // Asia
  'Asia/Kolkata': 'India Time',
  'Asia/Calcutta': 'India Time',
  'Asia/Bangkok': 'Indochina Time',
  'Asia/Jakarta': 'Western Indonesia Time',
  'Asia/Singapore': 'Singapore Time',
  'Asia/Hong_Kong': 'Hong Kong Time',
  'Asia/Shanghai': 'China Time',
  'Asia/Taipei': 'Taiwan Time',
  'Asia/Seoul': 'Korea Time',
  'Asia/Tokyo': 'Japan Time',
  // Oceania
  'Australia/Perth': 'Western Australia Time',
  'Australia/Darwin': 'Central Australia Time',
  'Australia/Adelaide': 'Central Australia Time',
  'Australia/Brisbane': 'Eastern Australia Time',
  'Australia/Sydney': 'Eastern Australia Time',
  'Australia/Melbourne': 'Eastern Australia Time',
  'Australia/Hobart': 'Eastern Australia Time',
  'Pacific/Auckland': 'New Zealand Time',
  // The zone with no place
  UTC: 'Coordinated Universal Time',
  'Etc/UTC': 'Coordinated Universal Time',
  'Etc/GMT': 'Coordinated Universal Time',
  GMT: 'Coordinated Universal Time',
}

/** The same shape lib/time/zone.ts accepts, restated so this module stays import-free and pure. */
const IANA_TZ_RE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/

/**
 * The plain words for an IANA zone: "America/Los_Angeles" -> "Pacific Time".
 *
 * Three answers, in order:
 *   1. a name from the table above, which is what nearly every real zone hits;
 *   2. the zone's own last path segment as a place, underscores opened out
 *      ("Asia/Kathmandu" -> "Kathmandu Time", "America/Argentina/Ushuaia" -> "Ushuaia Time");
 *   3. "Local time", for empty, malformed or non-zone input, where there is nothing honest to say.
 * Total: never throws, never returns an empty string, and never prints a raw identifier.
 */
export function zoneWords(zone: string | null | undefined): string {
  const tz = (zone ?? '').trim()
  if (!tz) return UNKNOWN_ZONE_WORDS
  const known = ZONE_WORDS[tz]
  if (known) return known
  if (!IANA_TZ_RE.test(tz)) return UNKNOWN_ZONE_WORDS
  const place = tz.split('/').pop()?.replace(/_/g, ' ').trim()
  if (!place) return UNKNOWN_ZONE_WORDS
  return `${place} Time`
}

/**
 * The zones offered as a menu, each with the words a person reads. Sorted by those words so the list
 * reads alphabetically as it is shown, not as it is keyed. A Space already storing a zone that is not
 * on this list keeps it: the control adds the stored value as its own choice (the same rule the
 * Pencil repeat menu follows for a custom rule), so opening a settings form can never silently
 * rewrite a zone nobody was asked about.
 */
export const ZONE_CHOICES: readonly { value: string; label: string }[] = Object.keys(ZONE_WORDS)
  .map((value) => ({ value, label: ZONE_WORDS[value] as string }))
  // One row per set of words: "Central European Time" is offered once, not fifteen times, and the
  // value kept is the first key declared for it, which is the largest city in that zone.
  .filter((choice, i, all) => all.findIndex((c) => c.label === choice.label) === i)
  .sort((a, b) => a.label.localeCompare(b.label))
