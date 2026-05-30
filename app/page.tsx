import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { MarketingHeader } from '@/components/layout/marketing-header'
import { MarketingFooter } from '@/components/layout/marketing-footer'
import { Statement, ZigZag, Marquee, BetaCTA } from '@/components/marketing/marketing-ui'
import { getInitials, relativeTime } from '@/lib/utils'
import { SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION, BETA_CTA_LABEL, BETA_CTA_HREF } from '@/lib/site'
import { type CommunityRole, ROLE_RANK, RoleBadge } from '@/lib/community-roles'

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} · ${SITE_TAGLINE}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: '/',
  },
}

type PostPreviewRow = {
  id: string
  body: string
  created_at: string
  media_urls: string[]
  author: {
    display_name: string
    handle: string
    avatar_url: string | null
    community_role?: string
  } | null
}

type PublicPostRow = {
  id: string
  body: string
  created_at: string
  media_urls: string[] | null
  author_display_name: string | null
  author_handle: string | null
  author_avatar_url: string | null
}

function hasRole(role: string | null | undefined): role is CommunityRole {
  return !!role && role in ROLE_RANK
}

export default async function RootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect('/feed')

  const [postsResult, memberCountResult, eventsResult, circleCountResult] = await Promise.all([
    supabase.rpc('public_posts', { _limit: 3 }),
    supabase.rpc('public_member_count'),
    supabase.rpc('public_events', { _limit: 3 }),
    supabase.rpc('public_active_circle_count'),
  ])

  const posts: PostPreviewRow[] = ((postsResult.data ?? []) as PublicPostRow[]).map((r) => ({
    id: r.id,
    body: r.body,
    created_at: r.created_at,
    media_urls: r.media_urls ?? [],
    author: r.author_display_name
      ? {
          display_name: r.author_display_name,
          handle: r.author_handle ?? '',
          avatar_url: r.author_avatar_url,
        }
      : null,
  }))
  const memberCount = (memberCountResult.data as number | null) ?? 0
  const circleCount = (circleCountResult.data as number | null) ?? 0
  const upcomingEvents = (eventsResult.data ?? []) as { id: string; title: string; starts_at: string; city: string | null; slug: string }[]

  return (
    <>
      <MarketingHeader overHero />

      {/* Hero */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
          style={{ backgroundImage: 'url(/images/site/lab-thermal.jpg)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/85" />

        <div className="relative z-10 flex flex-col items-center w-full max-w-4xl">
          <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.3em] text-primary mb-6">
            A third space for a disconnected generation
          </p>
          <h1 className="font-display uppercase text-white text-[2.75rem] leading-[0.95] sm:text-6xl lg:text-7xl max-w-3xl">
            This is what community is supposed to feel like.
          </h1>
          <p className="mt-7 text-base sm:text-lg text-white/80 max-w-lg leading-relaxed">
            Not home. Not work. A place to exhale, reset, and remember what it
            feels like to belong.
          </p>

          <div className="mt-9 flex items-center gap-3 flex-wrap justify-center">
            <Link
              href={BETA_CTA_HREF}
              className="rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors"
            >
              {BETA_CTA_LABEL}
            </Link>
            <Link
              href="/sign-in"
              className="rounded-2xl border border-white/30 px-8 py-3.5 text-base font-medium text-white hover:bg-white/10 hover:border-white/50 transition-colors"
            >
              Sign in
            </Link>
          </div>
          <p className="mt-8 text-sm text-white/45">
            The first space is taking root in North County San Diego.
          </p>
        </div>

        <div className="absolute bottom-10 flex flex-col items-center gap-2 text-white/40">
          <span className="text-[11px] font-bold tracking-widest uppercase">See the vision</span>
          <ChevronDown className="w-5 h-5 animate-bounce" />
        </div>
      </section>

      {/* Problem */}
      <ZigZag
        img="/images/site/community-1.jpg"
        alt="A Frequency community gathering"
        eyebrow="Something is broken"
        title="And everyone feels it."
        imgAspect="landscape"
        imgPosition="center"
      >
        <p>
          67% of millennials and Gen Z report feeling lonely. Not because there
          aren&apos;t people around, but because the <em>places</em> that used to
          hold us have quietly disappeared.
        </p>
        <p>
          The corner café, the town square, the gathering ground. We traded them
          for feeds and followers. It didn&apos;t work, and we all feel it.
        </p>
      </ZigZag>

      {/* Story */}
      <ZigZag
        img="/images/site/moonlight-2.jpg"
        alt="A Frequency gathering on the bluffs at Moonlight Beach"
        reverse
        tone="canvas"
        imgAspect="portrait"
        imgPosition="top"
        title={
          <>
            <span className="block text-3xl sm:text-4xl tracking-[0.12em] text-muted">
              The Frequency
            </span>
            <span className="block text-6xl sm:text-7xl text-text">Story</span>
          </>
        }
        kicker="Moonlight and the Mission"
        cta={{ label: 'Read the full story', href: '/about' }}
      >
        <p>It started on the cliffs of Moonlight Beach in 2020.</p>
        <p>
          A few of us gathered every morning to breathe and reconnect. Within
          eighteen months, a thousand people were showing up. No guru, no brand,
          no agenda. Just people who needed each other and a place to be.
        </p>
        <p>
          It proved the hunger is real. It also proved that without a home, even
          the most beautiful community can&apos;t hold. So we set out to build
          one that could.
        </p>
      </ZigZag>

      <Statement>
        That&apos;s when the seed of
        <br />
        <span className="text-primary">Frequency</span> was first planted.
      </Statement>

      {/* Vision */}
      <ZigZag
        img="/images/site/moonlight-1.jpg"
        alt="A Frequency community embracing at the beach"
        eyebrow="The vision"
        imgAspect="natural"
        title={
          <>
            The vision <span className="text-primary">lives on</span>
          </>
        }
        cta={{ label: 'See how it works', href: '/how-it-works' }}
      >
        <p>
          Frequency is social infrastructure <em>and</em> physical space.
          Designed from the ground up to regulate your nervous system and bring
          you back to people who actually see you.
        </p>
        <p>
          Guru-free, and built to outlast any one person. A model that keeps real
          connection within reach for everyone, not just the few who can afford
          it.
        </p>
      </ZigZag>

      <Statement tone="surface">
        Starting in{' '}
        <span className="text-primary whitespace-nowrap">North County San Diego.</span>
        <br />
        Coming to your city.
      </Statement>

      {/* What we're building (dark band) */}
      <section className="bg-text">
        <Marquee items={['What we’re building', 'The Lab', 'The Network', 'The Model']} />
        <div className="max-w-5xl mx-auto px-6 py-24 sm:py-32 space-y-24 sm:space-y-28">
          <Pillar
            img="/images/site/lab-storefront.jpg"
            alt="The Lab"
            title="The Lab"
            body="A prototype third space: movement studios, a thermal circuit, a connection bar, and an events floor. Part regulation studio, part social hub, part venue. The environment does the work."
            href="/the-lab"
          />
          <Pillar
            img="/images/site/community-1.jpg"
            alt="The Network"
            title="The Network"
            body="A community that spreads city by city. Circles cluster into neighborhoods, neighborhoods into whole areas. Bottom-up and never appointed, so it grows on its own momentum."
            href="/how-it-works"
            reverse
          />
          <Pillar
            img="/images/site/lab-pool.jpg"
            alt="The Model"
            title="The Model"
            body="Built to last and built to include. Memberships sustain the spaces so connection stays within reach. Nobody is excluded, and people who can pay more fund those who can't. Circulation, not exclusion."
          />
        </div>
      </section>

      {/* It's already happening (live data) */}
      <section className="bg-surface px-6 py-24 sm:py-28">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
            Not a someday idea
          </p>
          <h2 className="font-display uppercase text-text text-4xl sm:text-5xl mb-12">
            It&apos;s already happening.
          </h2>
          <div className="grid grid-cols-3 gap-6 max-w-xl mx-auto">
            <Stat value={memberCount} label="Members" />
            <Stat value={circleCount} label="Circles" />
            <Stat value={upcomingEvents.length} label="Events soon" />
          </div>
        </div>
      </section>

      {upcomingEvents.length > 0 && (
        <section className="bg-marketing-canvas px-6 py-20">
          <div className="max-w-2xl mx-auto space-y-3">
            {upcomingEvents.map((event) => {
              const d = new Date(event.starts_at)
              const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
              const day = d.getDate()
              const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              return (
                <div
                  key={event.id}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-4 hover:border-border-strong transition-colors"
                >
                  <div className="shrink-0 w-12 h-12 rounded-xl bg-primary-bg flex flex-col items-center justify-center">
                    <span className="text-[9px] font-bold text-primary-strong leading-none">{month}</span>
                    <span className="text-base font-bold text-primary-strong leading-tight">{day}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-text truncate">{event.title}</p>
                    <p className="text-sm text-subtle mt-0.5">
                      {dateStr}
                      {event.city && <> &middot; {event.city}</>}
                    </p>
                  </div>
                  <Link
                    href={BETA_CTA_HREF}
                    className="flex items-center gap-1 text-sm font-semibold text-primary-strong hover:underline shrink-0"
                  >
                    Join <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {posts.length > 0 && (
        <section className="bg-marketing-canvas px-6 py-20 sm:py-24">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-center font-display uppercase text-text text-3xl sm:text-4xl mb-10 text-balance">
              People showing up for each other
            </h2>
            <div className="space-y-4">
              {posts.map((post) => (
                <PostPreviewCard key={post.id} post={post} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Closing CTA */}
      <BetaCTA
        heading="Be one of the first."
        body="We're opening the community to a small group at a time. Add your name and we'll reach out when a spot opens."
      />

      <MarketingFooter />
    </>
  )
}

// ── Building blocks ─────────────────────────────────────────────────────────

// Dark-band pillar: large circular image with a big display heading and a
// floating light card holding the body, overlapping the circle. Alternates.
function Pillar({
  img,
  alt,
  title,
  body,
  href,
  reverse = false,
}: {
  img: string
  alt: string
  title: string
  body: string
  href?: string
  reverse?: boolean
}) {
  return (
    <div
      className={`flex flex-col items-center sm:items-stretch sm:flex-row ${
        reverse ? 'sm:flex-row-reverse' : ''
      }`}
    >
      <img
        src={img}
        alt={alt}
        loading="lazy"
        className="w-80 h-80 sm:w-[32rem] sm:h-[32rem] rounded-full object-cover border-4 border-white/10 shrink-0"
      />
      <div
        className={`relative z-10 flex flex-col justify-center max-w-md -mt-12 sm:mt-0 ${
          reverse ? 'sm:-mr-20' : 'sm:-ml-20'
        }`}
      >
        <h3 className="font-display uppercase text-white text-4xl sm:text-5xl mb-5 px-2 text-center sm:text-left">
          {title}
        </h3>
        <div className="bg-surface rounded-3xl p-8 shadow-2xl">
          <p className="text-base text-muted leading-relaxed">{body}</p>
          {href && (
            <Link
              href={href}
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-primary-strong hover:underline"
            >
              Learn more <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <p className="font-display text-6xl sm:text-7xl text-text">{value}</p>
      <p className="text-xs text-subtle mt-3 uppercase tracking-widest font-bold">{label}</p>
    </div>
  )
}

function PostPreviewCard({ post }: { post: PostPreviewRow }) {
  const a = post.author
  const showRole = hasRole(a?.community_role ?? null)
  const initials = a?.display_name ? getInitials(a.display_name) : '?'

  return (
    <article className="rounded-2xl border border-border bg-surface shadow-sm hover:shadow-md transition-shadow">
      <div className="p-5">
        <div className="flex items-start gap-3 mb-3">
          {a?.avatar_url ? (
            <img
              src={a.avatar_url}
              alt={a.display_name}
              className="w-10 h-10 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-surface-elevated text-muted text-xs font-semibold flex items-center justify-center shrink-0 select-none">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-semibold text-text truncate">
                {a?.display_name ?? 'Community member'}
              </span>
              {showRole && (
                <RoleBadge role={a!.community_role as CommunityRole} className="text-[10px] leading-tight" />
              )}
            </div>
            <p className="text-xs text-subtle mt-0.5">
              {a?.handle && <>@{a.handle} · </>}
              {relativeTime(post.created_at)}
            </p>
          </div>
        </div>

        <p className="text-base text-text leading-relaxed line-clamp-3">{post.body}</p>

        {post.media_urls?.length > 0 && (
          <div className="mt-3 rounded-xl overflow-hidden border border-border">
            <img
              src={post.media_urls[0]}
              alt="Post attachment"
              loading="lazy"
              className="w-full max-h-72 object-cover"
            />
          </div>
        )}
      </div>
    </article>
  )
}
