import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { sourceWithoutComments } from '@/test/source-shape'

// ── Wiring guard: the SPACE side of the host handshake reaches the event page (ADR-911 ·
// LIVE-062 batch 5) ──
// The event side (offer / accept / decline / revoke) is wired in the settings rail
// (event-host-offer-field.tsx); `requestEventHost` — the half that lets a Space ASK — had no render
// path, so a practitioner whose venue posted the event still needed an operator. Source-shape, per
// the house archetype (components/spaces/staff-preview-banner.test.ts): unwiring this is silent —
// the page still renders, the ask just disappears.

const page = readFileSync('app/(main)/events/[slug]/event-member-page.tsx', 'utf8')
// Comment- and import-free (LIVE-167): the call is the needle, never the import line.
const cta = sourceWithoutComments('app/(main)/events/[slug]/host-request-cta.tsx', { imports: true })
const actions = readFileSync('app/(main)/events/host-transfer-actions.ts', 'utf8')

describe('the event page mounts the ask-to-host CTA', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    expect(cta.length).toBeGreaterThan(1000)
  })

  it('resolves the eligible Spaces through the gate-mirroring loader, never for a manager', () => {
    expect(page).toContain('listSpacesThatCanAskToHost(event.id)')
    // THE GATE IS THE ASSERTION, NOT ITS SYNTAX. This used to pin the literal string
    // `myProfileId && !canManage ? await listSpacesThatCanAskToHost`, which broke when SCAN-301
    // moved the loader off its own serial await and into the page's existing parallel wave — a
    // change that touched WHEN it runs and nothing about WHO it runs for. So the pin now spans the
    // gate and the call while tolerating either form, and still fails the only way that matters:
    // drop `!canManage`, or hand the loader an unconditional call, and this goes red.
    expect(page).toMatch(/myProfileId && !canManage\s*\?\s*(?:await\s*)?listSpacesThatCanAskToHost/)
  })

  it('renders the CTA only when an eligible Space exists, after the claim branches', () => {
    expect(page).toContain('hostAskSpaces.length > 0 ? (')
    expect(page).toContain('<HostRequestCta eventId={event.id} spaces={hostAskSpaces} />')
    // Claim wins: an unclaimed listing settles who runs it before hosting can move.
    expect(page.indexOf('<ClaimRequestCta')).toBeLessThan(page.indexOf('<HostRequestCta'))
  })
})

describe('the CTA calls the action and follows its contract', () => {
  it('is a client island calling requestEventHost from the shared actions file', () => {
    expect(cta).toContain("'use client'")
    expect(cta).not.toMatch(/function requestEventHost\b/)
    expect(cta).toContain('await requestEventHost(eventId, spaceId)')
  })

  it('confirms before sending, naming the money consequence at the point of the click', () => {
    expect(cta).toContain('setConfirming(true)')
    expect(cta).toContain('refunds are')
    expect(cta).toContain('has to accept')
  })

  it("surfaces the action's refusal string verbatim and disables while pending", () => {
    expect(cta).toContain('setError(res.error)')
    expect(cta).toContain('disabled={pending}')
  })
})

describe('the loader mirrors the gate requestEventHost itself enforces', () => {
  it('applies the Space-type gate, the money guard, and the one-pending-offer rule', () => {
    const body = actions.slice(actions.indexOf('export async function listSpacesThatCanAskToHost'))
    expect(body).toContain('hostSpaceGateError({ type: s.type })')
    expect(body).toContain('hostTransferBlockReason(state)')
    expect(body).toContain(".eq('status', 'pending')")
  })

  it('resolves "runs the Space" as the same set callerRunsSpace consults', () => {
    const body = actions.slice(actions.indexOf('export async function listSpacesThatCanAskToHost'))
    expect(body).toContain("'owner_profile_id', profileId")
    expect(body).toContain("['editor', 'moderator', 'admin']")
  })

  it('the ask itself never auto-accepts on the Space side alone (the consent rule)', () => {
    const ask = actions.slice(actions.indexOf('export async function requestEventHost'))
    expect(ask).toContain('shouldAutoAcceptHostTransfer({ callerHostsEvent: hostsEvent, callerRunsTargetSpace: true })')
  })
})

// ── The gate that was missing (owner report 2026-09-16) ──
// The loader filtered the VIEWER'S Spaces against `state.hostSpaceId` and stopped there, which
// answers "is my Space already the host" and never "does this event have a host at all". So the ask
// appeared on a Space's own flagship event: MELD reads "Hosted by Royal Temple" at the top of the
// page and still offered a stranger the chance to take it over three lines below. The rule is that
// an event already held by a Space is not up for asking; moving it is the host's move, from the
// settings rail. Source-shape like the rest of this file, and for the same reason: losing the rule
// is silent -- nothing errors, the pitch just comes back.
describe('an event that already has a host Space is not up for asking', () => {
  const gate = sourceWithoutComments('app/(main)/events/host-transfer-actions.ts', { imports: true })

  it('is non-trivial (guards a vacuous pass)', () => {
    expect(gate.length).toBeGreaterThan(2000)
    // The loader really is in the corpus being matched, so a rename cannot pass this file silently.
    expect(gate).toContain('listSpacesThatCanAskToHost')
  })

  it('🔴 returns no Spaces at all once a host Space holds the event', () => {
    expect(
      gate,
      'listSpacesThatCanAskToHost must bail on an event whose host_space_id is set. Without it the ' +
        'page offers to take over an event that visibly names its host, to anyone who runs any ' +
        'other Space.',
    ).toMatch(/if\s*\(\s*state\.hostSpaceId\s*\)\s*return\s*\[\]/)
  })

  it('bails BEFORE it spends queries working out which Spaces the viewer runs', () => {
    // Ordering is the cheap half of the same rule: the early return sits above the owned/steward
    // lookups, so a hosted event costs one read rather than four.
    //
    // 🔴 BOTH NEEDLES ARE ASSERTED PRESENT FIRST. Written as a bare indexOf comparison this passed
    // against a mutant that DELETED the guard: a missing needle is -1, and -1 is less than every
    // real index, so the ordering read as correct precisely when the line was gone. Caught by
    // mutation-testing this file rather than by reading it.
    const guardAt = gate.indexOf('if (state.hostSpaceId) return []')
    const lookupAt = gate.indexOf("eq('owner_profile_id', profileId)")
    expect(guardAt, 'the guard must be present to be ordered').toBeGreaterThan(-1)
    expect(lookupAt, 'the owner lookup must be present to be ordered').toBeGreaterThan(-1)
    expect(guardAt).toBeLessThan(lookupAt)
  })
})
