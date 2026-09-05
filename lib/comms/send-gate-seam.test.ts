import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

// ADR-169 calls the unified send-gate "one structural seam an agent cannot route around". On
// 2026-09-04 twelve sends routed around it (meta-scan B9 H6): they called `shouldSend` — the bare
// preference bit — and so got no suppression check, no consent scope, and no per-Space/Circle mute,
// which is why "Mute a Circle or Space" had no reachable enforcement point (B9 D2). The twelve were
// migrated onto `resolveSendGate`; this test makes the thirteenth a red test instead of a finding.
//
// The rule: `shouldSend(` is CALLED in exactly two files — where it is defined and the seam that
// wraps it — and IMPORTED in exactly one. Comments are stripped first so a "why" note that names the
// old idiom is not a violation; only code is.

const ROOT = path.join(__dirname, '..', '..')
const ROOTS = ['app', 'lib', 'components', 'scripts']

/** Where a bare `shouldSend(` may appear in code. Nothing else, ever. */
const MAY_CALL = new Set(['lib/notification-preferences.ts', 'lib/comms/send-gate.ts'])
/** Where it may be imported from the preferences module. */
const MAY_IMPORT = new Set(['lib/comms/send-gate.ts'])

function tsFilesUnder(abs: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
    }
  }
  walk(abs)
  return out
}

export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

const CALL = /\bshouldSend\(/
const IMPORT = /import\s*\{[^}]*\bshouldSend\b[^}]*\}\s*from\s*'@\/lib\/notification-preferences'/

function scan(): { calls: string[]; imports: string[]; files: number } {
  const calls: string[] = []
  const imports: string[] = []
  let files = 0
  for (const root of ROOTS) {
    for (const full of tsFilesUnder(path.join(ROOT, root))) {
      const rel = path.relative(ROOT, full).split(path.sep).join('/')
      const code = stripComments(readFileSync(full, 'utf8'))
      files++
      if (CALL.test(code)) calls.push(rel)
      if (IMPORT.test(code)) imports.push(rel)
    }
  }
  return { calls, imports, files }
}

describe('the send-gate seam (ADR-169) cannot be routed around', () => {
  it('positive control: the walker sees the seam calling the preference read, and strips comments', () => {
    const { calls, imports, files } = scan()
    expect(files).toBeGreaterThanOrEqual(1500)
    expect(calls).toContain('lib/comms/send-gate.ts')
    expect(calls).toContain('lib/notification-preferences.ts')
    expect(imports).toContain('lib/comms/send-gate.ts')
    expect(CALL.test(stripComments("// the real one is `shouldSend(id, 'email', 'lifecycle')`"))).toBe(false)
    expect(CALL.test(stripComments("if (!(await shouldSend(id, 'email', 'lifecycle'))) return"))).toBe(true)
  })

  it('shouldSend( is called nowhere but its definition and the seam', () => {
    const { calls } = scan()
    const bypasses = calls.filter((f) => !MAY_CALL.has(f))
    expect(
      bypasses,
      `\nA send site calls shouldSend directly and so skips suppression, consent and the per-subject mute. Use resolveSendGate (lib/comms/send-gate.ts):\n  ${bypasses.join('\n  ')}\n`,
    ).toEqual([])
  })

  it('shouldSend is imported from the preferences module only by the seam', () => {
    const { imports } = scan()
    expect(imports.filter((f) => !MAY_IMPORT.has(f))).toEqual([])
  })
})
