import { describe, it, expect } from 'vitest'
import { checkCrmParity, surfaceFloorFailure, SURFACES } from './check-crm-parity.mjs'

// Locks the CRM / comms parity contract (ADR-817, docs/CRM-COMMS-CONTRACT.md) inside the test suite.
// checkCrmParity() reads the real repo (resolving paths from the script's own location, so it's
// cwd-independent), which is exactly the drift we want to catch.
//
// ⚠️ 2026-08-12: this file is now the ENFORCEMENT. `check:crm-parity` left the CI guards array —
// vitest AUTO-DISCOVERS `*.test.ts`, so unlike an array entry this cannot be forgotten, which is how
// check:studio came to enforce nothing for the whole life of PR #2098. `node
// scripts/check-crm-parity.mjs` still prints the friendly report.
describe('check-crm-parity (CRM / comms parity contract)', () => {
  it('refuses to measure a corpus it could not read (the non-triviality floor)', () => {
    // 🔴 MEASURED 2026-08-12: run with cwd set to an empty directory, this guard printed
    // "✓ Vera + branded send + signature + batching are single-source" and exited 0. The floor
    // lived only in the CLI block; asserting it here is what keeps it once CI stopped running the
    // CLI. "No surface read" and "every surface correct" must not produce the same verdict.
    expect(surfaceFloorFailure()).toBeNull()
    expect(SURFACES.length).toBeGreaterThanOrEqual(3)
  })

  it('every CRM surface routes through the shared comms modules; no re-inlined logic', () => {
    const { violations } = checkCrmParity()
    // A non-empty list means a surface forked its own copy — the message names the file + the fix.
    expect(violations, `\n${violations.join('\n')}\n`).toEqual([])
  })
})
