import { describe, it, expect } from 'vitest'
import { BETA_LAUNCH_EMAILS, flattenLaunchEmailText } from './launch-emails'
import { sanitizeEntityLayout } from '@/lib/entity-blocks/layout'
import { renderEmailLayout } from '@/lib/email-studio/render'
import { EMAIL_PALETTE_BLOCK_IDS } from '@/lib/entity-blocks/registry'
import { lintVoice } from './email'

// The 7 beta launch emails must each be a VALID email `EntityLayout`: every block id is a curated email-palette
// id, the layout survives sanitize with NO block dropped, its content round-trips, and it renders to non-empty
// HTML + text. Each carries a non-empty subject + preheader, and the hard voice rule (no em / en dash) holds
// across the subject, the preheader, and the flattened block body.

/** Every placed block id in an email's layout, in order. */
function placedIds(rows: { cells: string[][] }[] | undefined): string[] {
  return (rows ?? []).flatMap((r) => r.cells.flat())
}

describe('beta launch emails', () => {
  it('ships the 7 emails in launch order, each with the required fields', () => {
    const order = [
      'waitlist_confirm',
      'wave_soon',
      'invite',
      'founding_member',
      'founding_business',
      'referral_contest',
      'graduation',
    ]
    expect(BETA_LAUNCH_EMAILS.map((e) => e.key)).toEqual(order)
    for (const e of BETA_LAUNCH_EMAILS) {
      expect(e.label, `${e.key} label`).toBeTruthy()
      expect(e.phaseKey, `${e.key} phaseKey`).toBeTruthy()
      expect(e.segment, `${e.key} segment`).toBeTruthy()
      expect(e.subject.trim().length, `${e.key} subject`).toBeGreaterThan(0)
      expect(e.preheader.trim().length, `${e.key} preheader`).toBeGreaterThan(0)
      expect(Array.isArray(e.blockJson.rows), `${e.key} rows`).toBe(true)
      expect(
        e.blockJson.content && Object.keys(e.blockJson.content).length,
        `${e.key} content`,
      ).toBeGreaterThan(0)
    }
  })

  it('the two nurture emails carry the beta_waitlist segment', () => {
    for (const key of ['waitlist_confirm', 'wave_soon']) {
      const email = BETA_LAUNCH_EMAILS.find((e) => e.key === key)!
      expect(email.segment).toBe('beta_waitlist')
    }
  })

  it('uses only curated email-palette blocks, each id at most once per email', () => {
    for (const e of BETA_LAUNCH_EMAILS) {
      const ids = placedIds(e.blockJson.rows)
      expect(new Set(ids).size, `${e.key} unique ids`).toBe(ids.length)
      for (const id of ids) {
        expect(EMAIL_PALETTE_BLOCK_IDS.has(id), `${e.key} uses non-palette block "${id}"`).toBe(true)
      }
      // No orphan content bag: every content key is a placed block id.
      for (const key of Object.keys(e.blockJson.content ?? {})) {
        expect(ids, `${e.key} content key "${key}" is not placed`).toContain(key)
      }
    }
  })

  it('every blockJson survives sanitize with no block lost (ids + content round-trip)', () => {
    for (const e of BETA_LAUNCH_EMAILS) {
      const before = placedIds(e.blockJson.rows)
      const clean = sanitizeEntityLayout(e.blockJson, 'email')
      expect(clean, `${e.key} should sanitize to a non-null email layout`).not.toBeNull()
      const after = placedIds(clean!.rows)
      // No block id is dropped by sanitize (every id is a valid email-palette block).
      expect(after, `${e.key} lost a block through sanitize`).toEqual(before)
      // The authored content survives for every block that HAD a content bag (the divider carries none, so
      // it sanitizes to no bag — its id still survives in the rows, asserted above).
      for (const id of before) {
        const authored = e.blockJson.content?.[id]
        if (authored && Object.keys(authored).length) {
          expect(clean!.content?.[id], `${e.key} content for "${id}" was dropped`).toBeTruthy()
        }
      }
    }
  })

  it('renders to non-empty, inline-styled, class-free email HTML + a text alternative', () => {
    for (const e of BETA_LAUNCH_EMAILS) {
      const clean = sanitizeEntityLayout(e.blockJson, 'email')!
      const { html, text } = renderEmailLayout(clean)
      expect(html.length, `${e.key} HTML`).toBeGreaterThan(0)
      expect(text.length, `${e.key} text`).toBeGreaterThan(0)
      expect(html).toContain('<table')
      expect(html).not.toContain('class=')
    }
  })

  it('carries no em / en dash in the subject, preheader, or flattened body (voice hard rule)', () => {
    for (const e of BETA_LAUNCH_EMAILS) {
      expect(lintVoice(e.subject).hasEmDash, `${e.key} subject`).toBe(false)
      expect(lintVoice(e.preheader).hasEmDash, `${e.key} preheader`).toBe(false)
      expect(lintVoice(flattenLaunchEmailText(e)).hasEmDash, `${e.key} flattened body`).toBe(false)
    }
  })
})
