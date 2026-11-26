// A PENCIL WHOSE DATES HAVE ALL PASSED (SCAN-1340, clarity audit 2026-11-25). A Pencil holds candidate
// dates for something not yet decided. Once every one of those dates is behind the Space's today, it is
// no longer "in the works": nobody picked a date and the moment went by. Production held 38 of them on
// one Space for two months, filling the Plans views and the Console Work page. This is the one rule
// both read, so the calendar and Work never disagree about what still counts as live.
//
// Pure: day keys in, a boolean out. A Pencil with no dates is not "passed" (it needs a date instead),
// and only a Pencil can pass this way; a Plan in Planning or Production with old dates is still work.

export function isPastPencil(stage: string, dayKeys: readonly string[], todayKey: string): boolean {
  if (stage !== 'pencil' || dayKeys.length === 0) return false
  return dayKeys.every((d) => d < todayKey)
}
