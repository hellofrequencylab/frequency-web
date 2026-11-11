/**
 * The benefit codes a published Hunt version offers (FH-036S). A version publishes them as
 * `policy.benefits`: a list of `{ code, label }`. A code is what a pass binding or a store offer may name, so a
 * binding can only grant what the Hunt itself published. A version with no `benefits` offers none, and a
 * binding to it is refused (`benefit_not_in_version`): safe by default.
 */
import { BENEFIT_CODE } from './pass-binding'

export type VersionBenefit = Readonly<{ code: string; label: string }>

/** Parse `policy.benefits`. Bad entries, repeats and anything past ten are dropped, never repaired. */
export function versionBenefits(policy: unknown): VersionBenefit[] {
  const raw = policy && typeof policy === 'object' ? (policy as { benefits?: unknown }).benefits : undefined
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: VersionBenefit[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const { code, label } = item as { code?: unknown; label?: unknown }
    if (typeof code !== 'string' || !BENEFIT_CODE.test(code) || seen.has(code)) continue
    seen.add(code)
    out.push({ code, label: typeof label === 'string' && label.trim() ? label.trim().slice(0, 80) : code })
    if (out.length === 10) break
  }
  return out
}
