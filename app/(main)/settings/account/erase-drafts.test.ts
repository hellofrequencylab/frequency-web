import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { sourceWithoutComments } from '@/test/source-shape'

// ── Wiring guard: erase-all Spark drafts reaches Settings → Account (LIVE-062 batch 3) ───
// eraseSparkDraftsAction was written for Settings (its own doc says so) and sat orphaned:
// the per-draft bin lives on /drafts, but the erase-ALL had no caller, so the posture the
// export copy promises (what we hold is visible and removable) had a hole. Source-shape,
// per the house archetype (components/messages/message-member-button.test.ts): unwiring is
// silent — Settings still renders, the control just vanishes.

// Comment- and import-free (LIVE-167): the mount and the call are pinned on code alone. `control`
// stays raw because the em-dash rule below reads the whole member-facing file, comments included.
const section = sourceWithoutComments('app/(main)/settings/account/section.tsx', { imports: true })
const control = readFileSync('app/(main)/settings/account/erase-drafts.tsx', 'utf8')
const controlCode = sourceWithoutComments('app/(main)/settings/account/erase-drafts.tsx', { imports: true })
const actions = readFileSync('lib/studio/draft-actions.ts', 'utf8')

describe('the account section mounts the control in the danger zone', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    expect(section.length).toBeGreaterThan(1000)
    expect(control.length).toBeGreaterThan(1000)
  })

  it('renders EraseDrafts inside the Danger zone, beside DeleteAccount', () => {
    expect(section).toMatch(/<EraseDrafts\b/)
    const zone = section.indexOf('Danger zone')
    expect(zone).toBeGreaterThan(-1)
    expect(section.indexOf('<EraseDrafts />')).toBeGreaterThan(zone)
    expect(section.indexOf('<DeleteAccount />')).toBeGreaterThan(zone)
  })
})

describe('the control calls the action behind the same guard shape as delete-account', () => {
  it('calls eraseSparkDraftsAction from the shared draft actions', () => {
    expect(control).toContain("'use client'")
    expect(controlCode).toMatch(/\beraseSparkDraftsAction\(\)/)
    expect(controlCode).not.toMatch(/function eraseSparkDraftsAction\b/)
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
