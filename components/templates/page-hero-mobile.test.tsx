import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { PageHero, HERO_ACTION_CLASS_ADAPTIVE } from './page-hero'

// THE MOBILE PROFILE PASS (2026-07-28) — the drift guard for "desktop is FROZEN".
//
// The owner's ruling was two sentences: "Leave the web mode as shipped. Create a better mobile
// experience." So every change in that pass had to be provably invisible at and above the `sm`
// breakpoint, and this file is the proof that survives the next edit. There is no browser and no
// Playwright in this repo, so the proof is structural rather than visual: it renders the real
// component and asserts, class by class, that nothing unprefixed changed shape and that every
// addition is breakpoint-scoped.
//
// WHY 640px IS THE FREEZE LINE, and why `max-sm:` is exactly it: Tailwind v4 emits `max-sm:` inside
// `@media (width < 40rem)`, and `rem` inside a MEDIA QUERY resolves against the initial 16px — not
// against this repo's 17px `--density-root` override on <html> (app/globals.css). So the boundary
// is 640 CSS px on the nose, the same px value `sm:` turns on at. A rule written `max-sm:` and a
// rule written `sm:` cannot both apply to one viewport.
//
// 🔴 AND THE HARDEST CONSTRAINT, ASSERTED HERE TOO: the mobile pass added NO plate, wash, scrim,
// box or backdrop behind header text, at any width. The legibility levers were layout, size and
// position plus the pre-existing per-glyph text-shadow — nothing that paints a rectangle. The
// contrast half of that contract is pinned in lib/images/hero-contrast.test.ts (HERO_PLATE_ALPHAS
// all zero + the CSS); this file pins the MARKUP half, so a background utility cannot arrive on a
// zone through the render side either.

/** Every class on an element, split. */
function classesOf(markup: string, marker: string): string[] {
  // Find the element carrying `marker` and read its class attribute.
  const idx = markup.indexOf(marker)
  expect(idx, `marker not found in markup: ${marker}`).toBeGreaterThan(-1)
  const before = markup.lastIndexOf('<', idx)
  const tag = markup.slice(before, markup.indexOf('>', idx) + 1)
  const m = tag.match(/class="([^"]*)"/)
  expect(m, `no class attribute on the element carrying ${marker}`).not.toBeNull()
  return m![1].split(/\s+/).filter(Boolean)
}

/** The classes that apply from 640px up: everything not scoped to `max-sm:`. */
function desktopClasses(all: string[]): string[] {
  return all.filter((c) => !c.startsWith('max-sm:'))
}

const HERO = (
  <PageHero
    variant="identity"
    size="standard"
    // No cover: the `null` branch renders the neutral gradient div instead of next/image, which
    // keeps this test a pure render with no image loader in the way. The classes under test are on
    // the content layer and are identical either way.
    coverImage={null}
    adaptiveText
    actionsLabel="Profile actions"
    leading={<span data-testid="avatar" />}
    eyebrow={<span>MEMBER</span>}
    title="Ada Lovelace"
    subtitle={<span>@ada</span>}
    actions={
      <>
        <a href="/x" className={HERO_ACTION_CLASS_ADAPTIVE}>Save contact</a>
        <a href="/y" className={HERO_ACTION_CLASS_ADAPTIVE}>Message</a>
      </>
    }
  />
)

