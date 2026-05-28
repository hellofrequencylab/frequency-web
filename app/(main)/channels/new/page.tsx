import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ChannelForm } from './channel-form'

type ScopeOption = {
  scope: 'hub' | 'nexus' | 'outpost'
  scopeId: string
  label: string
}

export default async function NewChannelPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) notFound()

  const creatableRoles = ['host', 'guide', 'mentor', 'janitor']
  if (!creatableRoles.includes(profile.community_role)) notFound()

  // Build scope options based on the user's role and position in hierarchy
  const { data: membership } = await admin
    .from('memberships')
    .select(
      `circle_id,
       circle:circles!circle_id (
         hub:hubs!hub_id (
           id, name,
           nexus:nexuses!nexus_id (
             id, name,
             outpost:outposts!outpost_id ( id, name )
           )
         )
       )`
    )
    .eq('profile_id', profile.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const m = membership as { circle: { hub: { id: string; name: string; nexus: { id: string; name: string; outpost: { id: string; name: string } | null } | null } | null } | null } | null
  const hubId = m?.circle?.hub?.id ?? null
  const hubName = m?.circle?.hub?.name ?? null
  const nexusId = m?.circle?.hub?.nexus?.id ?? null
  const nexusName = m?.circle?.hub?.nexus?.name ?? null
  const outpostId = m?.circle?.hub?.nexus?.outpost?.id ?? null
  const outpostName = m?.circle?.hub?.nexus?.outpost?.name ?? null

  const scopeOptions: ScopeOption[] = []

  // host → can only create hub-scoped channels
  if (hubId && hubName) {
    scopeOptions.push({ scope: 'hub', scopeId: hubId, label: `${hubName} (Hub)` })
  }

  // guide+ → also nexus-scoped
  if (['guide', 'mentor'].includes(profile.community_role) && nexusId && nexusName) {
    scopeOptions.push({ scope: 'nexus', scopeId: nexusId, label: `${nexusName} (Nexus)` })
  }

  // mentor → also outpost-scoped
  if (profile.community_role === 'mentor' && outpostId && outpostName) {
    scopeOptions.push({ scope: 'outpost', scopeId: outpostId, label: `${outpostName} (Outpost)` })
  }

  if (scopeOptions.length === 0) {
    return (
      <div>
        <p className="text-sm text-gray-500">
          You need to be in a circle to create a channel.{' '}
          <Link href="/circles" className="text-indigo-600 hover:underline">
            Join a circle first.
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div>
      <Link
        href="/channels"
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-5 transition-colors"
      >
        ← Channels
      </Link>

      <h1 className="text-xl font-semibold text-gray-900 mb-6">Create a Channel</h1>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <ChannelForm scopeOptions={scopeOptions} />
      </div>
    </div>
  )
}
