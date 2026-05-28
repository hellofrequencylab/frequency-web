import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { JoinButton } from './join-button'

interface Props {
  params: Promise<{ token: string }>
}

export default async function JoinPage({ params }: Props) {
  const { token } = await params
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

  const circle = link.circle as any
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center px-4 py-16">
      {/* Brand header */}
      <div className="mb-8 text-center">
        <span className="text-2xl font-black tracking-tight text-gray-900 dark:text-gray-50">
          frequency
        </span>
      </div>

      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
          {/* Circle card */}
          <div className="p-8">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 capitalize">
                {circle.type}
              </span>
              {circle.hub?.name && (
                <span className="text-xs text-gray-400">{circle.hub.name}</span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mt-3 mb-2">
              {circle.name}
            </h1>

            {circle.about && (
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
                {circle.about}
              </p>
            )}

            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800 pt-4">
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
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  You're already a member of this circle.
                </p>
                <Link
                  href="/circles"
                  className="block w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white text-center hover:bg-indigo-700 transition-colors"
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
                  className="block w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white text-center hover:bg-indigo-700 transition-colors"
                >
                  Sign in to join
                </Link>
                <p className="text-xs text-center text-gray-400">
                  Don't have an account?{' '}
                  <Link href={`/sign-in?next=/join/${token}`} className="text-indigo-500 hover:underline">
                    Get started
                  </Link>
                </p>
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-center text-gray-400 mt-6">
          You were invited to join Frequency. By joining, you agree to our community guidelines.
        </p>
      </div>
    </div>
  )
}
