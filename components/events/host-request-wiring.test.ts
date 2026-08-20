import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ── Wiring guard: the SPACE side of the host handshake reaches the event page (ADR-911 ·
// LIVE-062 batch 5) ──
// The event side (offer / accept / decline / revoke) is wired in the settings rail
// (event-host-offer-field.tsx); `requestEventHost` — the half that lets a Space ASK — had no render
// path, so a practitioner whose venue posted the event still needed an operator. Source-shape, per
// the house archetype (components/spaces/staff-preview-banner.test.ts): unwiring this is silent —
// the page still renders, the ask just disappears.

const page = readFileSync('app/(main)/events/[slug]/page.tsx', 'utf8')
const cta = readFileSync('app/(main)/events/[slug]/host-request-cta.tsx', 'utf8')
const actions = readFileSync('app/(main)/events/host-transfer-actions.ts', 'utf8')

describe('the event page mounts the ask-to-host CTA', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    expect(cta.length).toBeGreaterThan(1000)
  })

  it('resolves the eligible Spaces through the gate-mirroring loader, never for a manager', () => {
    expect(page).toContain('listSpacesThatCanAskToHost(event.id)')
    expect(page).toContain('myProfileId && !canManage ? await listSpacesThatCanAskToHost')
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
    expect(cta).toContain("from '@/app/(main)/events/host-transfer-actions'")
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
