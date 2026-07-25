import { describe, it, expect } from 'vitest'
import { checkCrmParity } from './check-crm-parity.mjs'

// Locks the CRM / comms parity contract (ADR-817, docs/CRM-COMMS-CONTRACT.md) inside the test suite, so
// `pnpm test` — not just `pnpm check:crm-parity` — fails if a CRM surface stops routing through the shared
// comms modules or a shared prompt gets re-inlined. checkCrmParity() reads the real repo (resolving paths
// from the script's own location, so it's cwd-independent), which is exactly the drift we want to catch.
describe('check-crm-parity (CRM / comms parity contract)', () => {
  it('every CRM surface routes through the shared comms modules; no re-inlined logic', () => {
    const { violations } = checkCrmParity()
    // A non-empty list means a surface forked its own copy — the message names the file + the fix.
    expect(violations, `\n${violations.join('\n')}\n`).toEqual([])
  })
})