describe('PageHero identity — the desktop geometry is frozen (mobile pass, 2026-07-28)', () => {
  const markup = renderToStaticMarkup(HERO)

  it('the action cluster keeps its shipped desktop class string BYTE FOR BYTE', () => {
    // This is the one element the mobile pass had to touch, because `shrink-0` on a wrapping flex
    // container pins its base size to max-content and the section's `overflow-hidden` then painted
    // the surplus chips off the page. Strip the `max-sm:` scope and what is left must be exactly
    // what shipped — same `ml-auto`, same `shrink-0`, same `justify-end`.
    const all = classesOf(markup, 'aria-label="Profile actions"')
    expect(desktopClasses(all).join(' ')).toBe(
      'ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2 hero-zone',
    )
    // ...and the fix itself is present, and is scoped to phones only.
    expect(all).toContain('max-sm:w-full')
    expect(all.filter((c) => c.startsWith('max-sm:'))).toEqual(['max-sm:w-full'])
  })

  it('the identity content box keeps its >=640px padding, and its phone padding is overridden by it', () => {
    // The phone padding was relaxed from px-6/py-6 to px-5/py-5. That is desktop-neutral ONLY
    // because `sm:px-8 sm:py-8` overrides both from 640px up — this asserts the override still
    // exists, which is the whole reason the base value was safe to change.
    const all = classesOf(markup, 'flex-col justify-end')
    expect(all).toContain('sm:px-8')
    expect(all).toContain('sm:py-8')
    for (const base of all) {
      // Any unprefixed padding utility must have an `sm:` twin of the same property.
      const axis = base.match(/^p([xy])-/)?.[1]
      if (axis) expect(all.some((c) => c.startsWith(`sm:p${axis}-`))).toBe(true)
    }
  })

  it('the h1 clamp was NOT touched (a clamp is the one thing a breakpoint cannot fence)', () => {
    // Deliberately unchanged, and pinned so a later "make the name bigger on phones" edit has to
    // face the arithmetic: at 640px `3vw` is 19.2px, which is BELOW the 1.25rem (21.25px at this
    // repo's 17px root) floor — so the clamp sits on its floor at exactly the freeze line, and any
    // change to that floor is visible on desktop. A phone-only size needs a `max-sm:` utility.
    expect(markup).toContain('text-[clamp(1.25rem,3vw,2rem)]')
  })

  it('🔴 no zone paints a background of any kind, at any width', () => {
    // The markup half of the owner's ruling ("I do not want the dark boxes behind header content").
    // Both text zones, checked for every background-ish utility including a phone-scoped one.
    for (const marker of ['aria-label="Profile actions"', 'data-hero-zone="lockup"']) {
      for (const cls of classesOf(markup, marker)) {
        expect(cls, `a zone must never carry ${cls}`).not.toMatch(
          /(^|:)(bg-|backdrop-|shadow-|ring-)/,
        )
      }
    }
    // And no zone ever gets a measured plate from the server (unmeasured is the honest default).
    expect(markup).not.toContain('data-media-plate')
  })
})

describe('the mobile pass touched nothing that is not breakpoint-scoped', () => {
  // A source-level scan, in the spirit of the ADR-898 drift guard: the render test above proves the
  // hero, this proves the profile page's own band, which is an async Server Component doing six DB
  // reads and therefore not renderable here.
  const page = readFileSync('app/(main)/people/[handle]/page.tsx', 'utf8')
  const hero = readFileSync('components/templates/page-hero.tsx', 'utf8')
  const friend = readFileSync('app/(main)/people/[handle]/friend-button.tsx', 'utf8')

  it('Block / Act as get their own right-aligned row on a phone, and only on a phone', () => {
    expect(page).toContain('className="flex items-center gap-3 max-sm:w-full max-sm:justify-end"')
  })

  it("the owner's Edit profile is pulled right when it wraps, and only on a phone", () => {
    // A one-item flex line under `justify-between` packs to flex-START, which is why this needs an
    // auto margin rather than the parent's justification.
    expect(page).toContain('hover:text-text max-sm:ml-auto')
  })

  it('an on-cover refusal is capped to something a 320px hero can actually show', () => {
    // 16rem = 272px is wider than the whole hero content box on a 320px phone, so an errored
    // control became the widest item on its flex line and was clipped. Both call sites narrow on
    // phones and restore 16rem from 640px up.
    expect(friend).toContain('max-w-[13rem] text-xs text-on-media sm:max-w-[16rem]')
    expect(page).toContain('max-w-[13rem] text-2xs text-on-media sm:max-w-[16rem]')
  })

  it('🔴 not one phone-scoped rule paints a backdrop behind header text', () => {
    // The single hardest constraint of the pass, enforced against the source of every file it
    // touched: a `max-sm:` escape hatch must not be how a box comes back.
    for (const src of [page, hero, friend]) {
      for (const cls of src.match(/max-sm:[\w[\]/.,%-]+/g) ?? []) {
        expect(cls, `phone-only backdrop reintroduced: ${cls}`).not.toMatch(
          /max-sm:(bg-|backdrop-|shadow-|ring-)/,
        )
      }
    }
  })
})
