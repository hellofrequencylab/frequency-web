import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SiteHeader } from '@/components/layout/site-header'
import { getInitials } from '@/lib/utils'

type PostPreviewRow = {
  id: string
  body: string
  created_at: string
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

  // Authenticated users skip the landing page
  if (user) redirect('/feed')

  // Fetch a few public posts to preview
  const admin = createAdminClient()
  const { data: rawPosts } = await admin
    .from('posts')
    .select(
      `id, body, created_at,
       author:profiles!author_id ( display_name, handle, avatar_url, community_role )`
    )
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(4)

  const posts = (rawPosts ?? []) as unknown as PostPreviewRow[]

  return (
    <>
      {/* Dark transparent header over the hero */}
      <SiteHeader profile={null} variant="dark" />

      {/* ── Fullscreen hero ──────────────────────────────────── */}
      <section className="relative min-h-screen bg-gray-950 flex flex-col items-center justify-center text-center px-6 overflow-hidden">

        {/* Subtle radial gradient backdrop */}
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% 40%, #3b3b3b 0%, transparent 70%)',
          }}
        />

        <div className="relative z-10 flex flex-col items-center">
          {/* Logo — large */}
          <img
            src="/frequency-logo.png"
            alt="Frequency"
            className="h-14 sm:h-20 w-auto invert mb-8 sm:mb-10"
          />

          <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-tight mb-4">
            Your local community.
          </h1>
          <p className="text-base sm:text-lg text-gray-400 max-w-sm sm:max-w-md leading-relaxed mb-10">
            Connect with riders in your area. Find your circle, join events, and
            show up for each other — every week.
          </p>

          <div className="flex items-center gap-3 flex-wrap justify-center">
            <Link
              href="/sign-in"
              className="rounded-xl bg-white px-7 py-3 text-sm font-bold text-gray-900 hover:bg-gray-100 transition-colors"
            >
              Get started →
            </Link>
            <Link
              href="/sign-in"
              className="rounded-xl border border-white/20 px-7 py-3 text-sm font-medium text-white hover:bg-white/10 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>

        {/* Scroll hint */}
        {posts.length > 0 && (
          <div className="absolute bottom-8 flex flex-col items-center gap-1.5 text-gray-500">
            <span className="text-xs font-medium tracking-wide uppercase">
              From the community
            </span>
            <ChevronDown className="w-4 h-4 animate-bounce" />
          </div>
        )}
      </section>

      {/* ── Public feed preview ──────────────────────────────── */}
      {posts.length > 0 && (
        <section className="bg-gray-50 dark:bg-gray-900 px-4 py-14">
          <div className="max-w-lg mx-auto">
            <h2 className="text-center text-xs font-semibold uppercase tracking-widest text-gray-400 mb-8">
              Recent posts
            </h2>

            <div className="space-y-3">
              {posts.map((post) => (
                <PostPreviewCard key={post.id} post={post} />
              ))}
            </div>

            {/* Sign-up wall */}
            <div className="relative mt-2">
              {/* Gradient fade over last card */}
              <div className="absolute -top-20 inset-x-0 h-20 bg-gradient-to-b from-transparent to-gray-50 dark:to-gray-900 pointer-events-none" />

              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-8 text-center shadow-sm">
                <p className="text-base font-bold text-gray-900 dark:text-gray-50 mb-1">
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
                  Get started →
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Empty state (no public posts yet) ───────────────── */}
      {posts.length === 0 && (
        <section className="bg-gray-50 dark:bg-gray-900 px-4 py-20 text-center">
          <p className="text-sm text-gray-400 mb-6">
            Be the first to post in your community.
          </p>
          <Link
            href="/sign-in"
            className="inline-block rounded-xl bg-gray-900 dark:bg-white px-6 py-2.5 text-sm font-bold text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors"
          >
            Get started →
          </Link>
        </section>
      )}
    </>
  )
}

// ── Post preview card ─────────────────────────────────────────────────────────

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
    </div>
  )
}
