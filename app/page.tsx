import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, Users, CalendarDays, Globe, Zap, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/layout/site-header'
import { getInitials } from '@/lib/utils'

type PostPreviewRow = {
  id: string
  body: string
  created_at: string
  media_urls: string[]
  author: {
    display_name: string
    handle: string
    avatar_url: string | null
    community_role: string
  } | null
}

const ROLE_COLOR: Record<string, string> = {
  crew:   'bg-blue-100 text-blue-700',
  host:   'bg-green-100 text-green-700',
  guide:  'bg-purple-100 text-purple-700',
  mentor: 'bg-amber-100 text-amber-700',
}

export default async function RootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect('/feed')

  // Anon reads on public.posts (visibility='public') and public.events
  // (non-cancelled, future) are now allowed via the policies added in
  // 20240204000000_public_landing_reads.sql. Counts go through SECURITY
  // DEFINER RPCs so we don't have to open profiles/circles to anon SELECT.
  const [postsResult, memberCountResult, eventsResult, circleCountResult] = await Promise.all([
    supabase
      .from('posts')
      .select(
        `id, body, created_at, media_urls,
         author:profiles!author_id ( display_name, handle, avatar_url, community_role )`
      )
      .eq('visibility', 'public')
      .is('parent_id', null)
      .is('hidden_at', null)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.rpc('public_member_count'),
    supabase
      .from('events')
      .select('id, title, starts_at, location, slug')
      .eq('is_cancelled', false)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(3),
    supabase.rpc('public_active_circle_count'),
  ])

  const posts = (postsResult.data ?? []) as unknown as PostPreviewRow[]
  const memberCount = (memberCountResult.data as number | null) ?? 0
  const circleCount = (circleCountResult.data as number | null) ?? 0
  const upcomingEvents = (eventsResult.data ?? []) as { id: string; title: string; starts_at: string; location: string | null; slug: string }[]

  return (
    <>
      <SiteHeader profile={null} variant="dark" />

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
          style={{ backgroundImage: 'url(/images/hero.jpg)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/80" />

        <div className="relative z-10 flex flex-col items-center w-full max-w-5xl">
          <h1 className="text-[2.5rem] sm:text-6xl lg:text-8xl font-black text-white tracking-tight leading-none mb-6">
            Your Community Revolution
          </h1>
          <p className="text-base sm:text-xl text-white/80 max-w-2xl leading-relaxed mb-12">
            Join local circles, show up for real-world events, and build lasting
            friendships with people who live near you. One platform connecting
            neighborhoods into a worldwide movement.
          </p>

          <div className="flex items-center gap-4 flex-wrap justify-center">
            <Link
              href="/sign-in"
              className="rounded-full bg-indigo-600 px-10 py-4 text-base font-bold text-white hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-600/25 hover:shadow-indigo-500/40"
            >
              Get started
            </Link>
            <Link
              href="/sign-in"
              className="rounded-full border-2 border-white/30 px-10 py-4 text-base font-medium text-white hover:bg-white/10 hover:border-white/50 transition-all"
            >
              Sign in
            </Link>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-10 flex flex-col items-center gap-2 text-white/40">
          <span className="text-[11px] font-semibold tracking-widest uppercase">
            See what&apos;s happening
          </span>
          <ChevronDown className="w-5 h-5 animate-bounce" />
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────── */}
      <section className="bg-white dark:bg-gray-950 px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-3">
            Built for real life
          </p>
          <h2 className="text-center text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-50 mb-4">
            How Frequency works
          </h2>
          <p className="text-center text-gray-500 dark:text-gray-400 mb-16 max-w-lg mx-auto leading-relaxed">
            Not another social network. A community platform designed around
            showing up, in person, for people you actually know.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
            <FeatureCard
              icon={Users}
              title="Find your circle"
              description="Join a local group of up to 50 people. Small enough to know everyone, big enough to always have plans."
              color="indigo"
            />
            <FeatureCard
              icon={CalendarDays}
              title="Show up in person"
              description="Weekly events, group rides, and gatherings organized by your circle. RSVP and see who is going."
              color="amber"
            />
            <FeatureCard
              icon={Globe}
              title="Part of something bigger"
              description="Your circle connects to a worldwide network. Travel anywhere and plug into the local Frequency community."
              color="green"
            />
            <FeatureCard
              icon={Zap}
              title="Earn your role"
              description="Contribute and grow from Member to Crew, Host, Guide, and beyond. Leadership is earned here, not assigned."
              color="violet"
            />
          </div>
        </div>
      </section>

      {/* ── Stats bar ──────────────────────────────────────────── */}
      <section className="bg-gray-950 px-6 py-14">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-16 sm:gap-24 flex-wrap">
          <StatItem value={memberCount} label="Members" />
          <StatItem value={circleCount} label="Circles" />
          <StatItem value={upcomingEvents.length} label="Upcoming events" />
          <StatItem value="Free" label="To join" />
        </div>
      </section>

      {/* ── Upcoming events ────────────────────────────────────── */}
      {upcomingEvents.length > 0 && (
        <section className="bg-white dark:bg-gray-950 px-6 py-20">
          <div className="max-w-2xl mx-auto">
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-3">
              Coming up
            </p>
            <h2 className="text-center text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-50 mb-10">
              Upcoming events
            </h2>
            <div className="space-y-3">
              {upcomingEvents.map((event) => {
                const d = new Date(event.starts_at)
                const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
                const day = d.getDate()
                const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                return (
                  <div
                    key={event.id}
                    className="flex items-center gap-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-5 py-4 hover:border-amber-200 dark:hover:border-amber-800 transition-colors"
                  >
                    <div className="shrink-0 w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/30 flex flex-col items-center justify-center">
                      <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 leading-none">{month}</span>
                      <span className="text-base font-bold text-amber-700 dark:text-amber-300 leading-tight">{day}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">{event.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {dateStr}
                        {event.location && <> &middot; {event.location}</>}
                      </p>
                    </div>
                    <Link
                      href="/sign-in"
                      className="flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
                    >
                      RSVP <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Feed preview ───────────────────────────────────────── */}
      {posts.length > 0 && (
        <section className="bg-gray-50 dark:bg-gray-900 px-6 py-20">
          <div className="max-w-2xl mx-auto">
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-3">
              What people are saying
            </p>
            <h2 className="text-center text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-50 mb-10">
              From the community
            </h2>

            <div className="space-y-3">
              {posts.map((post) => (
                <PostPreviewCard key={post.id} post={post} />
              ))}
            </div>

            <div className="relative mt-3">
              <div className="absolute -top-16 inset-x-0 h-16 bg-gradient-to-b from-transparent to-gray-50 dark:to-gray-900 pointer-events-none" />

              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-10 text-center shadow-sm">
                <p className="text-xl font-bold text-gray-900 dark:text-gray-50 mb-2">
                  Join to see more
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-6 max-w-sm mx-auto">
                  Create a free account to access the full feed, events, and
                  your local circle.
                </p>
                <Link
                  href="/sign-in"
                  className="inline-block rounded-full bg-indigo-600 px-8 py-3 text-sm font-bold text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20"
                >
                  Get started
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Final CTA ──────────────────────────────────────────── */}
      <section className="relative bg-gray-950 px-6 py-24 text-center overflow-hidden">
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 50%, #4f46e5 0%, transparent 70%)',
          }}
        />
        <div className="relative max-w-lg mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to find your people?
          </h2>
          <p className="text-gray-400 mb-10 leading-relaxed text-lg">
            Frequency is free to join. Sign up, find a circle near you, and
            start showing up for your community this week.
          </p>
          <Link
            href="/sign-in"
            className="inline-block rounded-full bg-indigo-600 px-10 py-4 text-base font-bold text-white hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-600/25 hover:shadow-indigo-500/40"
          >
            Join Frequency
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="bg-gray-950 border-t border-gray-800/60 px-6 py-10">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <img src="/frequency-logo.png" alt="Frequency" className="h-5 w-auto invert opacity-40" />
            <span className="text-xs text-gray-600">&copy; {new Date().getFullYear()} Frequency Labs Holdings</span>
          </div>
          <div className="flex items-center gap-8 text-xs text-gray-500">
            <Link href="/privacy" className="hover:text-gray-300 transition-colors">Privacy</Link>
            <a href="mailto:hello@findafreq.com" className="hover:text-gray-300 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </>
  )
}

const FEATURE_COLORS: Record<string, { bg: string; icon: string }> = {
  indigo: { bg: 'bg-indigo-50 dark:bg-indigo-950/30', icon: 'text-indigo-600 dark:text-indigo-400' },
  amber:  { bg: 'bg-amber-50 dark:bg-amber-950/30',   icon: 'text-amber-600 dark:text-amber-400' },
  green:  { bg: 'bg-green-50 dark:bg-green-950/30',   icon: 'text-green-600 dark:text-green-400' },
  violet: { bg: 'bg-violet-50 dark:bg-violet-950/30', icon: 'text-violet-600 dark:text-violet-400' },
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  color,
}: {
  icon: React.ElementType
  title: string
  description: string
  color: string
}) {
  const c = FEATURE_COLORS[color] ?? FEATURE_COLORS.indigo
  return (
    <div className="text-center">
      <div className={`inline-flex items-center justify-center w-12 h-12 rounded-2xl ${c.bg} mb-5`}>
        <Icon className={`w-5 h-5 ${c.icon}`} />
      </div>
      <h3 className="text-base font-bold text-gray-900 dark:text-gray-50 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{description}</p>
    </div>
  )
}

function StatItem({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-3xl sm:text-4xl font-bold text-white">{value}</p>
      <p className="text-xs text-gray-500 mt-1.5 uppercase tracking-widest font-medium">{label}</p>
    </div>
  )
}

function PostPreviewCard({ post }: { post: PostPreviewRow }) {
  const a = post.author
  const roleCls = a?.community_role ? ROLE_COLOR[a.community_role] : null
  const initials = a?.display_name ? getInitials(a.display_name) : '?'

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-5 py-4 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-3">
        {a?.avatar_url ? (
          <img
            src={a.avatar_url}
            alt={a.display_name}
            className="w-9 h-9 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 text-xs font-semibold flex items-center justify-center shrink-0 select-none">
            {initials}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">
            {a?.display_name ?? 'Community member'}
          </span>
          {roleCls && (
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium capitalize ${roleCls}`}>
              {a!.community_role}
            </span>
          )}
        </div>
        <span className="ml-auto text-xs text-gray-400 shrink-0">
          {new Date(post.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </span>
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-3">
        {post.body}
      </p>
      {post.media_urls?.length > 0 && (
        <div className="mt-3 rounded-xl overflow-hidden">
          <img
            src={post.media_urls[0]}
            alt="Post attachment"
            loading="lazy"
            className="w-full max-h-52 object-cover"
          />
        </div>
      )}
    </div>
  )
}
