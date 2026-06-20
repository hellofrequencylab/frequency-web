import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { FocusTemplate } from '@/components/templates'
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
          <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
            {/* Circle card */}
            <div className="p-8">
              <div className="flex items-center gap-4 text-xs text-muted">
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
                  <p className="text-sm text-muted">
                    You&apos;re already a member of this circle.
                  </p>
                  <Link
                    href="/circles"
                    className="block w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-on-primary text-center hover:bg-primary-hover transition-colors"
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
                    className="block w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-on-primary text-center hover:bg-primary-hover transition-colors"
                  >
                    Sign in to join
                  </Link>
                  <p className="text-xs text-center text-subtle">
                    Don&apos;t have an account?{' '}
                    <Link href={`/sign-in?next=/join/${token}`} className="text-primary-strong hover:underline">
                      Get started
                    </Link>
                  </p>
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-center text-subtle mt-6">
            You were invited to join Frequency. By joining, you agree to our community guidelines.
          </p>
        </div>
      </FocusTemplate>
    </div>
  )
}
