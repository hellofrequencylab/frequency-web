// SHORT SHARE LINKS (LIVE-1960, part 3): how a link's opens read in words. PURE.

/** "No opens yet" / "1 open in the last 30 days" / "12 opens in the last 30 days". */
export function opensLabel(opens: number | null | undefined, days = 30): string | null {
  if (opens == null) return null
  if (opens <= 0) return 'No opens yet'
  return `${opens} ${opens === 1 ? 'open' : 'opens'} in the last ${days} days`
}
