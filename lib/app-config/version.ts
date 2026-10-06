// App build versions (LIVE-722): parse and compare the dotted versions an app build reports
// (`1.4.2`). Pure, so the route and its test share it.

/** `1.4.2` → [1, 4, 2]. Null for anything that is not 1 to 4 dot-separated integers. */
export function parseVersion(raw: string | null | undefined): number[] | null {
  const v = raw?.trim()
  if (!v || !/^\d{1,6}(\.\d{1,6}){0,3}$/.test(v)) return null
  return v.split('.').map(Number)
}

/** Negative when a < b, zero when equal, positive when a > b. Missing parts count as 0. */
export function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/** Is `version` below `min`? An unparseable version is never told to update (it is not a build
 *  this server knows how to judge); an unparseable minimum requires nothing. */
export function belowMinimum(version: string | null | undefined, min: string | null | undefined): boolean {
  const v = parseVersion(version)
  const m = parseVersion(min)
  if (!v || !m) return false
  return compareVersions(v, m) < 0
}
