import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// LIVE-738: the Journey editor's cover band carries the Space header control again. The single-page
// editor at /journeys/<slug>/edit drew its cover as a bare upload box, and the settings column that
// holds the drag-to-focus control is mounted there with `hideIdentity`, which hides it. So an author
// could set a cover but not frame it, although journey_plans.cover_focus is stored and the Journey
// page crops by it. The band is now HeaderImageField, the control the Space branding form built and
// the Journey rail already mounts. Two halves are pinned: the editor paints the saved focus on its
// preview, and that same stored value is what the Journey page's hero crops the cover with.

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/app/(main)/journeys/actions', () => {
  const stub = vi.fn(async () => ({ data: undefined }))
  return {
    saveJourneyMeta: stub,
    setJourneyVisibility: stub,
    adoptJourney: stub,
    uploadJourneyCover: stub,
    setJourneyHeaderFocus: stub,
  }
})
vi.mock('@/app/(main)/journeys/create-actions', () => ({ createJourneyDraftAction: vi.fn() }))
vi.mock('@/components/loom/loom-picker', () => ({ LoomPicker: () => null }))

import { JourneyBuilder } from './journey-builder'
import { PageHero } from '@/components/templates/page-hero'
import { asIdentityHero } from '@/lib/layout/detail-hero'
import { readJourneyCoverFocus } from '@/lib/journeys/header'

const COVER = 'https://x.supabase.co/storage/v1/object/public/library-media/root/sunrise.jpg'
const SAVED = '20% 80%'

const editor = (cover: string | null, coverFocus: string | null) =>
  renderToStaticMarkup(
    <JourneyBuilder slug="sunrise" planId="plan-1" initialTitle="Sunrise" initialCover={cover} initialCoverFocus={coverFocus} />,
  )

describe('the Journey editor cover band is the Space header control (LIVE-738)', () => {
  it('previews the cover at the saved focus, with the drag-to-focus marker on it', () => {
    const html = editor(COVER, SAVED)
    // The focal picker's frame: a keyboard-reachable group named for the control.
    expect(html).toContain('aria-label="Cover: drag to reposition, or use the arrow keys"')
    // The preview crops the cover by the SAVED object-position, not a center default.
    expect(html).toMatch(/<img[^>]*src="https:\/\/x\.supabase\.co[^"]*sunrise\.jpg"[^>]*style="object-position:20% 80%"/)
    // Replace and Remove sit over the preview, as they do on the Space form.
    expect(html).toContain('>Replace</button>')
    expect(html).toContain('aria-label="Remove cover"')
  })

  it('an unset focus previews centered', () => {
    expect(editor(COVER, null)).toContain('object-position:50% 50%')
  })

  it('with no cover yet it is the upload band, with nothing to frame', () => {
    const html = editor(null, SAVED)
    expect(html).not.toContain('drag to reposition')
  })
})

describe('the saved focus is what the Journey page crops its cover with', () => {
  it('journey_plans.cover_focus rides rung 1 into PageHero as the cover object-position', () => {
    // The Journey page passes plan.cover_image + plan.cover_focus as the entity rung
    // (app/(main)/journeys/[slug]/page.tsx); the resolver's pure fold is what it spreads.
    const bag = asIdentityHero(
      '/journeys/sunrise',
      { operatorImage: null, operatorFocus: null, header: { layout: 'identity', height: 'standard', overlayStyle: 'shadow' } },
      { entityImage: COVER, entityFocus: SAVED },
    )
    expect(bag.coverFocus).toBe(SAVED)
    const html = renderToStaticMarkup(<PageHero {...bag} title="Sunrise" />)
    expect(html).toContain(`object-position:${SAVED}`)
  })

  it('the editor and the page read the one stored value the same way', () => {
    expect(readJourneyCoverFocus(SAVED)).toBe(SAVED)
    expect(readJourneyCoverFocus(null)).toBe('50% 50%')
  })
})
