import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { isUnwalledSpaceId } from '@/lib/people/associations'

// ── The SPACE WALL, and the day it stopped matching anything ─────────────────────────────────────
//
// The profile Associations panel reads through the SERVICE-ROLE client, so the RESTRICTIVE
// space-isolation policies never fire and the app-code predicate is the entire gate. That predicate
// was `space_id IS NULL` — written when null meant "not in a Space".
//
// 20260712030000_content_space_id_default_root.sql then added a BEFORE INSERT trigger stamping every
// new row's space_id to the ROOT tenant, and null quietly came to mean "written before that
// migration". Measured against production 2026-08-20: 0 of 7 circles, 0 of 20 practices, 0 of 12
// journey_plans and 1 of 59 events had a null space_id. All four tiles read zero for every member
// on the platform — and read zero the way a correct empty state does, so nothing looked broken.

describe('isUnwalledSpaceId', () => {
  const ROOT = '868b093d-ea57-4bca-b2b3-f549248582ca'
  const REAL = 'e4e224aa-966d-4cda-b748-e1209a633173'

  it('admits an unpartitioned row (the pre-trigger shape)', () => {
    expect(isUnwalledSpaceId(null, ROOT)).toBe(true)
    expect(isUnwalledSpaceId(undefined, ROOT)).toBe(true)
  })

  it('admits the ROOT tenant — the arm whose absence emptied every tile', () => {
    expect(isUnwalledSpaceId(ROOT, ROOT)).toBe(true)
  })

  it('🔴 still excludes a REAL Space, which is the whole point of the wall', () => {
    expect(isUnwalledSpaceId(REAL, ROOT)).toBe(false)
  })

  it('degrades to null-only when the root Space cannot be resolved (under-count, never over-share)', () => {
    // Pre-migration or a failed lookup. The correct failure direction for this module is to show
    // LESS, never to publish a private Space's content.
    expect(isUnwalledSpaceId(null, null)).toBe(true)
    expect(isUnwalledSpaceId(REAL, null)).toBe(false)
    expect(isUnwalledSpaceId(ROOT, null)).toBe(false)
  })

  it('never treats an arbitrary id as root by accident', () => {
    expect(isUnwalledSpaceId(REAL, REAL)).toBe(true) // only when it IS the root passed in
    expect(isUnwalledSpaceId('', ROOT)).toBe(false) // empty string is an id, not "unset"
  })
})

// ── The RSVP reminder cron's publication gate (LIVE-080) ─────────────────────────────────────────
describe('the RSVP reminder cron will not mail an unpublished event', () => {
  const cron = readFileSync('app/api/cron/event-reminders/route.ts', 'utf8').replace(/^\s*\/\/.*$/gm, '')

  it('gates its candidate select on status and removed_at, not just is_cancelled', () => {
    // A member cannot un-RSVP from an event they cannot open, so a draft or moderator-removed event
    // mailing its RSVPs is a one-way failure. The sibling cron has always gated on status; this one
    // carried is_cancelled alone.
    expect(cron).toContain("eq('is_cancelled', false)")
    expect(cron).toContain("eq('status', 'published')")
    expect(cron).toContain("is('removed_at', null)")
  })
})
