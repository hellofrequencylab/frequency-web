import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Hash, Plus, EyeOff, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { archiveChannel } from '../actions'
import { NewChannelCompose } from '@/components/compose/new-channel-compose'

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100/80 dark:border-gray-800/50">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{title}</h3>
      </div>
      {children}
    </div>
  )
}

const TYPE_COLOR: Record<string, string> = {
  group:  'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  event:  'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  thread: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}

export default async function AdminChannelsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile || !['host', 'guide', 'mentor', 'janitor'].includes(profile.community_role)) notFound()

  // Derive scope options for the New Channel modal from the admin's primary circle
  const scopeOptions: { scope: 'hub' | 'nexus' | 'outpost'; scopeId: string; label: string }[] = []
  const { data: membership } = await admin
    .from('memberships')
    .select(`circle:circles!circle_id (
      hub:hubs!hub_id ( id, name, nexus:nexuses!nexus_id ( id, name, outpost:outposts!outpost_id ( id, name ) ) )
    )`)
    .eq('profile_id', profile.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (membership) {
    const m = membership as unknown as { circle: { hub: { id: string; name: string; nexus: { id: string; name: string; outpost: { id: string; name: string } | null } | null } | null } | null }
    const hub = m.circle?.hub
    const nexus = hub?.nexus
    const outpost = nexus?.outpost
    if (hub) scopeOptions.push({ scope: 'hub', scopeId: hub.id, label: `Hub: ${hub.name}` })
    if (nexus) scopeOptions.push({ scope: 'nexus', scopeId: nexus.id, label: `Nexus: ${nexus.name}` })
    if (outpost) scopeOptions.push({ scope: 'outpost', scopeId: outpost.id, label: `Outpost: ${outpost.name}` })
  }

  // Fetch all channels the admin has scope over
  const { data: channels } = await admin
    .from('channels')
    .select(`id, name, description, type, scope, is_public, created_at,
             creator:profiles!creator_id ( display_name )`)
    .order('created_at', { ascending: false })

  type ChannelRow = {
    id: string; name: string; description: string | null; type: string;
    scope: string; is_public: boolean; created_at: string; creator: { display_name: string } | null;
  }
  const typedChannels = (channels ?? []) as unknown as ChannelRow[]
  const visible  = typedChannels.filter((c) => c.is_public)
  const hidden   = typedChannels.filter((c) => !c.is_public)

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Channels</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage channels across your scope. Archiving hides from discovery.
          </p>
        </div>
        {scopeOptions.length > 0 && <NewChannelCompose scopeOptions={scopeOptions} />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2">
          {/* Active */}
          <div className="space-y-2 mb-6">
            {visible.length === 0 && (
              <p className="text-sm text-gray-400 py-6 text-center">No public channels yet.</p>
            )}
            {visible.map((ch) => (
              <div key={ch.id} className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 group">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-50 dark:bg-gray-800 shrink-0">
                  <Hash className="w-4 h-4 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{ch.name}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium capitalize ${TYPE_COLOR[ch.type] ?? TYPE_COLOR.group}`}>
                      {ch.type}
                    </span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 font-medium capitalize">
                      {ch.scope}
                    </span>
                  </div>
                  {ch.description && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{ch.description}</p>
                  )}
                </div>
                <form action={archiveChannel.bind(null, ch.id)}>
                  <button
                    type="submit"
                    title="Hide from discovery"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-all"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            ))}
          </div>

          {/* Hidden */}
          {hidden.length > 0 && (
            <details>
              <summary className="text-xs font-medium text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                {hidden.length} hidden channel{hidden.length > 1 ? 's' : ''}
              </summary>
              <div className="space-y-2 mt-2 opacity-60">
                {hidden.map((ch) => (
                  <div key={ch.id} className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-gray-800 px-4 py-3">
                    <Hash className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-500 flex-1">{ch.name}</span>
                    <span className="text-xs text-gray-400">hidden</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <SidebarCard title="Quick Actions">
            <div className="p-2 space-y-0.5">
              <Link href="/channels/new" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <Plus className="w-4 h-4 text-gray-400" /> New Channel
              </Link>
            </div>
            <p className="px-4 py-3 text-xs text-gray-400">Hidden channels are removed from discovery but remain accessible via direct link.</p>
          </SidebarCard>
        </div>
      </div>
    </div>
  )
}
