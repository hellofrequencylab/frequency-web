import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Hash, Plus, EyeOff, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { archiveChannel } from '../actions'
import { NewChannelCompose } from '@/components/compose/new-channel-compose'

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{title}</h3>
      </div>
      {children}
    </div>
  )
}

const TYPE_COLOR: Record<string, string> = {
  group:  'bg-primary-bg text-primary-strong dark:bg-primary-bg dark:text-primary-strong',
  event:  'bg-warning-bg text-warning dark:bg-warning-bg dark:text-warning',
  thread: 'bg-surface-elevated text-muted dark:bg-surface-elevated dark:text-subtle',
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

  if (!profile || !['host', 'guide', 'mentor', 'janitor'].includes(profile.community_role ?? '')) notFound()

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
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Channels</h1>
          <p className="text-sm text-muted mt-1">
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
              <p className="text-sm text-subtle py-6 text-center">No public channels yet.</p>
            )}
            {visible.map((ch) => (
              <div key={ch.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 group">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-elevated shrink-0">
                  <Hash className="w-4 h-4 text-subtle" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text">{ch.name}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-md font-medium capitalize ${TYPE_COLOR[ch.type] ?? TYPE_COLOR.group}`}>
                      {ch.type}
                    </span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-surface-elevated text-muted font-medium capitalize">
                      {ch.scope}
                    </span>
                  </div>
                  {ch.description && (
                    <p className="text-xs text-subtle mt-0.5 truncate">{ch.description}</p>
                  )}
                </div>
                <form action={archiveChannel.bind(null, ch.id)}>
                  <button
                    type="submit"
                    title="Hide from discovery"
                    className="p-1.5 rounded-lg text-subtle hover:text-warning hover:bg-warning-bg dark:hover:bg-warning-bg/30 transition-all"
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
              <summary className="text-xs font-medium text-subtle cursor-pointer hover:text-muted select-none">
                {hidden.length} hidden channel{hidden.length > 1 ? 's' : ''}
              </summary>
              <div className="space-y-2 mt-2 opacity-60">
                {hidden.map((ch) => (
                  <div key={ch.id} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                    <Hash className="w-4 h-4 text-subtle shrink-0" />
                    <span className="text-sm text-muted flex-1">{ch.name}</span>
                    <span className="text-xs text-subtle">hidden</span>
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
              <Link href="/channels/new" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-text hover:bg-surface-elevated transition-colors">
                <Plus className="w-4 h-4 text-subtle" /> New Channel
              </Link>
            </div>
            <p className="px-4 py-3 text-xs text-subtle">Hidden channels are removed from discovery but remain accessible via direct link.</p>
          </SidebarCard>
        </div>
      </div>
    </div>
  )
}
