import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { FINGERPRINTS, CONTROL, SHELL_ENTRY, BUDGET_KB, FRONT_DOOR_ENTRIES } from './check-shell-weight.mjs'

// THE SCAN ROOT IS NOT A CONSTANT, AND ASSUMING IT WAS COST A BUILD'S WORTH OF SIGNAL.
//
// `findableInBuild` used to glob a hardcoded `static/chunks/**/*.js`. On Vercel that directory does
// not exist: the deployment adapter sets `supportsImmutableAssets`, which relocates client chunks to
// `static/immutable/chunks/`. A local `next build` does not set the flag, so the glob worked on a
// laptop and matched NOTHING on every real deploy — making Arm B, the arm with teeth, unable to be
// true. The gate then blamed whichever fingerprint it checked first.
//
// These tests run the real script against fixture artifacts in BOTH layouts. They are the reason to
// trust the fix beyond reading it: the failing case is reproduced, not described.
//
// ⚠️ The fixtures deliberately place the fingerprint literals in a chunk the shell does NOT name, and
// the control literal in one it does. That is the exact discrimination Arm B exists to make, so a
// fixture that blurred it would pass for the wrong reason.

const SHELL_FILE = 'shell-abc.js'
const LAZY_FILE = 'lazy-def.js'
const DOOR_FILE = 'door-ghi.js'

type Door = { label: string; entry: string; budgetKb: number }
const doors = FRONT_DOOR_ENTRIES as Door[]

/** Build a fake `.next` whose client chunks live under `root`, and return the directory to run in.
 *
 *  The fixture also carries the REAL fingerprint source files at their real relative paths, because
 *  the script resolves them against `process.cwd()` and checks each one exists and still contains its
 *  literal. Copying them keeps those two arms honest instead of stubbing them out — a fixture that
 *  faked the sources would pass even if a fingerprint had been edited away in the repo.
 *
 *  It also names every FRONT_DOOR_ENTRIES entry (Arm D, LIVE-499), because the gate refuses an
 *  artifact in which a front door weighs nothing — the same non-vacuity rule the shell entry has —
 *  and a fixture that left them out would fail every case here on that arm instead of the arm under
 *  test. `doorPadKb` pushes the FIRST door over its budget; `omitDoor` leaves one out on purpose. */
function artifact(
  root: string,
  opts: { shellExt?: string; padKb?: number; leak?: boolean; doorPadKb?: number; omitDoor?: string } = {},
): string {
  const dir = mkdtempSync(join(tmpdir(), 'shell-root-'))
  const next = join(dir, '.next')
  const shellName = opts.shellExt ? `shell-abc${opts.shellExt}` : SHELL_FILE
  mkdirSync(join(next, 'server', 'app'), { recursive: true })
  mkdirSync(join(next, root), { recursive: true })

  for (const rel of [...FINGERPRINTS.map((f: { source: string }) => f.source), CONTROL.source]) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true })
    copyFileSync(join(process.cwd(), rel), join(dir, rel))
  }

  const fpLines = FINGERPRINTS.map(
    (f: { text: string }) => `console.log(${JSON.stringify(f.text)});`,
  ).join('\n')
  // The shell chunk: carries the positive control, and none of the fingerprints — unless `leak` asks
  // for the regression Arm B exists to catch, or `padKb` for the weight Arm A exists to catch.
  const pad = opts.padKb ? `var pad = ${JSON.stringify('x'.repeat(opts.padKb * 1024))};\n` : ''
  writeFileSync(
    join(next, root, shellName),
    `console.log(${JSON.stringify(CONTROL.text)});\n${opts.leak ? `${fpLines}\n` : ''}${pad}`,
  )
  // A lazily-loaded chunk: carries every fingerprint. Present in the build, absent from the shell.
  writeFileSync(join(next, root, LAZY_FILE), fpLines)
  // The front-door chunks (Arm D): one small chunk per door, the first optionally padded over budget.
  const doorFiles: Record<string, string[]> = {}
  doors.forEach((door, i) => {
    if (door.entry === opts.omitDoor) return
    const name = `${i}-${DOOR_FILE}`
    const pad = i === 0 && opts.doorPadKb ? `var pad = ${JSON.stringify('y'.repeat(opts.doorPadKb * 1024))};\n` : ''
    writeFileSync(join(next, root, name), `console.log("door ${i}");\n${pad}`)
    doorFiles[door.entry] = [`${root}/${name}`]
  })
  // The manifest, in the shape the script reads: a JS file assigning self.__RSC_MANIFEST.
  writeFileSync(
    join(next, 'server', 'app', 'page_client-reference-manifest.js'),
    `self.__RSC_MANIFEST = ${JSON.stringify({
      '/page': { entryJSFiles: { [SHELL_ENTRY]: [`${root}/${shellName}`], ...doorFiles } },
    })};\n`,
  )
  return dir
}

