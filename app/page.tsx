import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, Users, CalendarDays, Globe, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

  const admin = createAdminClient()

  const [postsResult, statsResult, eventsResult] = await Promise.all([
    admin
      .from('posts')
      .select(
        `id, body, created_at, media_urls,
         author:profiles!author_id ( display_name, handle, avatar_url, community_role )`
      )
      .eq('visibility', 'public')
      .is('parent_id', null)
      .order('created_at', { ascending: false })
      .limit(5),
    admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    admin
      .from('events')
      .select('id, title, starts_at, location, slug')
      .eq('is_cancelled', false)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(3),
  ])

  const posts = (postsResult.data ?? []) as unknown as PostPreviewRow[]
  const memberCount = statsResult.count ?? 0
  const upcomingEvents = (eventsResult.data ?? []) as { id: string; title: string; starts_at: string; location: string | null; slug: string }[]

  return (
    <>
      <SiteHeader profile={null} variant="dark" />

      {/* ── Hero with background image ─────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 overflow-hidden">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'url(/images/hero.jpg)' }}
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/60" />

        <div className="relative z-10 flex flex-col items-center max-w-3xl">
          <img
            src="/frequency-logo.png"
            alt="Frequency"
            className="h-14 sm:h-20 w-auto invert mb-8 sm:mb-10"
          />

          <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-tight mb-5">
            Your Community Revolution
          </h1>
          <p className="text-base sm:text-lg text-gray-300 max-w-xl leading-relaxed mb-10">
            Join local circles, show up for real-world events, and build lasting
            friendships with people who actually live near you. Frequency
            connects neighborhoods into a worldwide movement of human connection.
          </p>

          <div className="flex items-center gap-3 flex-wrap justify-center">
            <Link
              href="/sign-in"
              className="rounded-xl bg-white px-8 py-3.5 text-sm font-bold text-gray-900 hover:bg-gray-100 transition-colors shadow-lg"
            >
              Get started
            </Link>
            <Link
              href="/sign-in"
              className="rounded-xl border border-white/25 px-8 py-3.5 text-sm font-medium text-white hover:bg-white/10 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 flex flex-col items-center gap-1.5 text-white/50">
          <span className="text-xs font-medium tracking-wide uppercase">
            See what&apos;s happening
          </span>
          <ChevronDown className="w-4 h-4 animate-bounce" />
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────── */}
      <section className="bg-white dark:bg-gray-950 px-6 py-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-center text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-50 mb-3">
            How Frequency works
          </h2>
          <p className="text-center text-gray-500 dark:text-gray-400 mb-14 max-w-lg mx-auto">
            A real community platform built for in-person connection, not
            infinite scrolling.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard
              icon={Users}
              title="Find your circle"
              description="Join a local group of up to 50 people. Small enough to know everyone, big enough to always have plans."
            />
            <FeatureCard
              icon={CalendarDays}
              title="Show up in person"
              description="Weekly events, group rides, and gatherings organized by your circle. RSVP and see who is going."
            />
            <FeatureCard
              icon={Globe}
              title="Part of something bigger"
              description="Your circle is one node in a worldwide network. Travel anywhere and plug into the local Frequency community."
            />
            <FeatureCard
              icon={Zap}
              title="Earn your role"
              description="Contribute to your community and grow from Member to Crew, Host, Guide, and beyond. Leadership is earned here."
            />
          </div>
        </div>
      </section>

      {/* ── Stats bar ──────────────────────────────────────────── */}
      <section className="bg-gray-50 dark:bg-gray-900 border-y border-gray-200/60 dark:border-gray-800/60 px-6 py-10">
        <div className="max-w-3xl mx-auto flex items-center justify-center gap-12 sm:gap-20 flex-wrap">
          <StatItem value={memberCount} label="Members" />
          <StatItem value={upcomingEvents.length} label="Upcoming events" />
          <StatItem value="Free" label="To join" />
        </div>
      </section>

      {/* ── Upcoming events ────────────────────────────────────── */}
      {upcomingEvents.length > 0 && (
        <section className="bg-white dark:bg-gray-950 px-6 py-16">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-center text-xs font-semibold uppercase tracking-widest text-gray-400 mb-8">
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
                    className="flex items-center gap-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 py-3.5"
                  >
                    <div className="shrink-0 w-11 h-11 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex flex-col items-center justify-center">
                      <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 leading-none">{month}</span>
                      <span className="text-sm font-bold text-amber-700 dark:text-amber-300 leading-tight">{day}</span>
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
                      className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
                    >
                      RSVP
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
        <section className="bg-gray-50 dark:bg-gray-900 px-4 py-16">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-center text-xs font-semibold uppercase tracking-widest text-gray-400 mb-8">
              From the community
            </h2>

            <div className="space-y-3">
              {posts.map((post) => (
                <PostPreviewCard key={post.id} post={post} />
              ))}
            </div>

            {/* Sign-up wall */}
            <div className="relative mt-2">
              <div className="absolute -top-20 inset-x-0 h-20 bg-gradient-to-b from-transparent to-gray-50 dark:to-gray-900 pointer-events-none" />

              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-8 text-center shadow-sm">
                <p className="text-lg font-bold text-gray-900 dark:text-gray-50 mb-1">
                  Join to see more
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-5 max-w-xs mx-auto">
                  Create a free account to access the full feed, events, and
                  your local circle.
                </p>
                <Link
                  href="/sign-in"
                  className="inline-block rounded-xl bg-gray-900 dark:bg-white px-6 py-2.5 text-sm font-bold text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors"
                >
                  Get started
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Final CTA ──────────────────────────────────────────── */}
      <section className="bg-gray-950 px-6 py-20 text-center">
        <div className="max-w-md mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Ready to find your people?
          </h2>
          <p className="text-gray-400 mb-8 leading-relaxed">
            Frequency is free to join. Sign up, find a circle near you, and
            start showing up for your community this week.
          </p>
          <Link
            href="/sign-in"
            className="inline-block rounded-xl bg-indigo-600 px-8 py-3.5 text-sm font-bold text-white hover:bg-indigo-500 transition-colors shadow-lg"
          >
            Join Frequency
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="bg-gray-950 border-t border-gray-800/60 px-6 py-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/frequency-logo.png" alt="Frequency" className="h-5 w-auto invert opacity-50" />
            <span className="text-xs text-gray-500">&copy; {new Date().getFullYear()} Frequency Labs Holdings</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-gray-500">
            <Link href="/privacy" className="hover:text-gray-300 transition-colors">Privacy</Link>
            <a href="mailto:hello@findafreq.com" className="hover:text-gray-300 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="text-center sm:text-left">
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 mb-4">
        <Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
      </div>
      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-50 mb-1.5">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{description}</p>
    </div>
  )
}

function StatItem({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-50">{value}</p>
      <p className="text-xs text-gray-400 mt-1 uppercase tracking-wide font-medium">{label}</p>
    </div>
  )
}

function PostPreviewCard({ post }: { post: PostPreviewRow }) {
  const a = post.author
  const roleCls = a?.community_role ? ROLE_COLOR[a.community_role] : null
  const initials = a?.display_name ? getInitials(a.display_name) : '?'

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 py-3.5">
      <div className="flex items-center gap-2.5 mb-2.5">
        {a?.avatar_url ? (
          <img
            src={a.avatar_url}
            alt={a.display_name}
            className="w-8 h-8 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 text-xs font-semibold flex items-center justify-center shrink-0 select-none">
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
        <div className="mt-2.5 rounded-lg overflow-hidden">
          <img
            src={post.media_urls[0]}
            alt="Post attachment"
            loading="lazy"
            className="w-full max-h-48 object-cover"
          />
        </div>
      )}
    </div>
  )
}
