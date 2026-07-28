import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// CHANNEL PAGE REDESIGN (ADR-864/868): the member-facing Channel page is a
// focus-area home, not a Circle. Locked here as source-shape guards (the
// programs.test.ts idiom), so a refactor cannot quietly regress the page back
// into its old single-scroll, circle-flavored form:
//   1. It composes the kit: DetailTemplate opening on the standardized header
//      element (resolveHeaderElement -> PageHero identity, ADR-793 — the same
//      grammar as the Space profile / Journey / person profile), never a
//      hand-rolled header or a parallel cover band.
//   2. The segmented body exists: Home (default) / Feed / Chapters-or-Circles /
//      About via ?tab=, server-rendered and shareable.
//   3. The tune-in gate is intact: composer only for tuned-in members, the
//      tune-in note otherwise, and the TuneIn/TunedIn toggle in the header.
//   4. The manager surface is intact: OpenAdminBarButton on channel.manage plus
//      the link into /channels/[id]/manage.
//   5. The retired circle-flavored copy ("No hub or nexus required") stays gone.
//   6. It carries its OWN scope rail (owner request, 2026-07-28: "a right column for activity,
//      upcoming event, associated circles") through DetailTemplate's `sidebar` slot, and that
//      rail is paired with the 'scoped' entry in lib/layout/page-chrome.ts so the page never
//      grows a second right column.

const src = readFileSync(
  join(__dirname, 'page.tsx'),
  'utf8',
)

describe('channel page (source shape): a Channel renders as a focus-area home', () => {
  it('composes the Detail kit: DetailTemplate opening on the standardized PageHero header', () => {
    expect(src).toContain('<DetailTemplate')
    // The hero is the ONE canonical header band (ADR-793): PageHero fed by the
    // operator-tunable header element at the entity-page defaults.
    expect(src).toContain('<PageHero')
    expect(src).toContain('resolveHeaderElement(')
    expect(src).toMatch(/defaults: \{ layout: 'identity', height: 'standard' \}/)
    expect(src).toContain('variant={header.layout}')
    expect(src).toContain('size={header.height}')
    expect(src).toContain('overlayStyle={header.overlayStyle}')
    // On-cover secondary actions use the ONE glassy on-ink header-button style.
    expect(src).toContain('HERO_ACTION_CLASS')
    // The retired parallel cover band stays gone.
    expect(src).not.toContain('<ChannelCover')
    expect(src).toMatch(/back=\{\{ href: '\/channels', label: 'Channels' \}\}/)
  })

  it('ships the segmented body: Home / Feed / Chapters-or-Circles / About tabs via ?tab=', () => {
    expect(src).toContain("searchParams: Promise<{ tab?: string }>")
    expect(src).toContain("label: 'Home'")
    expect(src).toContain("label: 'Feed'")
    expect(src).toContain("label: 'About'")
    // The directory tab's label follows the channel kind (Chapters for Programs).
    expect(src).toContain('label: groupNounPlural')
    // Both param spellings resolve to the one directory tab.
    expect(src).toContain("rawTab === 'chapters' || rawTab === 'circles'")
  })

  it('keeps the tune-in gate: composer for tuned-in members, note otherwise, toggle in the header', () => {
    expect(src).toContain('isTunedIn ? (')
    expect(src).toContain('<Composer')
    expect(src).toContain('Tune in to post and follow this forum from your feed.')
    expect(src).toContain('<TunedInButton')
    expect(src).toContain('<TuneInButton')
  })

  it('keeps the manager surface: admin-bar trigger + the /manage console link on channel.manage', () => {
    expect(src).toContain('<OpenAdminBarButton')
    expect(src).toContain("channelCaps.has('channel.manage')")
    expect(src).toContain('/manage')
  })

  it('keeps the Program split: Start a Chapter + ChaptersNearMe for Programs, Start a Circle kept for the rest', () => {
    expect(src).toContain('<StartChapterButton')
    expect(src).toContain('<ChaptersNearMe')
    expect(src).toContain('<NewCircleCompose')
  })

  it('fills the Detail `sidebar` slot with the Channel scope rail, and is registered as scoped', () => {
    expect(src).toContain('<ChannelRail')
    expect(src).toContain('sidebar={')
    // The rail is fed the Circles the page already loaded (no second read) and the tab, so it
    // can drop the directory module on the directory tab.
    expect(src).toContain('groups={groupCards}')
    expect(src).toContain('tab={tab}')
    // Paired with the chrome map: without this the page would render TWO right columns.
    const chrome = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'lib', 'layout', 'page-chrome.ts'),
      'utf8',
    )
    expect(chrome).toContain('/^\\/channels\\/[^/]+$/')
  })

  it('retired the circle-flavored empty-state copy', () => {
    expect(src).not.toContain('No hub or nexus required')
    // The hub-framed replacement leads with what a Channel IS.
    expect(src).toContain('A Channel gathers the Circles practicing it.')
  })
})
