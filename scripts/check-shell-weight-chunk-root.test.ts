import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { FINGERPRINTS, CONTROL, SHELL_ENTRY } from './check-shell-weight.mjs'

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

/** Build a fake `.next` whose client chunks live under `root`, and return the directory to run in.
 *
 *  The fixture also carries the REAL fingerprint source files at their real relative paths, because
 *  the script resolves them against `process.cwd()` and checks each one exists and still contains its
 *  literal. Copying them keeps those two arms honest instead of stubbing them out — a fixture that
 *  faked the sources would pass even if a fingerprint had been edited away in the repo. */
function artifact(root: string, opts: { shellExt?: string } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'shell-root-'))
  const next = join(dir, '.next')
  const shellName = opts.shellExt ? `shell-abc${opts.shellExt}` : SHELL_FILE
  mkdirSync(join(next, 'server', 'app'), { recursive: true })
  mkdirSync(join(next, root), { recursive: true })

  for (const rel of [...FINGERPRINTS.map((f: { source: string }) => f.source), CONTROL.source]) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true })
    copyFileSync(join(process.cwd(), rel), join(dir, rel))
  }

  // The shell chunk: carries the positive control, and none of the fingerprints.
  writeFileSync(join(next, root, shellName), `console.log(${JSON.stringify(CONTROL.text)});\n`)
  // A lazily-loaded chunk: carries every fingerprint. Present in the build, absent from the shell.
  writeFileSync(
    join(next, root, LAZY_FILE),
    FINGERPRINTS.map((f: { text: string }) => `console.log(${JSON.stringify(f.text)});`).join('\n'),
  )
  // The manifest, in the shape the script reads: a JS file assigning self.__RSC_MANIFEST.
  writeFileSync(
    join(next, 'server', 'app', 'page_client-reference-manifest.js'),
    `self.__RSC_MANIFEST = ${JSON.stringify({
      '/page': { entryJSFiles: { [SHELL_ENTRY]: [`${root}/${shellName}`] } },
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
