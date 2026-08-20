import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ── Wiring guard: erase-all Spark drafts reaches Settings → Account (LIVE-062 batch 3) ───
// eraseSparkDraftsAction was written for Settings (its own doc says so) and sat orphaned:
// the per-draft bin lives on /drafts, but the erase-ALL had no caller, so the posture the
// export copy promises (what we hold is visible and removable) had a hole. Source-shape,
// per the house archetype (components/messages/message-member-button.test.ts): unwiring is
// silent — Settings still renders, the control just vanishes.

const section = readFileSync('app/(main)/settings/account/section.tsx', 'utf8')
const control = readFileSync('app/(main)/settings/account/erase-drafts.tsx', 'utf8')
const actions = readFileSync('lib/studio/draft-actions.ts', 'utf8')

describe('the account section mounts the control in the danger zone', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    expect(section.length).toBeGreaterThan(1000)
    expect(control.length).toBeGreaterThan(1000)
  })

  it('renders EraseDrafts inside the Danger zone, beside DeleteAccount', () => {
    expect(section).toContain("from './erase-drafts'")
    const zone = section.indexOf('Danger zone')
    expect(zone).toBeGreaterThan(-1)
    expect(section.indexOf('<EraseDrafts />')).toBeGreaterThan(zone)
    expect(section.indexOf('<DeleteAccount />')).toBeGreaterThan(zone)
  })
})

describe('the control calls the action behind the same guard shape as delete-account', () => {
  it('calls eraseSparkDraftsAction from the shared draft actions', () => {
    expect(control).toContain("'use client'")
    expect(control).toContain("from '@/lib/studio/draft-actions'")
    expect(control).toContain('await eraseSparkDraftsAction()')
  })

  it('is armed by type-to-confirm, mirroring the delete-account row', () => {
    // The sibling's exact guard: a destructive control in this section cannot fire on a
    // stray tap, and the two rows read the same way.
    expect(control).toContain("confirm.trim().toUpperCase() === 'ERASE'")
    expect(control).toContain('disabled={!armed || pending}')
  })

  it('says exactly what happens and stays on voice', () => {
    expect(control).toContain('cannot be undone')
    // CONTENT-VOICE hard rule: no em dashes anywhere in the member-facing file.
    expect(control).not.toContain('—')
  })
})

describe('the action contract the control relies on holds', () => {
  it('self-scopes to the session and erases through the store', () => {
    const body = actions.slice(actions.indexOf('export async function eraseSparkDraftsAction'))
    expect(body).toContain('await getMyProfileId()')
    expect(body).toContain('return eraseStagedDrafts(profileId)')
    // The id comes from the SESSION, never from the client: the action takes no arguments.
    expect(body).toContain('eraseSparkDraftsAction(): Promise<number>')
  })
})
