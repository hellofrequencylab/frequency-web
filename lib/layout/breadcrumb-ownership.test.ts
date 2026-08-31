import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { ownsBreadcrumb } from './page-chrome'

// ── THE BREADCRUMB ANNOUNCED A RENAMED ENTITY UNDER ITS OLD NAME ────────────────────────────────
//
// 🔴 THE BUG (owner capture, 2026-08-31). The page read:
//
//     Events  ›  Meld Community Cowork Launch At Ro…
//     Co Creating What's Next            ← the <h1>, 20px below
//
// Both are the same event. The shell renders <Breadcrumbs /> derived from the PATHNAME and
// titleizes any segment it does not recognise; on a slug route that segment is the SLUG, and a slug
// freezes at creation while the title stays editable. So the crumb is wrong-by-construction on every
// renamed entity — events, circles, channels, people, commerce — and it is also the only crumb that
// is non-interactive and already duplicated by the h1 under it.
//
// WHY THE FIX IS TWO HALVES. The shell renders the crumb ABOVE {children}, so the page is a
// DESCENDANT of the element it would need to fill in — a context cannot reach upward, and a client
// store would flash the wrong name on first paint because the server pass renders the crumb before
// the page that would correct it. So the page renders its own trail and the shell stands down for
// that route, which is exactly what components/spaces/space-breadcrumbs.tsx has always done.

const shell = readFileSync('components/layout/app-shell.tsx', 'utf8')
const detail = readFileSync('components/templates/detail-template.tsx', 'utf8')
const eventPage = readFileSync('app/(main)/events/[slug]/page.tsx', 'utf8')

describe('ownsBreadcrumb — which routes render their own trail', () => {
  it('an event DETAIL page owns its crumb', () => {
    expect(ownsBreadcrumb('/events/meld-community-cowork-launch-at-royal-temple-2026-09-02')).toBe(true)
  })

  it('🔴 but the events INDEX does not — it has no entity, so the derived trail is correct there', () => {
    // The bug is a titleized SLUG. `/events` has no slug, and suppressing the shell there would
    // delete a correct breadcrumb to fix a different page's wrong one.
    expect(ownsBreadcrumb('/events')).toBe(false)
  })

  it('and neither do the event SUB-routes, which are their own pages', () => {
    for (const p of ['/events/some-slug/manage', '/events/some-slug/edit', '/events/some-slug/settings']) {
      expect(ownsBreadcrumb(p), p).toBe(false)
    }
  })

  it('nor the create flow, which has no entity and therefore no real name', () => {
    expect(ownsBreadcrumb('/events/new')).toBe(false)
  })

  it('Spaces keep the ownership they already had', () => {
    // This was a hardcoded regex in app-shell.tsx before it moved here. Moving it must not have
    // changed what it matched.
    expect(ownsBreadcrumb('/spaces/danieltyack')).toBe(true)
    expect(ownsBreadcrumb('/spaces/danieltyack/manage')).toBe(true)
    expect(ownsBreadcrumb('/spaces')).toBe(false)
  })

  it('an unrelated route is untouched', () => {
    for (const p of ['/feed', '/nearby', '/people/ada', '/circles/some-circle']) {
      expect(ownsBreadcrumb(p), p).toBe(false)
    }
  })
})

describe('both halves are wired, because either alone is broken', () => {
  it('the shell reads the registry instead of its old hardcoded regex', () => {
    expect(shell).toContain('!ownsBreadcrumb(pathname) && <Breadcrumbs />')
    // 🔴 The regex it replaced. Left behind, the shell would keep suppressing ONLY Spaces and the
    // event page would render two trails — the real one and the one that titleizes the slug.
    expect(shell).not.toContain("!/^\\/spaces\\/[^/]+/.test(pathname) && <Breadcrumbs />")
  })

  it('the template can render a supplied trail', () => {
    expect(detail).toContain('breadcrumb && breadcrumb.length > 0')
  })

  it('🔴 and the event page actually supplies its real TITLE, not its slug', () => {
    // The whole point. A trail built from the slug would be the bug with extra steps.
    expect(eventPage).toContain('label: event.title')
    const trail = eventPage.slice(eventPage.indexOf('breadcrumb={['), eventPage.indexOf('breadcrumb={[') + 260)
    expect(trail).not.toContain('label: event.slug')
  })
})
