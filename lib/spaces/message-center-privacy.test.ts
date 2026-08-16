import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Message center email-lane privacy (ADR-863). The send action must never read members' auth
// account emails or push the whole audience through the Auth API before a cap check: it emails
// SPACE CONTACTS resolved in one batched read. This is a source-shape guard because the defect
// was a data-flow one (auth email → operator-visible send ledger) that no unit of the pure
// helpers would expose; it fails loudly if a future edit reintroduces the auth-email path.
const src = readFileSync(
  join(__dirname, '..', '..', 'app', '(main)', 'spaces', '[slug]', 'messages', 'broadcast-actions.ts'),
  'utf8',
)

describe('space message center never harvests member auth emails', () => {
  it('does not read auth account emails anywhere in the send action', () => {
    expect(src).not.toContain('getUserById')
    expect(src).not.toContain('auth.admin')
  })

  it('resolves the email audience to Space contacts', () => {
    expect(src).toContain('resolveContactEmails')
    // The contact resolver reads the contacts table scoped to a space.
    expect(src).toMatch(/from\('contacts'\)[\s\S]{0,120}space_id/)
  })

  // Per-space contact tenancy (ADR-624) makes a TENANT space's contacts profile_id NULL by
  // law, so a lane that filters this space's contacts by profile_id matches nothing and the
  // email channel silently reaches no one. The join must be on the address, which is the key
  // every contact writer actually uses. Source-shape again, for the same reason as above: the
  // defect was a data-model one that no unit of a pure helper would expose.
  it('joins the sending space to its contacts by email, never by profile_id', () => {
    expect(src).toContain('pairSpaceContacts')
    // The read scoped to the SENDING space selects on email...
    expect(src).toMatch(/eq\('space_id', spaceId\)[\s\S]{0,80}in\('email'/)
    // ...and profile_id is only ever used against the ROOT lane, never the sending space.
    expect(src).not.toMatch(/eq\('space_id', spaceId\)[\s\S]{0,80}in\('profile_id'/)
  })

  it('no shared upfront recipient resolution runs before the per-lane cap', () => {
    // The old code resolved the FULL audience (one auth call each) before any lane; each lane
    // now resolves only what it needs (email → contacts; DM → bulk-dm, capped-then-resolved).
    expect(src).not.toContain('resolveRecipients(')
  })
})
