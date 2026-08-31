import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { FUNNEL_STYLES, funnelStyle } from '@/lib/funnels/styles'
import { getFunnel, FUNNELS, funnelGrant } from '@/lib/funnels/definitions'
import { patternBySlug } from '@/lib/on-air'
import { getTrait } from '@/lib/traits/registry'
import { isTrackedEvent } from '@/lib/analytics/events'

// The breathwork FEATURE funnel (ADR-619) is the first playable front door. These lock the contract
// the renderer + signup pipeline depend on, so a refactor can't silently unwire it.
describe('breathwork feature funnel — the wiring contract', () => {
  it('registers as a code sequence with the feature style + box demo', () => {
    const seq = getFunnel('breathwork')
    expect(seq.slug).toBe('breathwork')
    expect(seq.style).toBe('feature')
    expect(seq.feature?.feature).toBe('breathwork')
    // The demo pattern must resolve to a real breath pattern (box = In-4/Hold-4/Out-4/Hold-4).
    const pattern = patternBySlug(seq.feature?.pattern)
    expect(pattern.slug).toBe('box')
    expect(pattern.phases).toHaveLength(4)
  })

  it('lands the finisher ON THE TIMER (a real round starts a real streak)', () => {
    // 🔴 AMENDED for LIVE-134. This asserted `/feed?welcome=vera` — the destination the funnel
    // shipped with, and the defect itself: the button says "Get a Free Timer" and the flow ended
    // on the community feed. The test was not wrong about its INTENT ("a real round starts a real
    // streak") — a real round is exactly what /on-air is for, and the feed was never where one
    // could be taken. See the LIVE-134 block at the foot of this file for the other half.
    const seq = getFunnel('breathwork')
    expect(seq.destination).toEqual({ mode: 'direct', url: '/on-air' })
  })

  it('its marketing tag is registered, so signup attribution is not skipped', () => {
    const seq = getFunnel('breathwork')
    expect(seq.marketingTag).toBe('beta_breathwork')
    expect(getTrait('beta_breathwork')).toBeTruthy()
  })

  it('advertises 25 Zaps and confers them as a real join grant (the invitation payoff)', () => {
    const seq = getFunnel('breathwork')
    expect(seq.feature?.zapsReward).toBe(25)
    // The "join now, get 25 Zaps" promise is honored server-side at completion.
    expect(funnelGrant('breathwork')?.zaps).toBe(25)
  })

  it('the funnel analytics events it fires are in the taxonomy and client-emittable', () => {
    expect(isTrackedEvent('onboarding.funnel_entered')).toBe(true)
    expect(isTrackedEvent('onboarding.funnel_captured')).toBe(true)
  })

  it('exposes breathwork under FUNNELS', () => {
    expect(FUNNELS.breathwork).toBeDefined()
  })
})

// The Feature STYLE is live now that its renderer ships (the Funnels page reads this to move it
// out of the "planned" placeholders into a real section).
describe('funnel-styles registry — feature is live', () => {
  it('feature style is marked live', () => {
    expect(funnelStyle('feature').status).toBe('live')
  })
  it('onboarding is still the default', () => {
    expect(funnelStyle(undefined).id).toBe('onboarding')
    expect(FUNNEL_STYLES.some((s) => s.id === 'demographic' && s.status === 'planned')).toBe(true)
  })
})

