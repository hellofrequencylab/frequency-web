import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

// ── ANONYMOUS SIGN-INS: ONE PROJECT, ONE ANSWER (ADR-1054, resonance ADR-019) ──────────────────
//
// 🔴 THE CONFLICT THIS CLOSES, WHICH WAS LIVE FOR MONTHS. Two plans asked for opposite settings
// on the SAME Supabase project. Frequency's advisor triage said DISABLE anonymous sign-ins (it
// never calls `signInAnonymously`, so the setting was pure unused attack surface). `resonance/`'s
// ADR-015 said "Requires 'Anonymous sign-ins' enabled in the project's Auth settings" — and
// resonance ADR-008 puts it INSIDE Frequency's project, because the org is on the free plan with
// both project slots used. One Auth config, two claims on it, and nothing that could notice.
//
// It settled toward disabled: the 2026-08-17 advisor run returned 164 findings and zero
// `auth_allow_anonymous_sign_ins` (that lint fires only when the setting is ON), while the June
// sweeps recorded it firing 136-147 times. So the requirement resonance/ carried was already
// unmeetable, and three of its surfaces were rendering "Enable Anonymous sign-ins in the Supabase
// project's Auth settings" — an instruction to reconfigure the LIVE platform's project, shown to
// whoever opened a dev route.
//
// ⚠️ WHY A TEST AND NOT A DOC. The conflict survived because BOTH sides were prose. The disable
// was never an ADR (it came from advisor triage + an owner action), so a second plan could
// contradict it indefinitely without tripping anything. A sentence cannot notice a contradicting
// sentence. This can.
//
// ⚠️ WHAT IT MEASURES: the CONSEQUENCE on both sides of the seam, not the words of the decision.
//   1. Frequency DECLARES the setting off               (supabase/config.toml)
//   2. Frequency's own tree never calls signInAnonymously
//   3. resonance/'s call site is GATED on a declared capability that defaults OFF
//   4. the maintenance sweep stays ARMED for the advisory (not on the accepted list)
//   5. no UI/doc string tells a reader to flip it on the shared project
//
// Reading resonance/ as TEXT is not an isolation-contract violation (rule 6 forbids importing its
// code). Nothing here imports from resonance/, and root vitest still excludes `resonance/**` from
// collection. The conflict is inherently cross-boundary — it is about a project both sides share —
// so the guard has to be able to see both sides, and this is the repo that owns the project config.

const ROOT = path.join(import.meta.dirname, '..')

/** The env var resonance/ uses to declare that ITS project grants anonymous sign-in. */
const CAPABILITY_ENV = 'NEXT_PUBLIC_RESONANCE_ANONYMOUS_AUTH'

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
  'resonance', // has its own build; scanned explicitly below, never as part of Frequency's tree
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

