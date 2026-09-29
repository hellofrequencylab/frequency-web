import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

// ── ANONYMOUS SIGN-INS: ONE PROJECT, ONE ANSWER (ADR-1054) ─────────────────────────────────────
//
// 🔴 THE CONFLICT THIS CLOSED, WHICH WAS LIVE FOR MONTHS. Two plans asked for opposite settings
// on the SAME Supabase project. Frequency's advisor triage said DISABLE anonymous sign-ins (it
// never calls `signInAnonymously`, so the setting was pure unused attack surface). The standalone
// Resonance app, then nested in this repo, said in its ADR-015 "Requires 'Anonymous sign-ins'
// enabled in the project's Auth settings", and its ADR-008 put it INSIDE Frequency's project,
// because the org was on the free plan with both project slots used. One Auth config, two claims
// on it, and nothing that could notice.
//
// It settled toward disabled: the 2026-08-17 advisor run returned 164 findings and zero
// `auth_allow_anonymous_sign_ins` (that lint fires only when the setting is ON), while the June
// sweeps recorded it firing 136-147 times.
//
// ⚠️ WHY A TEST AND NOT A DOC. The conflict survived because BOTH sides were prose. The disable
// was never an ADR (it came from advisor triage + an owner action), so a second plan could
// contradict it indefinitely without tripping anything. A sentence cannot notice a contradicting
// sentence. This can.
//
// ⚠️ WHAT IT MEASURES: the CONSEQUENCE on Frequency's side of the seam, not the words of the
// decision.
//   1. Frequency DECLARES the setting off               (supabase/config.toml)
//   2. Frequency's own tree never calls signInAnonymously
//   3. the maintenance sweep stays ARMED for the advisory (not on the accepted list)
//
// The other claimant left this repo on 2026-09-29 (ADR-1580): the Resonance app now lives in
// hellofrequencylab/development as apps/resonance, in its own `resonance` schema under its own
// `resonance_app` role. The arms that read its tree as text (the capability predicate that
// defaulted OFF, the guard before its signInAnonymously call, the blank env var in its
// .env.example) went with it: a guard that reads a path which is gone reads nothing. That the
// claimant is no longer in this tree at all is what HYG-005's and DEF-RESON's probes measure.
// NOT to be confused with Frequency's own Resonance CRM (lib/resonance/*), which is scanned below
// like any other lib module.

const ROOT = path.join(import.meta.dirname, '..')

/** The advisory that fires when the setting is on. It must stay OFF the accepted list. */
const ADVISORY = 'auth_allow_anonymous_sign_ins'

const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.claude',
  'dist',
  'coverage',
])

/** Every source file under `rel`, in pure Node. No `rg`, no shell: a guard that cannot tell
 *  "I looked and found nothing" from "I could not look" is the failure mode this repo has
 *  already shipped once (see scripts/check-backlog.mjs). */
function sourceFilesUnder(rel: string, acc: string[] = []): string[] {
  const abs = path.join(ROOT, rel)
  if (!existsSync(abs)) return acc
  if (statSync(abs).isFile()) {
    acc.push(rel)
    return acc
  }
  for (const name of readdirSync(abs)) {
    if (SKIP_DIRS.has(name)) continue
    const child = path.join(rel, name)
    const childAbs = path.join(ROOT, child)
    if (statSync(childAbs).isDirectory()) sourceFilesUnder(child, acc)
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) acc.push(child)
  }
  return acc
}

describe('anonymous sign-ins: Frequency keeps them off (ADR-1054)', () => {
  it('declares enable_anonymous_sign_ins = false in supabase/config.toml', () => {
    const toml = read('supabase/config.toml')
    // Anchored per line so a commented-out example cannot satisfy it.
    expect(toml).toMatch(/^enable_anonymous_sign_ins\s*=\s*false\s*$/m)
    expect(toml).not.toMatch(/^enable_anonymous_sign_ins\s*=\s*true\s*$/m)
  })

  it('never calls signInAnonymously anywhere in Frequency source', () => {
    const roots = ['app', 'lib', 'components', 'scripts', 'proxy.ts', 'middleware.ts']
    const offenders: string[] = []
    for (const r of roots) {
      // `supabase/` is deliberately not a root here: it holds SQL plus this guard, which names
      // the symbol on purpose. If it is ever added, exempt this file.
      for (const file of sourceFilesUnder(r)) {
        if (/signInAnonymously/.test(read(file))) offenders.push(file)
      }
    }
    // Non-vacuity: the scan must actually have read a meaningful tree.
    expect(sourceFilesUnder('lib').length).toBeGreaterThan(200)
    expect(offenders).toEqual([])
  })

  it('keeps the maintenance sweep ARMED for the advisory (not silently accepted)', () => {
    const raw = read('scripts/maintenance/accepted-advisories.json')
    const doc = JSON.parse(raw) as {
      acceptedByName: Record<string, string>
      acceptedByTarget: Record<string, string[]>
    }
    // If this ever moves onto an accepted list, a re-enable goes silent — which is how the
    // conflict would reopen without anyone noticing.
    expect(Object.keys(doc.acceptedByName)).not.toContain(ADVISORY)
    expect(Object.keys(doc.acceptedByTarget)).not.toContain(ADVISORY)
    // And it stays NAMED, so the reason survives the next person to read the file.
    expect(raw).toContain(ADVISORY)
  })
})