function run(cwd: string): { status: number; stdout: string; stderr: string } {
  const script = join(process.cwd(), 'scripts/check-shell-weight.mjs')
  const res = spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' })
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' }
}

describe('the build-wide scan follows the chunk root the build actually used', () => {
  it("passes on Vercel's layout (static/immutable/chunks) — the case that was broken", () => {
    const res = run(artifact('static/immutable/chunks'))
    expect(res.stderr).not.toContain('appears in NO built chunk')
    expect(res.status, res.stderr || res.stdout).toBe(0)
  })

  it('still passes on a local build layout (static/chunks)', () => {
    const res = run(artifact('static/chunks'))
    expect(res.status, res.stderr || res.stdout).toBe(0)
  })

  it('reports which root it scanned, on every run', () => {
    // The whole defect was invisible because nothing printed the root: a vacuous scan and a real one
    // read identically. Silence about the root is what made this cost a build.
    const res = run(artifact('static/immutable/chunks'))
    expect(res.stdout).toContain('static/immutable/chunks')
    expect(res.stdout).toMatch(/scanning \d+ built chunk/)
  })

  it('the OLD hardcoded glob would have found nothing in that layout', () => {
    // Proves the fixture reproduces the real failure rather than merely exercising the new code.
    const dir = artifact('static/immutable/chunks')
    const probe = `const {globSync}=require('node:fs');` +
      `process.stdout.write(String(globSync('static/chunks/**/*.js',{cwd:'${join(dir, '.next')}'}).length))`
    const res = spawnSync(process.execPath, ['-e', probe], { encoding: 'utf8' })
    expect(res.stdout).toBe('0')
  })

  it('fails loudly, naming the cause, when the scan does not cover the shell set', () => {
    // The control the gate never had. A shell chunk the glob cannot match (here: a .mjs extension)
    // must produce a named failure about the SCAN, not a misleading verdict about a literal.
    const res = run(artifact('static/immutable/chunks', { shellExt: '.mjs' }))
    expect(res.status).not.toBe(0)
    expect(res.stderr).toContain('does not contain')
    expect(res.stderr).toContain('chunk directory moved')
    expect(res.stderr).not.toContain('appears in NO built chunk')
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE TWO ARMS WITH TEETH, DRIVEN INTO THEIR FAILING DIRECTION.
//
// 🔴 EVERYTHING ABOVE PROVES THE SCAN IS HONEST. NONE OF IT PROVED THE GATE REJECTS ANYTHING.
// A mutation sweep over the three check-shell-weight test files found that out the hard way: with
// Arm A's `shellBytes > BUDGET_KB * 1024` replaced by `if (false)`, or Arm B's leak filter replaced
// by `[]`, or `BUDGET_KB` multiplied by ten thousand, or the positive-control arm stubbed out — all
// 39 cases stayed GREEN, one mutation at a time. The single thing this gate exists to do, refuse a
// shell that got heavier and name an operator module that walked back into every member's first
// load, had no case at all, in any of its files.
//
// The fixtures above already build a real synthetic `.next` in the layout Vercel writes, so both
// arms were already reachable from them. They only had to be pointed at the failing side, with the
// passing side kept as the paired control so a rejection cannot be about the fixture.
//
// 🔴 A RED HERE IS NEVER FIXED BY MOVING BUDGET_KB. The budget IS the consequence under test; a case
// that moved it to go green would measure nothing, which is the state this block exists to end
// (AGENTS.md: when a budget gate fires, fix the fan-out, do not raise the budget).
// ─────────────────────────────────────────────────────────────────────────────────────────────

const budgetKb = BUDGET_KB as number

describe('the gate REJECTS the two things it exists to reject', () => {
  it('Arm A · refuses a shell over the byte budget, naming the budget and the worst chunks', () => {
    const res = run(artifact('static/immutable/chunks', { padKb: budgetKb + 64 }))
    expect(
      res.status,
      `a shell of ~${budgetKb + 64} KB was ACCEPTED against this gate's own ${budgetKb} KB budget, ` +
        'so Arm A rejects nothing and the shell can grow without limit on every app/(main) route',
    ).toBe(1)
    expect(res.stderr).toContain(`over the ${budgetKb} KB budget`)
    expect(res.stderr).toContain('Biggest chunks')
  })

  it('Arm A · accepts the same artifact under the budget, so the case above is about the BYTES', () => {
    // The paired control. Without it, "rejected" could be about the fixture rather than its weight.
    const res = run(artifact('static/immutable/chunks', { padKb: 16 }))
    expect(res.status, res.stderr || res.stdout).toBe(0)
    expect(res.stdout).toContain(`under the ${budgetKb} KB budget`)
  })

  it('Arm B · refuses an admin module body found in the shell chunk, and names the module', () => {
    const res = run(artifact('static/immutable/chunks', { leak: true }))
    expect(
      res.status,
      'an admin module body sitting in the shell’s EAGER first-load JS was accepted — the exact ' +
        'regression dc47b89 fixed at a cost of 1.6 MB and ~1.3s of FCP (ADR-1066)',
    ).toBe(1)
    expect(res.stderr).toContain('EAGER first-load JS')
    expect(res.stderr).toContain(FINGERPRINTS[0].source)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ARM D · THE FRONT DOOR (LIVE-499, ADR-1536), driven into its failing direction the same way.
//
// `/` and the marketing group sit outside the member shell, so Arms A and B never weighed a
// visitor's first load. This arm holds each front-door manifest entry to its own byte ceiling, and
// these cases are the only proof it rejects anything: the same mutation sweep that found Arms A and
// B without a failing case would find this one the same way. Paired with the passing control above
// (every green case in this file now carries both doors under budget), so a red here is about the
// BYTES and never about the fixture.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('Arm D · the gate REJECTS a front door over its budget', () => {
  const door = doors[0]

  it('names every door it will weigh, and each carries a real budget', () => {
    expect(doors.length).toBeGreaterThanOrEqual(2)
    for (const d of doors) {
      expect(d.entry).toMatch(/^\[project\]\/app\//)
      expect(d.budgetKb).toBeGreaterThan(0)
    }
  })

  it('refuses a front door over its byte budget, naming the door, the budget and the worst chunks', () => {
    const res = run(artifact('static/immutable/chunks', { doorPadKb: door.budgetKb + 64 }))
    expect(
      res.status,
      `${door.label} at ~${door.budgetKb + 64} KB was ACCEPTED against its own ${door.budgetKb} KB budget, ` +
        'so Arm D rejects nothing and a visitor’s first load can grow without limit (LIVE-499)',
    ).toBe(1)
    expect(res.stderr).toContain('the front door is over budget')
    expect(res.stderr).toContain(door.label)
    expect(res.stderr).toContain(`over its ${door.budgetKb} KB budget`)
    expect(res.stderr).toContain('Biggest chunks')
    // The shell verdict is already on the log when the door fails: the arms are ordered so a red
    // door never hides the shell reading.
    expect(res.stdout).toContain(`under the ${budgetKb} KB budget`)
  })

  it('accepts the same artifact with the door under budget, and prints the reading', () => {
    const res = run(artifact('static/immutable/chunks', { doorPadKb: 8 }))
    expect(res.status, res.stderr || res.stdout).toBe(0)
    for (const d of doors) {
      expect(res.stdout).toContain(`${d.label}:`)
      expect(res.stdout).toContain(`under the ${d.budgetKb} KB budget`)
    }
  })

  it('refuses an artifact in which a front door weighs nothing, rather than passing on an empty set', () => {
    // The non-vacuity arm. A route rename that emptied a door’s manifest entry must be a named
    // failure, not a 0 KB pass — the same rule the shell entry is held to.
    const res = run(artifact('static/immutable/chunks', { omitDoor: door.entry }))
    expect(res.status).toBe(1)
    expect(res.stderr).toContain(`found no eager JS for "${door.entry}"`)
    expect(res.stderr).toContain('FRONT_DOOR_ENTRIES')
  })
})
