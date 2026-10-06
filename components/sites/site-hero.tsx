import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { PageHero } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { BrandAnchor } from '@/components/spaces/brand-anchor'
import { readHeroConfig, resolveHero, heroHeightClass } from '@/lib/spaces/hero-config'
import { defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import { coverPlaceholderFor } from '@/lib/spaces/cover-placeholder'
import { readTagline } from '@/lib/spaces/tagline'
import { heroOverlayForScrim } from '@/lib/layout/cover-scrim'
import { cn } from '@/lib/utils'
import type { Space } from '@/lib/spaces/types'
import {
  readCoverScrim,
  readCoverFocus,
  readLogoBackdrop,
} from '@/app/(main)/spaces/[slug]/manage/layout/preferences'

// THE WEBSITE COVER (PROG-E10, owner ask 2026-10-06: the website is "effectively a duplicate of the Space
// page"). The same cover the Space profile shows: the owner's cover photo at their focal point and scrim,
// the logo chip, the hero heading and tagline, and the one primary CTA, all from the SAME hero config the
// Space page editor writes (lib/spaces/hero-config.ts), so editing the Space page edits the website.
// Left out on purpose, because they are Frequency member actions, not the owner's website: Follow, Share
// (QR), and the owner tools. Server Component, no client JS.

export async function SiteHero({ space, brandName }: { space: Space; brandName: string }) {
  const base = `/spaces/${space.slug}`
  const hero = resolveHero({
    config: readHeroConfig(space.preferences),
    preferences: space.preferences,
    base,
    brandName,
    tagline: await readTagline(space.id),
    defaultCtaLabel: defaultPrimaryCtaLabel(space.type),
  })
  const coverScrim = readCoverScrim(space.preferences)
  const onInk = coverScrim !== 'blend'
  const ctaLinkProps = hero.cta.external ? { target: '_blank' as const, rel: 'noopener noreferrer' } : {}

  return (
    <div>
      <PageHero
        title={hero.heading}
        coverImage={space.coverImageUrl || coverPlaceholderFor(space.id)}
        coverFocus={readCoverFocus(space.preferences)}
        overlayStyle={heroOverlayForScrim(coverScrim)}
        frame={{ className: cn('rounded-[var(--radius-cover,1.5rem)] bg-surface-elevated', heroHeightClass(hero.height)) }}
        lockup={
          <div className="flex items-end justify-between gap-4">
            <div className="flex min-w-0 items-end gap-4">
              <div className="shrink-0">
                <BrandAnchor name={brandName} logoUrl={space.brandLogoUrl} backdrop={readLogoBackdrop(space.preferences)} />
              </div>
              <div className="min-w-0 pb-1">
                {hero.eyebrow && (
                  <p
                    className={cn(
                      'eyebrow mb-1',
                      onInk ? 'text-on-ink-muted' : 'text-primary-strong',
                    )}
                  >
                    {hero.eyebrow}
                  </p>
                )}
                {/* header-ok: the website cover is the page's single h1, as on the Space profile. */}
                <h1
                  className={cn(
                    'font-section min-w-0 break-words text-display-h3 font-bold leading-tight',
                    onInk ? 'text-on-ink [text-shadow:0_1px_3px_rgb(0_0_0/0.35)]' : 'text-text',
                  )}
                >
                  {hero.heading}
                </h1>
                {hero.tagline && (
                  <p className={cn('mt-1 hidden max-w-2xl text-body font-medium lg:block', onInk ? 'text-on-ink' : 'text-muted')}>
                    {hero.tagline}
                  </p>
                )}
              </div>
            </div>
            <div className="hidden shrink-0 sm:flex">
              <Link href={hero.cta.href} className={cn(buttonClasses('primary', 'sm', onInk ? 'lift-1' : undefined), 'h-9 shrink-0')} {...ctaLinkProps}>
                {hero.cta.label}
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        }
      />
      {/* Below `lg` the tagline and the CTA sit under the cover, as on the Space profile's phone layout. */}
      <div className="mt-3 flex flex-col gap-3 lg:hidden">
        {hero.tagline && <p className="max-w-2xl text-body font-medium text-muted">{hero.tagline}</p>}
        <Link href={hero.cta.href} className={cn(buttonClasses('primary', 'sm'), 'h-10 sm:hidden')} {...ctaLinkProps}>
          {hero.cta.label}
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  )
}
