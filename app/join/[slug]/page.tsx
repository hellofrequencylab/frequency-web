import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { FocusTemplate } from '@/components/templates'
import { PhotoHero, Statement, Section, Button } from '@/components/marketing/marketing-ui'
import { FUNNELS, getFunnel } from '@/lib/funnels/definitions'
import { getSplashOverride } from '@/lib/funnels/overrides'
import { JoinButton } from './join-button'

// ONE dynamic segment, two front doors (ADR-1090). `/join/<slug>` serves:
//
//   1. A **Funnel splash** when the slug is a CODE-shipped Funnel (FUNNELS in
//      lib/funnels/definitions.ts — e.g. /join/breathwork). Moved here from
//      /beta/<slug>; a 308 in next.config.ts carries the old links over. A slug
//      that is only a DB-built Funnel still has no public splash by design —
//      those enter straight at the induction link, /join?seq=<slug>.
//   2. The **Circle invite redemption** page when the slug is an invite_links
//      token (the route's original tenant; those URLs are unchanged).
//
// The Funnel lookup wins first: Funnel slugs are short operator-chosen words and
// invite tokens are long random strings, so the two value spaces cannot collide
// in practice — and a Funnel slug is knowable synchronously while a token needs
// a DB read. Anything that is neither 404s, exactly as both routes did alone.
//
// The splash renders CHROME-FREE (no marketing mega-nav): a funnel page has one
// job, and the /join segment is the focused front door (same reasoning as the
// operator funnel doors, docs/OPERATOR-FUNNELS.md §2).

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const funnel = FUNNELS[slug]
  if (!funnel) return {}
  const override = await getSplashOverride(slug).catch(() => null)
  const splash = { ...funnel.splash, ...override }
  return {
    title: splash.headline,
    description: splash.body,
    // Private invite/cohort links, shared directly with an audience, not a public crawl target. Noindex
    // (and kept out of the sitemap) so a shared /join/<slug> never surfaces in search — the same intent
    // the old /beta/<slug> carried, now doubled by the robots.ts "/join" disallow.
    robots: { index: false },
    alternates: { canonical: `/join/${slug}` },
    openGraph: { title: splash.headline, description: splash.body, url: `/join/${slug}` },
    // Metadata merges per top-level key: omitting `twitter` inherits the ROOT block, so a shared
    // /join/<slug> link would preview as generic site copy instead of this Funnel's splash.
    twitter: { card: 'summary_large_image', title: splash.headline, description: splash.body },
  }
}

// Render a statement line, turning the *asterisked* span into an accent.
function accent(text: string) {
  const parts = text.split(/\*([^*]+)\*/)
  return parts.map((part, i) =>
    i % 2 === 1 ? <span key={i} className="text-primary-strong">{part}</span> : <span key={i}>{part}</span>,
  )
}

async function FunnelSplashPage({ slug }: { slug: string }) {
  const funnel = getFunnel(slug)
  const override = await getSplashOverride(slug).catch(() => null)
  const splash = { ...funnel.splash, ...override }
  const start = `/join?seq=${funnel.slug}`

  return (
    <>
      <PhotoHero
        image={splash.image}
        alt={splash.imageAlt}
        eyebrow={splash.eyebrow}
        title={splash.headline}
        subtitle={splash.body}
        minHeight="screen"
        footer={
          <p className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-body-sm text-on-ink/60">
            <span className="font-semibold text-on-ink/80">Free during the beta.</span>
            <span aria-hidden className="text-on-ink/30">·</span>
            <span>No card · It’s live, it’s raw, and you’re early</span>
          </p>
        }
      >
        <Button href={start} size="lg">
          {splash.cta}
        </Button>
      </PhotoHero>

      <Statement tone="canvas">{accent(splash.statement)}</Statement>

      {/* The close. `role="band"` is the loose beat the four-role rhythm reserves for a tone
          change and the end of a page (globals.css) — the same weight BetaCTA carries on every
          other marketing page, so this flow-specific CTA closes at the site's cadence. */}
      <Section tone="surface" role="band" className="text-center">
        <p className="mx-auto max-w-xl text-body-lg leading-relaxed text-muted">
          Two minutes to step in. Tell us who you are, claim your handle, and meet your people.
        </p>
        <div className="mt-7">
          <Button href={start} size="md">
            {splash.cta}
          </Button>
        </div>
      </Section>
    </>
  )
}