// ── LIVE-134: THE FUNNEL MUST END ON THE TIMER, WITH SOMETHING TO RUN ───────────────────────────
//
// 🔴 THE BUG. The button that gets someone into this funnel says "Get a Free Timer"
// (app/join/(induction)/feature-funnel.tsx:325) and the flow finished at `/feed?welcome=vera` —
// the community feed. A person who asked for a breathwork timer landed on a social feed, which is
// the "I tried to download it and it took me to something else" the owner was reported. The
// original ADR listed the deep-link as an open follow-up and it was never taken.
//
// THE FIX IS TWO HALVES AND BOTH ARE ASSERTED HERE, because either alone is still broken:
// app/(main)/on-air/page.tsx renders "Nothing on your list yet — adopt a practice first" when the
// member holds no practices, so repointing the destination WITHOUT granting a practice swaps the
// wrong landing for an emptier one.
describe('LIVE-134 — the breathwork funnel finishes on the timer', () => {
  it('lands on /on-air, and never back on the feed', () => {
    const dest = getFunnel('breathwork').destination
    expect(dest).toEqual({ mode: 'direct', url: '/on-air' })
    // The exact string it must never return to.
    expect(JSON.stringify(dest)).not.toContain('/feed')
  })

  it('🔴 and grants a practice, so the timer it lands on has something to run', () => {
    expect(funnelGrant('breathwork')?.practiceSlug).toBe('box-breath')
  })

  it('grants the practice by SLUG, not a uuid — this module has no database', () => {
    // A uuid here would be an unresolvable magic string no reader could check, and a renamed or
    // re-created practice would silently point at nothing. The slug resolves at completion.
    const slug = funnelGrant('breathwork')?.practiceSlug ?? ''
    expect(slug).toMatch(/^[a-z0-9-]+$/)
    expect(slug).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i)
  })

  it('keeps the 25-Zap promise the funnel advertises', () => {
    // A negative control on the edit above: repointing the destination must not have disturbed
    // the grant that was already there.
    expect(funnelGrant('breathwork')?.zaps).toBe(25)
  })
})

// ── THE COPY MUST NOT PROMISE A FILE (2026-08-31) ────────────────────────────────────────────────
//
// The buttons read "Get a Free Timer" and "Keep my timer". Someone opened the funnel in Instagram's
// in-app browser, read that as a DOWNLOAD, and there is no file anywhere: the timer is an in-app
// surface at /on-air. The sentences either side of the first button were already honest — "This
// timer is your invitation into the Frequency beta" above it, "Where should we send your
// invitation?" below — so the button was the only part disagreeing with its own beat.
//
// Checked against docs/CONTENT-VOICE.md: "get" and "send" are §5a plain verbs; "invitation" appears
// on no avoid list; and §5d bans "unlock", which was the first replacement considered and rejected.
describe('the funnel copy promises an invitation, not a download', () => {
  const funnel = readFileSync('app/join/(induction)/feature-funnel.tsx', 'utf8')
  /** The rendered copy, with the comments stripped — they quote the old labels on purpose. */
  const copy = funnel.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')

  it('🔴 neither button implies a thing you receive and keep', () => {
    expect(copy).not.toContain('Get a Free Timer')
    expect(copy).not.toContain('Keep my timer')
    expect(copy).toContain('Get my invitation')
    expect(copy).toContain('Send my invitation')
  })

  it('and the honest sentences that framed them are untouched', () => {
    // The fix was to make the buttons agree with these, not to rewrite the beat.
    expect(copy).toContain('This timer is your invitation into the Frequency beta.')
    expect(copy).toContain('Where should we send your invitation?')
  })

  it('no hype word from CONTENT-VOICE §5d creeps in as the replacement', () => {
    // "Unlock the timer" was the first replacement reached for, and §5d bans it outright. This is
    // the guard against reaching for it again.
    //
    // 🔴 SCOPED TO RENDERED TEXT, and the first version was not. Matching the whole file flagged
    // `const unlock = () => {` — the audio-autoplay gesture handler on line 264. §5d bans a word
    // in COPY, not an identifier, and a guard that cannot tell them apart would either be
    // permanently red or force a rename of unrelated code to satisfy a style rule about prose.
    const rendered = (copy.match(/>[^<>{}]+</g) ?? []).join(' ')
    for (const banned of ['Unlock', 'unlock', 'Elevate', 'Level up', 'supercharge', 'optimize']) {
      expect(rendered, `§5d bans "${banned}" in copy`).not.toContain(banned)
    }
    // The control: the assertion is reading real copy, not an empty string.
    expect(rendered).toContain('Get my invitation')
  })

  it('the eyebrow still names the thing plainly, because that part was never wrong', () => {
    // "Free breathwork timer" is accurate and concrete (§5a). The defect was the VERB, not the noun.
    expect(copy).toContain('Free breathwork timer')
  })
})
