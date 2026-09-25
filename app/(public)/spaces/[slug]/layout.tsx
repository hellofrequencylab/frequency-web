import { notFound } from 'next/navigation'
import { AccentScope } from '@/components/spaces/accent-scope'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveAccentVars } from '@/lib/spaces/accent'
import { defaultAccentForType } from '@/lib/spaces/profile-config'
import { parseSpaceTheme } from '@/lib/theme/space-themes'
import { markAnonymousRender } from '@/lib/core/anonymous-render'

// THE SIGNED-OUT SPACE'S OWN SCOPE — the (public) mirror of app/(main)/spaces/[slug]/layout.tsx.
//
// 🔴 WITHOUT THIS, THE SHARE URL RENDERS THE SPACE'S BLOCKS INTO THE HOST'S CASCADE (LIVE-506).
// The markup is identical — both trees call the same <SpaceProfileModules> off the same stored
// layout — but markup is not the whole picture. `AccentScope` is the only thing in the repo that
// emits `data-space-theme`, and every per-theme rule in app/globals.css hangs off it:
//
//   · `--font-display` is unset, so `.font-display` falls back to Anton with the base caps-tuned
//     metrics, and the per-theme `text-transform: none` override never matches. An `editorial`
//     Space reads as HEAVY CONDENSED ALL-CAPS signed out and as sentence-case Fraunces signed in.
//   · `[data-space-theme]` sets the body face, so the body falls back to Nunito: a `classic` Space
//     loses PT Serif and an `accessible` Space loses Atkinson on the URL strangers actually visit.
//   · `vars` carries `--color-primary*`, so every `bg-primary` CTA and `text-primary-strong` eyebrow
//     paints the HOST's amber rather than the Space's brand.
//
// IT IS A LAYOUT, NOT A PAGE WRAPPER, and that is ADR-1192's ruling applied to this tree: "the fix
// is structural, not per-page". A layout covers every route beneath it, so the sitemap-listed
// podcasts route under this segment is scoped by the same change rather than by a second copy that
// can drift. accent-scope-coverage.test.ts walks both Space roots and checks exactly that.
//
// ISR IS UNTOUCHED, which is the constraint ADR-1465 and ADR-1526 exist to protect. Every read here
// is pure or a plain DB read — no cookies(), no headers() — and getVisibleSpaceBySlug is
// request-cached transitively via getSpaceBySlug, so the page below re-reads the same Space for
// free. markAnonymousRender() is called for the same reason the page calls it: this subtree has no
// viewer, and saying so beats auditing each new block for a viewer read it might add later.
export default async function PublicSpaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  markAnonymousRender()
  const { slug } = await params
  const space = await getVisibleSpaceBySlug(slug, null)
  if (!space) notFound()

  const accentVars = resolveAccentVars(space.brandAccent, defaultAccentForType(space.type))
  const spaceTheme = parseSpaceTheme(space.preferences)

  return (
    <AccentScope vars={accentVars} theme={spaceTheme}>
      {children}
    </AccentScope>
  )
}