export default async function JoinPage({ params }: Props) {
  const { slug } = await params

  // Funnel splash first: code-shipped Funnel slugs are known synchronously.
  if (FUNNELS[slug]) return <FunnelSplashPage slug={slug} />

  // Otherwise this is (or claims to be) a Circle invite token.
  const token = slug
  const admin = createAdminClient()

  // Fetch link + circle preview
  const { data: link } = await admin
    .from('invite_links')
    .select(`
      id, max_uses, used_count, expires_at, is_active,
      circle:circles!circle_id (
        id, name, about, type, status, member_count, member_cap,
        hub:hubs!hub_id ( name )
      )
    `)
    .eq('token', token)
    .maybeSingle()

  if (!link || !link.is_active) notFound()
  if (link.expires_at && new Date(link.expires_at) < new Date()) notFound()
  if (link.max_uses > 0 && link.used_count >= link.max_uses) notFound()

  const circle = link.circle as unknown as {
    id: string
    name: string
    about: string | null
    type: string
    status: string
    member_count: number | null
    member_cap: number
    hub: { name: string } | null
  } | null
  if (!circle || circle.status === 'archived') notFound()

  // Check if user is already signed in
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let alreadyMember = false
  if (user) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profile) {
      const { data: membership } = await admin
        .from('memberships')
        .select('id')
        .eq('circle_id', circle.id)
        .eq('profile_id', profile.id)
        .maybeSingle()
      alreadyMember = !!membership
    }
  }

  const spotsLeft = circle.member_cap > 0
    ? circle.member_cap - (circle.member_count ?? 0)
    : null

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center px-4 py-16">
      <FocusTemplate
        width="narrow"
        divider={false}
        eyebrow={circle.hub?.name ? `${circle.type} circle · ${circle.hub.name}` : `${circle.type} circle`}
        title={circle.name}
        description={circle.about ?? undefined}
      >
        <div className="w-full">
          <div className="rounded-card border border-border bg-surface lift-1 overflow-hidden">
            {/* Circle card */}
            <div className="p-8">
              <div className="flex items-center gap-4 text-meta text-muted">
                <span>{circle.member_count ?? 0} member{circle.member_count !== 1 ? 's' : ''}</span>
                {spotsLeft !== null && spotsLeft > 0 && (
                  <span>{spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left</span>
                )}
              </div>
            </div>

            {/* CTA */}
            <div className="px-8 pb-8">
              {alreadyMember ? (
                <div className="text-center space-y-3">
                  <p className="text-body-sm text-muted">
                    You&apos;re already a member of this circle.
                  </p>
                  <Link
                    href="/circles"
                    className="block w-full rounded-xl bg-primary px-4 py-3 text-body-sm font-semibold text-on-primary text-center hover:bg-primary-hover transition-colors"
                  >
                    Go to Circles →
                  </Link>
                </div>
              ) : user ? (
                <JoinButton token={token} circleName={circle.name} />
              ) : (
                <div className="space-y-3">
                  <Link
                    href={`/sign-in?next=/join/${token}`}
                    className="block w-full rounded-xl bg-primary px-4 py-3 text-body-sm font-semibold text-on-primary text-center hover:bg-primary-hover transition-colors"
                  >
                    Sign in to join
                  </Link>
                  <p className="text-meta text-center text-subtle">
                    Don&apos;t have an account?{' '}
                    <Link href={`/sign-in?next=/join/${token}`} className="text-primary-strong hover:underline">
                      Get started
                    </Link>
                  </p>
                </div>
              )}
            </div>
          </div>

          <p className="text-meta text-center text-subtle mt-6">
            You were invited to join Frequency. By joining, you agree to our community guidelines.
          </p>
        </div>
      </FocusTemplate>
    </div>
  )
}
