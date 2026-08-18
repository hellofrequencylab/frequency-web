import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Data, Metadata } from '@/lib/page-editor/types'
import { config } from '@/lib/page-editor/config'
import { BlockRender } from './block-render'

// ─────────────────────────────────────────────────────────────────────────────
// CORRECTNESS GATE — frozen golden-markup snapshots of BlockRender's output.
//
// BlockRender was PROVEN byte-identical to Puck's own `@measured/puck/rsc` <Render>
// (renderToStaticMarkup deep-equal) before the package was removed (ADR-493 Phase 2).
// With Puck gone, the golden comparison is captured as inline snapshots of the CURRENT
// BlockRender output: any future regression in the render path (slot recursion,
// metadata threading, unknown-type skipping, root wrapping) surfaces as a snapshot
// diff. The snapshots therefore stand in for the old Puck-parity assertion.
//
// The docs exercise: the config root wrapper, plain prop-driven blocks, metadata
// threading (top-level AND nested-in-slot, via LiveStats which reads
// puck.metadata.live), nested slots (Container / Columns / SpaceLayout), deep slot
// recursion, unknown-type skipping, and empty/malformed docs.
//
// All blocks chosen render purely from props/metadata (no next/link, next/image,
// router or Supabase context), so the renderer runs cleanly under
// renderToStaticMarkup with no providers.
//
// SNAPSHOT UPDATES — the point of a frozen golden is that re-baselining is an event, so
// each one is recorded here with its cause. If you are updating these because they went
// red, the cause belongs in this list before the update lands.
//
//   2026-08-05 · R7, the eyebrow sweep. `components/marketing/blocks.tsx` (LiveStats)
//     moved its eyebrow and stat labels from `tracking-[0.25em]` / `tracking-widest` onto
//     the `tracking-eyebrow` token. Markup is otherwise byte-identical: only the tracking
//     class changed, on 2 elements, and the render path was not touched.
//     Note this is a real VALUE change, not a rename — 0.25em → 0.18em — because DAWN
//     disagrees with itself about the eyebrow: readme §4 says "locked at 0.25em" while
//     tokens/typography.css declares --tracking-eyebrow: 0.18em, and DAWN's own .eyebrow
//     class reads the token, so its components have always rendered 0.18em. The token
//     wins here per the repo rule that machine-readable state beats prose, and the
//     contradiction is going back to DAWN as outbound feedback.
//
//   2026-08-05 (later, same day) · R7 finished outside `(marketing)`. The first sweep was
//     scoped to `app/(marketing)` + `components/marketing`, which left the eyebrow rendering
//     at TWO values across the product — including on the homepage and inside these very
//     blocks. A review caught it: the role was locked in the token and unlocked in the
//     product. So `components/page-editor/blocks/{kit,sections,spaces,profile}.tsx` moved
//     their `tracking-[0.25em]` / `[0.2em]` eyebrows onto `tracking-eyebrow` too, and 7 of
//     these goldens moved with them.
//     Every diff is ONE token on the `data-text-role="eyebrow"` element — verified by reading
//     each mismatch, not by trusting the count — and the render path was not touched. Same
//     0.25em → 0.18em value change as the entry above, for the same reason.
//     Re-baselining is deliberately an event: if a future diff here shows anything OTHER than
//     a tracking class on an eyebrow, it is a real regression in the render path and this log
//     is the evidence that nothing else was expected to move.
//
//   2026-08-05 (later still) · the zero-adopter sweep. `components/marketing/blocks.tsx`
//     (LiveStats) stopped hand-rolling its stat trio and composed the kit primitive
//     `components/ui/stat.tsx` instead — the twin the primitive's own header names as the
//     duplicate to retire. TWO goldens moved (the two metadata-threading cases, which are the
//     only ones that render LiveStats).
//
//     WHY PUCK-PARITY SURVIVES, checked against the invariant this file states above rather
//     than assumed. The parity assertion these snapshots stand in for is about the RENDER PATH
//     — "slot recursion, metadata threading, unknown-type skipping, root wrapping". Reading
//     both diffs element by element:
//       · Element structure is byte-identical. `<div><p>value</p><p>label</p></div>`, same
//         tags, same nesting, same order, on all three stats, in both goldens. `<Stat>` renders
//         no wrapper of its own and adds no attribute (its `className` is undefined here, so
//         React omits `class` on the div exactly as the hand-rolled version did).
//       · No attribute other than `class` changed anywhere, and no element moved.
//       · Metadata threading — the actual subject of both tests — is demonstrably intact: the
//         1,234 / 56 / 0 values still arrive from `puck.metadata.live` and still render.
//       · The surrounding markup (root wrapper, Container/Columns slot recursion, the deeply
//         nested eyebrow + heading) is untouched in both.
//     What changed is two class STRINGS per stat: the numeral moved off the literal
//     `text-6xl sm:text-7xl` pair onto the `text-stat` role (+ `tabular-nums leading-none`),
//     and the label's class SET is the same set reordered. Same shape of diff as the two R7
//     entries above — classes on leaves, render path untouched — so the golden is re-recorded
//     rather than the conversion reverted. If a future LiveStats diff shows a changed element,
//     a changed attribute, or a missing metadata-fed value, that is a real regression.
//
//   2026-08-06 · Phase 7, the marketing four-role rhythm. `Statement`
//     (`components/marketing/marketing-ui.tsx`) stopped hand-rolling `py-14 sm:py-24` and took
//     the role it IS — `.mk-tight`, whose definition in globals.css is literally "a statement or
//     a banner, short, so it does not need the full beat" — plus the `.mk-cream` / `.mk-ink`
//     tone tag that the same-tone-halving rule keys on. TWO goldens moved: the plain-blocks doc
//     and the 3-column slot doc, which are the only two that render a Statement.
//
//     THE DIFF, read element by element rather than counted. In BOTH goldens exactly one
//     `<section>` changed — Statement's — from
//         class="bg-marketing-canvas px-6 py-14 sm:py-24 "
//       to
//         class="bg-marketing-canvas mk-cream px-6 mk-tight "
//     No element was added, removed or moved; no attribute other than `class` changed anywhere;
//     the `<p>` inside Statement is byte-identical in both. In the 3-column golden the outer
//     Columns section, both sibling columns and every slot-recursion `<div>` are byte-identical,
//     so the render path this file actually guards — slot recursion, metadata threading,
//     unknown-type skipping, root wrapping — is untouched, same as the three entries above.
//
//     `mk-cream` DOES NOT SET A BACKGROUND, so it is not fighting `bg-marketing-canvas`, and
//     that was checked rather than assumed — the trap here is that `cn()` is a plain join, not
//     tailwind-merge, so two background declarations would be settled by the compiled sheet's
//     emit order and no call site could see it. Grepping the source AND the compiled sheet finds
//     `.mk-cream` / `.mk-ink` in exactly one rule,
//         .mk-cream + .mk-cream:where(…), .mk-ink + .mk-ink:where(…) { padding-top: … }
//     with no standalone `.mk-cream { }` block anywhere. They are pure adjacency MARKERS: they
//     paint nothing on the element that carries them, and only ever add padding-top to the
//     SECOND of two same-tone siblings. Both classes therefore coexist correctly.
//
//     A REAL VALUE CHANGE, and it is larger than the eyebrow one — stated plainly here because
//     there are committed pixel baselines for the marketing pages and they will need a
//     recapture (DAWN-CONVERSION §3 budgets exactly one per rendering merge).
//     `py-14 sm:py-24` is 56px / 96px per edge, frozen at two breakpoints.
//     `.mk-tight` is `clamp(3rem, 5.5vw, 3.75rem)` = 48px…60px, fluid.
//       · 390px:  48 vs 56  → −8px per edge
//       · 1280px: 60 vs 96  → −36px per edge
//     And because `.mk-tight` is now a member of the four-role family, a Statement FOLLOWED by
//     another rhythm section also picks up the double-count correction on its bottom edge
//     (`calc(var(--space-section) * 0.62)`), which the literal could never participate in.
//     Total height change for a Statement mid-page: about −22px at 390 and about −77px at 1280.
//     That is the adoption working, not a regression — the hand-rolled value over-paid for the
//     role and ignored both the density lever and the shared-gap correction — but it is a
//     visible tightening on every page that renders a Statement, so it is written down as a
//     value change rather than absorbed into a class-rename snapshot bump.
//
//   2026-08-18 · the eyebrow decision (OWN-027 / ADR-1075). The kit's `<Eyebrow>` atom stopped
//     DECLARING the role and started COMPOSING it: `font-eyebrow text-body-sm font-bold uppercase
//     tracking-eyebrow mb-4` → `eyebrow font-eyebrow mb-4`. EIGHT goldens moved — every one that
//     renders a Heading block, which is all of them except the pure Text/Statement fixtures.
//
//     THE DIFF, read element by element rather than counted. In all eight, the ONLY element that
//     changed is the `data-text-role="eyebrow"` `<p>`, and the only attribute that changed on it is
//     `class`. No element was added, removed or moved. The nested-eyebrow case (the `withLive`
//     golden) is the useful control: its DEEPLY nested Heading eyebrow moved and the LiveStats
//     eyebrow three lines above it — `text-body-sm font-bold uppercase tracking-eyebrow`, hand-rolled
//     in `components/marketing/blocks.tsx` and NOT an `<Eyebrow>` adopter — is byte-identical. That
//     is the scope line holding: the component retired, not every string that looks like it.
//
//     A REAL VALUE CHANGE, stated plainly for the same reason the entry above states one. The class
//     list is shorter but it is not a rename: `text-body-sm` (0.875rem) is gone and the `eyebrow`
//     utility's `--text-eyebrow` (0.75rem) takes over, a **−14%** type step on every block-kit
//     eyebrow. Tracking, weight, transform and face are unchanged — 0.18em came from
//     `tracking-eyebrow` and now comes from the utility's `letter-spacing`, 700 came from
//     `font-bold` and now comes from `--weight-bold`, and `--font-grotesk` is unported so the
//     utility's `font-family` falls through to `--font-sans`, the face this `<p>` already inherited.
//     One second-order effect, named because a shorter class list hides it: `text-body-sm` also
//     emitted a line-height (`calc(1.25 / 0.875)`) and the composite `eyebrow` utility emits none,
//     so leading is now inherited — the same trade the seven slots converted in ADR-1072 already
//     took, on a single-line label that carries its own `mb-4`.
//
//   2026-08-18 (later, same day) · LIVE-038 — the register the entry above deliberately left alone.
//     Read that entry's control paragraph first, because THIS entry is what happened to it. It named
//     the LiveStats eyebrow in `components/marketing/blocks.tsx` as the useful control: hand-rolled
//     `text-body-sm font-bold uppercase tracking-eyebrow`, NOT an `<Eyebrow>` adopter, and
//     byte-identical across all eight goldens. "That is the scope line holding: the component
//     retired, not every string that looks like it."
//
//     The scope line was right for that change and wrong to leave standing. ADR-1075 retired
//     0.875rem as a SIZE, not as a component, and 25 sites went on hand-writing it — so a visitor
//     saw two eyebrow registers on the same marketing page depending on whether a section came from
//     a block or from the route file. So the control is now converted too, and TWO goldens moved:
//     the two metadata-threading cases, which are the only ones that render LiveStats.
//
//     THE DIFF, read element by element rather than counted. In both, exactly one `<p>` changed —
//     LiveStats' eyebrow, from `text-body-sm font-bold uppercase tracking-eyebrow text-primary-strong
//     mb-4` to `eyebrow text-primary-strong mb-4` — and the only attribute that changed on it is
//     `class`. The three stat LABELS three lines below it (`mt-3 text-meta font-bold uppercase
//     tracking-eyebrow text-subtle`) are byte-identical in both, which is this entry's own control:
//     they are already 0.75rem and were never the retired register, so they must not move, and they
//     did not. Metadata threading — the actual subject of both tests — still delivers 1,234 / 56 / 0
//     from `puck.metadata.live`. No element added, removed or moved; slot recursion, root wrapping
//     and unknown-type skipping untouched.
//
//     SAME VALUE CHANGE as the entry above, now applied to the other half of the population: −14% on
//     the type step, tracking/weight/transform/face unchanged, and the same inherited-leading trade.
//     Committed pixel baselines for the marketing pages move with it and are recaptured in the same
//     PR — that is the whole reason LIVE-038 was its own row rather than folded into ADR-1075's.
//
//     ONE SITE STILL HAND-WRITES IT, on purpose: `components/page-editor/blocks/spaces.tsx`, the
//     photo-hero whose eyebrow sits on `text-on-ink/80` over an image (ADR-1072 §2). It renders in
//     none of these goldens. If a future diff here shows THAT string appearing again anywhere else,
//     it is a regression and this log is the evidence that nothing else was expected to move.
// ─────────────────────────────────────────────────────────────────────────────

