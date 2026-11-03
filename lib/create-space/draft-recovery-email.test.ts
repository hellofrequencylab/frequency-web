import { describe, expect, it } from 'vitest'
import { DRAFT_EMAIL_BANNED_WORDS, buildDraftReminderEmail, type DraftReminderParts } from './draft-recovery-email'
import { DRAFT_REMINDER_KINDS } from './draft-recovery'

// LIVE-1968: the three reminder emails, built from fixtures the way the cron builds them.

const parts = (over: Partial<DraftReminderParts> = {}): DraftReminderParts => ({
  kind: 'draft_1h',
  to: 'sam@example.com',
  firstName: 'Sam',
  name: 'Limewell Studio',
  handle: 'limewellstudio',
  pct: 55,
  kitLabel: 'Designer',
  stoppedAtPhotos: false,
  resumeUrl: 'https://frequencylocal.com/create-a-space?kit=designer&draft=abc',
  unsubscribeUrl: 'https://frequencylocal.com/unsubscribe?d=abc',
  ...over,
})

describe('the draft reminder emails', () => {
  it('say the handoff subjects, with the name and the handle in them', () => {
    expect(buildDraftReminderEmail(parts({ kind: 'draft_1h' })).subject).toBe('Limewell Studio is saved as a draft')
    expect(buildDraftReminderEmail(parts({ kind: 'draft_1d' })).subject).toBe('Your Spotlight is one step from ready')
    expect(buildDraftReminderEmail(parts({ kind: 'draft_3d' })).subject).toBe('Still want /limewellstudio?')
  })

  it.each(DRAFT_REMINDER_KINDS)('%s says it is a private draft, carries one button to the resume link and the unsubscribe link, with no dash', (kind) => {
    const e = buildDraftReminderEmail(parts({ kind }))
    expect(e.text).toContain('private draft')
    expect(e.html).toContain('private draft')
    expect(e.html.split(parts().resumeUrl).length).toBe(2)
    expect(e.text).toContain(parts().resumeUrl)
    expect(e.html).toContain(parts().unsubscribeUrl)
    expect(e.text).toContain('Turn these emails off: https://frequencylocal.com/unsubscribe?d=abc')
    expect(e.html).not.toContain('/settings/notifications')
    expect(e.text).not.toMatch(/[—–]/)
    expect(e.text).toContain('Hi Sam,')
  })

  it('never uses a banned word in its own copy', () => {
    for (const kind of DRAFT_REMINDER_KINDS) {
      const e = buildDraftReminderEmail(parts({ kind, name: 'X', handle: 'x', kitLabel: 'Y', firstName: null }))
      for (const w of DRAFT_EMAIL_BANNED_WORDS) expect(`${e.subject}\n${e.text}`.toLowerCase(), w).not.toMatch(new RegExp(`\\b${w}`))
      expect(e.text).toContain('Hi,')
    }
  })

  it('the one-hour email says how far along the site is', () => {
    expect(buildDraftReminderEmail(parts({ kind: 'draft_1h', pct: 75 })).text).toContain('75% built')
  })

  it('the one-day email shows the preview facts and, at the photos step, says the kit photos can stay', () => {
    const e = buildDraftReminderEmail(parts({ kind: 'draft_1d', stoppedAtPhotos: true }))
    expect(e.html).toContain('Designer theme · /limewellstudio · 55% built')
    expect(e.text).toContain('Keep the Designer photos and swap yours in later.')
    expect(buildDraftReminderEmail(parts({ kind: 'draft_1d', stoppedAtPhotos: false })).text).not.toContain('Keep the Designer photos')
  })

  it('the three-day email says still free, never held, with no countdown', () => {
    const e = buildDraftReminderEmail(parts({ kind: 'draft_3d' }))
    expect(e.text).toContain('/limewellstudio is still free.')
    expect(e.text).not.toMatch(/held for you|reserved|hurry|expires/i)
    expect(e.text).toContain('Claim /limewellstudio:')
  })
})