describe('anonymous sign-ins: resonance/ asks instead of assuming (resonance ADR-019)', () => {
  it('exports a capability predicate that defaults OFF (exact opt-in)', () => {
    const config = read('resonance/lib/config.ts')
    expect(config).toContain('export function standaloneAnonymousAuthEnabled()')
    // The comparison shape IS the default: `=== "true"` is opt-in, `!== "false"` would be
    // opt-out and would make the gate cosmetic.
    expect(config).toMatch(
      new RegExp(`process\\.env\\.${CAPABILITY_ENV}\\s*===\\s*["']true["']`),
    )
    expect(config).not.toMatch(new RegExp(`process\\.env\\.${CAPABILITY_ENV}\\s*!==`))
  })

  it('gates every signInAnonymously call site on that predicate', () => {
    // ⚠️ THIS ASSERTION WAS VACUOUS ON ITS FIRST DRAFT, and the mutation run caught it. It
    // checked that the file CONTAINS "standaloneAnonymousAuthEnabled" — which the import line
    // and the doc comment satisfy on their own, so deleting the actual early return still
    // passed. Presence of a name is not evidence of a gate. It now strips comments and requires
    // the guard's SHAPE to appear BEFORE the call, in executable code.
    const callSites = sourceFilesUnder('resonance').filter((f) =>
      /signInAnonymously/.test(stripComments(read(f))),
    )
    // Non-vacuity the other way: if the call vanished entirely, the loop would pass over nothing.
    expect(callSites.length).toBeGreaterThan(0)

    const GUARD = /if\s*\(\s*!\s*standaloneAnonymousAuthEnabled\s*\(\s*\)\s*\)\s*return/
    for (const file of callSites) {
      const code = stripComments(read(file))
      const guardAt = code.search(GUARD)
      const callAt = code.indexOf('signInAnonymously')
      expect(guardAt, `${file}: no \`if (!standaloneAnonymousAuthEnabled()) return\` guard`).toBeGreaterThan(-1)
      expect(guardAt, `${file}: the capability guard must come BEFORE signInAnonymously`).toBeLessThan(callAt)
    }
  })

  it('ships the capability blank in .env.example, so a fresh clone is off by default', () => {
    const env = read('resonance/.env.example')
    expect(env).toMatch(new RegExp(`^${CAPABILITY_ENV}=\\s*$`, 'm'))
  })

  it('neither instructs nor claims that the shared project grants anonymous sign-ins', () => {
    // Two phrasings carried this conflict, and both are banned outside the records that
    // explain them:
    //   INSTRUCTION — "Enable Anonymous sign-ins in the Supabase project's Auth settings",
    //     rendered by RoomShell, /dev/space and /dev/games. It told whoever opened a dev route
    //     to reconfigure the LIVE platform's project.
    //   CLAIM — "Requires 'Anonymous sign-ins' enabled in the project's Auth settings",
    //     ADR-015's closing sentence. A requirement stated as settled fact, in the one place a
    //     reader goes to learn what is settled.
    // Normalizing first (markdown emphasis, smart/HTML quotes) so `**"Anonymous sign-ins"**`
    // cannot slip past a pattern written against the plain form.
    const INSTRUCTION = /enable anonymous sign-ins[^.]{0,60}supabase project/
    const CLAIM = /requires anonymous sign-ins enabled/

    const EXEMPT = new Set([
      'resonance/docs/DECISIONS.md', // ADR-015's amendment quotes the retired requirement
      'resonance/docs/ISOLATION.md', // rule 8 quotes it to explain what it forbids
    ])
    const surfaces = [
      ...sourceFilesUnder('resonance/app'),
      ...sourceFilesUnder('resonance/components'),
      ...sourceFilesUnder('resonance/lib'),
      ...docsUnder('resonance/docs'),
    ].filter((f) => !EXEMPT.has(f))
    // Non-vacuity: the filter must not have emptied the set.
    expect(surfaces.length).toBeGreaterThan(20)

    const offenders = surfaces.filter((f) => {
      const text = normalize(read(f))
      return INSTRUCTION.test(text) || CLAIM.test(text)
    })
    expect(offenders).toEqual([])

    // And the exemptions must be EARNED, not decoration: each exempt file has to actually
    // contain the banned phrasing. An exemption for a file that never trips is a standing
    // hole nobody would notice opening.
    for (const f of EXEMPT) {
      const text = normalize(read(f))
      expect(
        INSTRUCTION.test(text) || CLAIM.test(text),
        `${f} is exempt but no longer quotes the banned phrasing — drop the exemption`,
      ).toBe(true)
    }
  })
})

/** Drop `//` and block comments so a guard's NAME in prose cannot stand in for the guard.
 *  Deliberately crude (it does not model strings or regex literals) — for these files that is
 *  fine, and erring toward removing too much can only make the assertions stricter, never
 *  laxer: a call or a guard that got eaten reads as absent, which fails. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Lowercase, and flatten the decorations a phrase can hide behind: markdown emphasis, smart
 *  quotes, HTML entities, backticks, and wrapped lines. `**"Anonymous sign-ins"**` and
 *  `Anonymous sign-ins` must read the same to a pattern written against the plain form. */
function normalize(src: string): string {
  return src
    .replace(/&apos;|&#39;|&quot;/g, "'")
    .replace(/[*_`"'“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function docsUnder(rel: string): string[] {
  const abs = path.join(ROOT, rel)
  if (!existsSync(abs)) return []
  return readdirSync(abs)
    .filter((n) => n.endsWith('.md'))
    .map((n) => path.join(rel, n))
}