type BlockItem = { type: string; props: Record<string, unknown> }

// Build a well-formed stored item: the block's own defaultProps + an id + overrides.
// Using defaultProps guarantees every field carries a valid value.
function item(type: string, id: string, overrides: Record<string, unknown> = {}): BlockItem {
  const defaults = (config.components as Record<string, { defaultProps?: Record<string, unknown> }>)[type]
    ?.defaultProps
  if (!defaults) throw new Error(`Unknown block type in test fixture: ${type}`)
  return { type, props: { id, ...defaults, ...overrides } }
}

const LIVE: Metadata = {
  live: {
    memberCount: 1234,
    circleCount: 56,
    upcomingEvents: [],
    posts: [],
    postsCurated: false,
  },
}

const block = (data: Data, metadata: Metadata = {}) =>
  renderToStaticMarkup(<BlockRender config={config} data={data} metadata={metadata} />)

/** The same doc rendered on an EDITOR canvas (the only surface that passes isEditing). */
const editing = (data: Data, metadata: Metadata = {}) =>
  renderToStaticMarkup(<BlockRender config={config} data={data} metadata={metadata} isEditing />)

// The dashed authoring placeholder every block set uses for a section with nothing to show.
const STUB = 'border-dashed'

describe('BlockRender golden markup (frozen; was byte-identical to Puck rsc <Render>)', () => {
  it('root + plain prop-driven blocks (Heading, Text, Statement)', () => {
    const data: Data = {
      root: {},
      content: [
        item('Heading', 'h1', { title: 'Gather your people', titleAccent: 'people' }),
        item('Text', 't1', { body: 'Some **bold** and *italic* copy.' }),
        item('Statement', 's1', { text: 'A bold statement.', accent: 'bold' }),
      ],
    }
    const html = block(data)
    expect(html).toContain('Gather your ') // accent word "people" is wrapped in a span
    expect(html).toContain('bold')
    expect(html).toMatchInlineSnapshot(`"<section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><p data-text-role="eyebrow" class="eyebrow font-eyebrow mb-4 text-primary-strong">Eyebrow</p><h2 class="font-display uppercase text-balance text-[clamp(1.875rem,5.5vw,3rem)] text-text">Gather your <span class="text-primary-strong">people</span></h2></div></section><section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><div class="text-body-lg text-muted leading-relaxed space-y-4"><p>Some <strong class="font-semibold text-text">bold</strong> and <em>italic</em> copy.</p></div></div></section><section class="bg-marketing-canvas mk-cream px-6 mk-tight "><p class="font-display uppercase max-w-3xl mx-auto text-center text-text text-[clamp(2rem,6.5vw,3.75rem)] leading-[1.1]">A <span class="text-primary-strong">bold</span> statement.</p></section>"`)
  })

  it('threads metadata through the config root (space layout preset wraps children)', () => {
    const data: Data = {
      root: {},
      content: [item('Heading', 'h1', { title: 'Space page' })],
    }
    // With space metadata the config root wraps children in an airy rhythm div;
    // without it, root passes children straight through. The two outputs must differ
    // (proving metadata reaches config.root.render), and the "sections" preset rhythm
    // must appear when present.
    const withSpace = block(data, { space: { layoutPreset: 'sections' } })
    const withoutSpace = block(data, {})
    expect(withSpace).not.toBe(withoutSpace)
    expect(withSpace).toContain('space-y-16') // the "sections" preset rhythm
    expect(withSpace).toMatchInlineSnapshot(`"<div class="space-y-16 py-10 sm:space-y-20 sm:py-14"><section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><p data-text-role="eyebrow" class="eyebrow font-eyebrow mb-4 text-primary-strong">Eyebrow</p><h2 class="font-display uppercase text-balance text-[clamp(1.875rem,5.5vw,3rem)] text-text">Space page</h2></div></section></div>"`)
    expect(withoutSpace).toMatchInlineSnapshot(`"<section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><p data-text-role="eyebrow" class="eyebrow font-eyebrow mb-4 text-primary-strong">Eyebrow</p><h2 class="font-display uppercase text-balance text-[clamp(1.875rem,5.5vw,3rem)] text-text">Space page</h2></div></section>"`)
  })

  it('threads metadata into a top-level block (LiveStats reads puck.metadata.live)', () => {
    const data: Data = {
      root: {},
      content: [item('LiveStats', 'ls1')],
    }
    const withLive = block(data, LIVE)
    const withoutLive = block(data, {})
    // The live counts change the rendered markup, so a threading regression would
    // surface as a snapshot diff here (and as a differing pair below).
    expect(withLive).not.toBe(withoutLive)
    expect(withLive).toMatchInlineSnapshot(`"<section class="bg-surface px-6 py-24 sm:py-28 "><div class="max-w-3xl mx-auto text-center"><p class="eyebrow text-primary-strong mb-4">Not a someday idea</p><h2 class="font-display uppercase text-text text-[clamp(1.875rem,5.5vw,3rem)] mb-12">It’s already happening.</h2><div class="grid grid-cols-3 gap-6 max-w-xl mx-auto"><div><p class="font-display text-stat tabular-nums leading-none text-text">1,234</p><p class="mt-3 text-meta font-bold uppercase tracking-eyebrow text-subtle">Members</p></div><div><p class="font-display text-stat tabular-nums leading-none text-text">56</p><p class="mt-3 text-meta font-bold uppercase tracking-eyebrow text-subtle">Circles</p></div><div><p class="font-display text-stat tabular-nums leading-none text-text">0</p><p class="mt-3 text-meta font-bold uppercase tracking-eyebrow text-subtle">Events soon</p></div></div></div></section>"`)
  })

  it('nested slot: Container renders its `content` slot as nested items', () => {
    const data: Data = {
      root: {},
      content: [
        item('Container', 'c1', {
          content: [
            item('Heading', 'ch1', { title: 'Inside a container' }),
            item('Text', 'ct1', { body: 'Nested body.' }),
          ],
        }),
      ],
    }
    const html = block(data)
    expect(html).toContain('Inside a container')
    expect(html).toMatchInlineSnapshot(`"<section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto"><div><section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><p data-text-role="eyebrow" class="eyebrow font-eyebrow mb-4 text-primary-strong">Eyebrow</p><h2 class="font-display uppercase text-balance text-[clamp(1.875rem,5.5vw,3rem)] text-text">Inside a container</h2></div></section><section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><div class="text-body-lg text-muted leading-relaxed space-y-4"><p>Nested body.</p></div></div></section></div></div></section>"`)
  })

  it('nested slots: Columns renders col1 / col2 / col3 (3-column)', () => {
    const data: Data = {
      root: {},
      content: [
        item('Columns', 'cols1', {
          count: '3',
          col1: [item('Heading', 'a', { title: 'Col one' })],
          col2: [item('Text', 'b', { body: 'Col two' })],
          col3: [item('Statement', 'c', { text: 'Col three' })],
        }),
      ],
    }
    expect(block(data)).toMatchInlineSnapshot(`"<section class="px-6 py-12 sm:py-16 bg-surface "><div class="max-w-5xl mx-auto grid gap-8 md:grid-cols-3 items-start"><div><section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><p data-text-role="eyebrow" class="eyebrow font-eyebrow mb-4 text-primary-strong">Eyebrow</p><h2 class="font-display uppercase text-balance text-[clamp(1.875rem,5.5vw,3rem)] text-text">Col one</h2></div></section></div><div><section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><div class="text-body-lg text-muted leading-relaxed space-y-4"><p>Col two</p></div></div></section></div><div><section class="bg-marketing-canvas mk-cream px-6 mk-tight "><p class="font-display uppercase max-w-3xl mx-auto text-center text-text text-[clamp(2rem,6.5vw,3.75rem)] leading-[1.1]">Col three</p></section></div></div></section>"`)
  })

  it('nested slots: SpaceLayout main/side, under a space-metadata root', () => {
    const data: Data = {
      root: {},
      content: [
        item('SpaceLayout', 'sl1', {
          layout: 'main-side',
          sideSticky: 'yes',
          main: [item('Heading', 'm1', { title: 'Main region' })],
          side: [item('Text', 's1', { body: 'Side region' })],
        }),
      ],
    }
    expect(block(data, { space: { layoutPreset: 'stack' } })).toMatchInlineSnapshot(`"<div class="space-y-12 py-8 sm:space-y-14 sm:py-10"><section class="w-full"><div class="grid gap-10 lg:grid-cols-3 lg:gap-14"><div class="space-y-14 lg:col-span-2"><div><section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><p data-text-role="eyebrow" class="eyebrow font-eyebrow mb-4 text-primary-strong">Eyebrow</p><h2 class="font-display uppercase text-balance text-[clamp(1.875rem,5.5vw,3rem)] text-text">Main region</h2></div></section></div></div><aside class="space-y-6 lg:sticky lg:top-24 lg:self-start"><div><section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><div class="text-body-lg text-muted leading-relaxed space-y-4"><p>Side region</p></div></div></section></div></aside></div></section></div>"`)
  })

  it('deep slot recursion + metadata threaded into a slotted LiveStats', () => {
    const data: Data = {
      root: {},
      content: [
        item('Container', 'c1', {
          content: [
            item('Columns', 'cols1', {
              count: '2',
              col1: [item('LiveStats', 'ls-nested')],
              col2: [item('Heading', 'deep', { title: 'Deeply nested heading' })],
            }),
          ],
        }),
      ],
    }
    // Snapshot WITH live metadata, and prove nested items receive puck.metadata
    // identically (LiveStats deep inside two slots) by differing without it.
    const withLive = block(data, LIVE)
    const withoutLive = block(data, {})
    expect(withLive).not.toBe(withoutLive)
    expect(withLive).toContain('Deeply nested heading')
    expect(withLive).toMatchInlineSnapshot(`"<section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto"><div><section class="px-6 py-12 sm:py-16 bg-surface "><div class="max-w-5xl mx-auto grid gap-8 md:grid-cols-2 items-start"><div><section class="bg-surface px-6 py-24 sm:py-28 "><div class="max-w-3xl mx-auto text-center"><p class="eyebrow text-primary-strong mb-4">Not a someday idea</p><h2 class="font-display uppercase text-text text-[clamp(1.875rem,5.5vw,3rem)] mb-12">It’s already happening.</h2><div class="grid grid-cols-3 gap-6 max-w-xl mx-auto"><div><p class="font-display text-stat tabular-nums leading-none text-text">1,234</p><p class="mt-3 text-meta font-bold uppercase tracking-eyebrow text-subtle">Members</p></div><div><p class="font-display text-stat tabular-nums leading-none text-text">56</p><p class="mt-3 text-meta font-bold uppercase tracking-eyebrow text-subtle">Circles</p></div><div><p class="font-display text-stat tabular-nums leading-none text-text">0</p><p class="mt-3 text-meta font-bold uppercase tracking-eyebrow text-subtle">Events soon</p></div></div></div></section></div><div><section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><p data-text-role="eyebrow" class="eyebrow font-eyebrow mb-4 text-primary-strong">Eyebrow</p><h2 class="font-display uppercase text-balance text-[clamp(1.875rem,5.5vw,3rem)] text-text">Deeply nested heading</h2></div></section></div></div></section></div></div></section>"`)
  })

  it('skips unknown block types instead of throwing', () => {
    const data: Data = {
      root: {},
      content: [
        item('Heading', 'h1', { title: 'Real block' }),
        { type: 'ThisBlockDoesNotExist', props: { id: 'x1', whatever: true } } as unknown as Data['content'][number],
        item('Text', 't1', { body: 'Another real block' }),
      ],
    }
    const html = block(data)
    expect(html).toContain('Real block')
    expect(html).toContain('Another real block')
    expect(html).not.toContain('ThisBlockDoesNotExist')
    expect(html).toMatchInlineSnapshot(`"<section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><p data-text-role="eyebrow" class="eyebrow font-eyebrow mb-4 text-primary-strong">Eyebrow</p><h2 class="font-display uppercase text-balance text-[clamp(1.875rem,5.5vw,3rem)] text-text">Real block</h2></div></section><section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><div class="text-body-lg text-muted leading-relaxed space-y-4"><p>Another real block</p></div></div></section>"`)
  })

  it('renders an empty document to empty markup', () => {
    expect(block({ root: {}, content: [] })).toBe('')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// EDITOR PLACEHOLDERS NEVER REACH A PUBLIC PAGE (ADR-927 follow-up).
//
// `puck.isEditing` used to be hardcoded false here, which broke the contract in BOTH
// directions: every isEditing-gated placeholder was unreachable dead code, and the
// blocks that compensated by treating "no live metadata" as "must be the editor"
// rendered their dashed operator scaffolding to VISITORS (a brand-new Space, whose
// live counts are all zero, published a dashed "Highlights / Your live counts show on
// the live page" box on its public landing). The state is now a real prop, so these
// lock the invariant from both sides.
// ─────────────────────────────────────────────────────────────────────────────
describe('editor placeholders are gated on puck.isEditing', () => {
  // SpaceHighlights: live counts, empty for a brand-new Space (the public leak).
  // SpaceAbout with an empty body: operator-authored, the placeholder that was dead code.
  const unfilled: Data = {
    root: {},
    content: [item('SpaceHighlights', 'hl'), item('SpaceAbout', 'ab', { body: '' })],
  }

  it('a public page shows NO placeholder for a section with nothing to show', () => {
    const html = block(unfilled, { space: { highlights: [] } })
    expect(html).not.toContain(STUB)
    expect(html).not.toContain('Your live counts show on the live page')
    expect(html).not.toContain('Tell people who you are and what to expect')
    // Only the config root's rhythm div + the honest-empty anchor wrapper survive
    // (`empty:hidden` collapses the wrapper, so the page shows no phantom gap).
    expect(html).toMatchInlineSnapshot(
      `"<div class="space-y-12 py-8 sm:space-y-14 sm:py-10"><section id="about" class="scroll-mt-36 empty:hidden"></section></div>"`,
    )
  })

  it('the SAME doc on an editor canvas shows the authoring placeholders', () => {
    const html = editing(unfilled, { space: { highlights: [] } })
    expect(html).toContain(STUB)
    expect(html).toContain('Your live counts show on the live page')
    expect(html).toContain('Tell people who you are and what to expect')
  })

  it('real data wins over the placeholder on BOTH surfaces (isEditing only fills a gap)', () => {
    const live: Metadata = { space: { highlights: [{ label: 'Members', value: 12 }] } }
    for (const html of [block(unfilled, live), editing(unfilled, live)]) {
      expect(html).toContain('12')
      expect(html).not.toContain('Your live counts show on the live page')
    }
  })

  it('threads isEditing into a block nested in a SLOT (layout presets wrap blocks)', () => {
    // A Space page arranged by the `main-rail` preset nests its blocks in a SpaceLayout
    // slot. Nested items get their puck object from SlotItem, not DropZoneRender, so the
    // flag has to ride BOTH paths or the placeholders vanish the moment a preset is used.
    const nested: Data = {
      root: {},
      content: [item('SpaceLayout', 'sl', { layout: 'main-side', main: [item('SpaceHighlights', 'hl')], side: [] })],
    }
    expect(editing(nested, { space: { highlights: [] } })).toContain('Your live counts show on the live page')
    expect(block(nested, { space: { highlights: [] } })).not.toContain(STUB)
  })

  it('defaults to false, so any surface that forgets the prop is treated as public', () => {
    // The safe default matters more than the flag: a new render path that omits
    // isEditing must fail CLOSED (no scaffolding), never open.
    expect(block(unfilled)).not.toContain(STUB)
  })
})

describe('BlockRender is resilient to malformed input (beyond Puck, which threw)', () => {
  it('renders nothing for a doc missing content/root without throwing', () => {
    // Puck rsc <Render> dereferenced data.root directly and would throw here; the
    // in-house renderer defensively defaults, matching the "render nothing" contract.
    expect(block({} as Data, {})).toBe('')
    expect(block({ content: undefined, root: undefined } as unknown as Data, {})).toBe('')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CONTRAST GATE — which amber an accent word gets, per band.
//
// `accentize` picks between two shades of the same hue, and the choice is a
// contrast decision rather than a style one:
//
//   text-primary        #E2912F   8.2:1 on slat   ·  2.52:1 on white  ← fails light
//   text-primary-strong #9A5E12   5.27:1 on white ·  1.6:1 on slat    ← fails ink
//
// Each fails badly exactly where the other belongs, so a wrong flag is worse
// than no flag. The golden snapshots above would catch a change here, but they
// record WHAT the markup is, not WHY -- and a future reader updating a snapshot
// with -u would sail straight past it. These assertions name the rule.
//
// The defect this locks: every Puck-rendered marketing page emitted the brand
// amber as accent text on LIGHT bands, because accentize had no notion of the
// band it was rendering onto. /spaces and /the-community carried 83 serious
// axe elements between them from this one call (ADR-928 ratchet).
// ─────────────────────────────────────────────────────────────────────────────
describe('accent words resolve their amber from the band, not from a default', () => {
  it('uses the DEEPER amber on light bands (surface and canvas)', () => {
    const html = block({
      root: {},
      content: [
        // Heading defaults to tone 'surface'; Statement defaults to tone 'canvas'.
        item('Heading', 'h1', { title: 'Gather your people', titleAccent: 'people' }),
        item('Statement', 's1', { text: 'A bold statement.', accent: 'bold' }),
      ],
    })
    expect(html).toContain('<span class="text-primary-strong">people</span>')
    expect(html).toContain('<span class="text-primary-strong">bold</span>')
    // The brand amber must not appear as an accent span anywhere on a light band.
    expect(html).not.toContain('<span class="text-primary">')
  })

  it('keeps the BRAND amber on an ink band, where -strong would be the regression', () => {
    const html = block({
      root: {},
      content: [item('Heading', 'h1', { title: 'Gather your people', titleAccent: 'people', tone: 'ink' })],
    })
    expect(html).toContain('<span class="text-primary">people</span>')
    expect(html).not.toContain('text-primary-strong')
  })

  it('follows the tone control when an operator switches a block between bands', () => {
    const render = (tone: string) =>
      block({ root: {}, content: [item('Heading', 'h1', { title: 'Real talk', titleAccent: 'Real', tone })] })
    // The same block, same copy: only the band changed, and the shade tracked it.
    expect(render('surface')).toContain('<span class="text-primary-strong">Real</span>')
    expect(render('canvas')).toContain('<span class="text-primary-strong">Real</span>')
    expect(render('ink')).toContain('<span class="text-primary">Real</span>')
  })
})
