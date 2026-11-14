/** Client-safe membership over the server's authored support projection; no taxonomy or reward inference. */
export function practiceMatchesSupports(
  practice: { pillarId: string | null; supportIds?: readonly string[] },
  selected: ReadonlySet<string>,
): boolean {
  if (selected.size === 0) return true
  const supports = practice.supportIds ?? (practice.pillarId ? [practice.pillarId] : [])
  return supports.some((id) => selected.has(id))
}
