import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/layout/site-header'
import { MarketingFooter } from '@/components/layout/marketing-footer'
import { Statement, ZigZag, Marquee, BetaCTA } from '@/components/marketing/marketing-ui'
import { getInitials, relativeTime } from '@/lib/utils'
import { SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION, BETA_CTA_LABEL, BETA_CTA_HREF } from '@/lib/site'
import { type CommunityRole, ROLE_RANK, RoleBadge } from '@/lib/community-roles'

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} — ${SITE_TAGLINE}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
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

  // Anon reads go through SECURITY DEFINER RPCs (redacted columns; events
  // expose only the circle's city, never the address).
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
      <SiteHeader profile={null} variant="dark" />

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
          style={{ backgroundImage: 'url(/images/site/lab-lounge.jpg)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/60 to-black/85" />

        <div className="relative z-10 flex flex-col items-center w-full max-w-4xl">
          <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.25em] text-white/60 mb-6">
            A third space for a disconnected generation
          </p>
          <h1 className="text-[2.6rem] sm:text-6xl lg:text-7xl font-black text-white tracking-tight leading-[1.04] mb-6">
            This is what community<br className="hidden sm:block" /> is supposed to feel like.
          </h1>
          <p className="text-base sm:text-xl text-white/80 max-w-xl leading-relaxed mb-10">
            Not home. Not work. A place to exhale, reset, and be human —
            together.
          </p>

          <div className="flex items-center gap-3 flex-wrap justify-center">
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
          <span className="text-[11px] font-semibold tracking-widest uppercase">See the vision</span>
          <ChevronDown className="w-5 h-5 animate-bounce" />
        </div>
      </section>

      {/* ── Problem ────────────────────────────────────────────── */}
      <ZigZag
        img="/images/site/community-1.jpg"
        alt="A Frequency community gathering"
        eyebrow="Something is broken"
        title="And everyone feels it."
      >
        <p>
          67% of millennials and Gen Z report feeling lonely. It isn&apos;t for
          lack of people — it&apos;s for lack of <em>places</em>.
        </p>
        <p>
          The third spaces that used to hold us have quietly disappeared. We
          replaced them with feeds. It didn&apos;t work.
        </p>
      </ZigZag>

      {/* ── Story ──────────────────────────────────────────────── */}
      <ZigZag
        img="/images/site/moonlight-2.jpg"
        alt="A Frequency gathering on the bluffs at Moonlight Beach"
        eyebrow="The Frequency story"
        title="Moonlight and the Mission"
        reverse
        tone="canvas"
        cta={{ label: 'Read the full story', href: '/about' }}
      >
        <p>It started on the cliffs of Moonlight Beach in 2020.</p>
        <p>
          A few of us gathered every morning to breathe and reconnect. Within
          eighteen months, a thousand people were showing up. No guru, no brand
          — just people who needed each other.
        </p>
        <p>
          It proved the hunger is enormous. It also proved that without a home,
          even the most beautiful community can&apos;t last.
        </p>
      </ZigZag>

      <Statement>
        That&apos;s when the seed of{' '}
        <span className="text-primary-strong">Frequency</span> was first planted.
      </Statement>

      {/* ── Vision ─────────────────────────────────────────────── */}
      <ZigZag
        img="/images/site/lab-storefront.jpg"
        alt="Concept render of a Frequency Lab hosting a movement class"
        eyebrow="The vision"
        title="A place where the environment does the work."
        cta={{ label: 'See how it works', href: '/how-it-works' }}
      >
        <p>
          Frequency is social infrastructure <em>and</em> physical space —
          designed, from the ground up, to regulate your nervous system and
          bring you back to people who see you.
        </p>
        <p>
          Guru-free. Built to outlast any one person. A model that puts
          connection within reach for everyone.
        </p>
      </ZigZag>

      <Statement tone="surface">
        Starting in{' '}
        <span className="text-primary-strong">North County San Diego.</span>
        <br className="hidden sm:block" /> Coming to your city.
      </Statement>

      {/* ── What we're building (dark band) ────────────────────── */}
      <section className="bg-text">
        <Marquee items={['What we’re building', 'The Lab', 'The Network', 'The Model']} />
        <div className="max-w-5xl mx-auto px-6 py-16 sm:py-24 space-y-16">
          <Pillar
            img="/images/site/lab-storefront.jpg"
            alt="The Lab"
            label="01 — The Lab"
            title="The Lab"
            body="A prototype third space: movement studios, a thermal circuit, a connection bar, and an events floor. The environment does the work."
            href="/the-lab"
          />
          <Pillar
            img="/images/site/community-1.jpg"
            alt="The Network"
            label="02 — The Network"
            title="The Network"
            body="A community that spreads city by city. Circles cluster into neighborhoods, neighborhoods into whole areas — bottom-up, never appointed."
            href="/how-it-works"
            reverse
          />
          <Pillar
            img="/images/site/lab-lounge.jpg"
            alt="The Model"
            label="03 — The Model"
            title="The Model"
            body="Built to last and built to include. Memberships sustain the spaces so connection stays within reach. Circulation, not exclusion."
          />
        </div>
      </section>

      {/* ── It's already alive (live data) ─────────────────────── */}
      <section className="bg-surface px-6 pt-20 pb-10">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-strong mb-3">
            Not a someday idea
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-text mb-8">
            It&apos;s already happening.
          </h2>
          <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
            <Stat value={memberCount} label="Members" />
            <Stat value={circleCount} label="Circles" />
            <Stat value={upcomingEvents.length} label="Events soon" />
          </div>
        </div>
      </section>

      {/* Upcoming events */}
      {upcomingEvents.length > 0 && (
        <section className="bg-surface px-6 pb-16">
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
                    <p className="text-sm font-semibold text-text truncate">{event.title}</p>
                    <p className="text-xs text-subtle mt-0.5">
                      {dateStr}
                      {event.city && <> &middot; {event.city}</>}
                    </p>
                  </div>
                  <Link
                    href={BETA_CTA_HREF}
                    className="flex items-center gap-1 text-xs font-semibold text-primary-strong hover:underline shrink-0"
                  >
                    Join <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Community posts */}
      {posts.length > 0 && (
        <section className="bg-marketing-canvas px-6 py-16">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-center text-2xl sm:text-3xl font-bold text-text mb-10">
              People showing up for each other
            </h2>
            <div className="space-y-3">
              {posts.map((post) => (
                <PostPreviewCard key={post.id} post={post} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Closing CTA ────────────────────────────────────────── */}
      <BetaCTA
        heading="Be one of the first."
        body="We're opening the community to a small group at a time. Add your name and we'll be in touch."
      />

      <MarketingFooter />
    </>
  )
}

// ── Building blocks ─────────────────────────────────────────────────────────

// Dark-band pillar: circular image + text, alternating sides.
function Pillar({
  img,
  alt,
  label,
  title,
  body,
  href,
  reverse = false,
}: {
  img: string
  alt: string
  label: string
  title: string
  body: string
  href?: string
  reverse?: boolean
}) {
  return (
    <div
      className={`flex flex-col sm:flex-row items-center gap-7 sm:gap-12 ${
        reverse ? 'sm:flex-row-reverse' : ''
      }`}
    >
      <img
        src={img}
        alt={alt}
        loading="lazy"
        className="w-44 h-44 sm:w-60 sm:h-60 rounded-full object-cover border border-white/10 shrink-0"
      />
      <div className="flex-1 text-center sm:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary mb-2">{label}</p>
        <h3 className="text-2xl sm:text-3xl font-black text-white mb-3 tracking-tight">{title}</h3>
        <p className="text-white/55 leading-relaxed max-w-md mx-auto sm:mx-0">{body}</p>
        {href && (
          <Link
            href={href}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            Learn more <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <p className="text-3xl sm:text-4xl font-black text-text">{value}</p>
      <p className="text-[11px] text-subtle mt-1.5 uppercase tracking-widest font-semibold">{label}</p>
    </div>
  )
}

function PostPreviewCard({ post }: { post: PostPreviewRow }) {
  const a = post.author
  const showRole = hasRole(a?.community_role ?? null)
  const initials = a?.display_name ? getInitials(a.display_name) : '?'

  return (
    <article className="rounded-2xl border border-border bg-surface shadow-sm hover:shadow-md transition-shadow">
      <div className="p-4">
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
              <span className="text-sm font-semibold text-text truncate">
                {a?.display_name ?? 'Community member'}
              </span>
              {showRole && (
                <RoleBadge role={a!.community_role as CommunityRole} className="text-[10px] leading-tight" />
              )}
            </div>
            <p className="text-[11px] text-subtle mt-0.5">
              {a?.handle && <>@{a.handle} · </>}
              {relativeTime(post.created_at)}
            </p>
          </div>
        </div>

        <p className="text-sm text-text leading-relaxed line-clamp-3 mb-3">{post.body}</p>

        {post.media_urls?.length > 0 && (
          <div className="rounded-xl overflow-hidden border border-border">
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
