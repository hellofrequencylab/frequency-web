import { Hash, EyeOff } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { archiveChannel } from '../actions'
import { NewChannelCompose } from '@/components/compose/new-channel-compose'


const TYPE_COLOR: Record<string, string> = {
  group:  'bg-primary-bg text-primary-strong dark:bg-primary-bg dark:text-primary-strong',
  event:  'bg-warning-bg text-warning dark:bg-warning-bg dark:text-warning',
  thread: 'bg-surface-elevated text-muted dark:bg-surface-elevated dark:text-subtle',
}

export default async function AdminChannelsPage() {
  const { profileId } = await requireAdmin('host', { staff: 'community' })
  const admin = createAdminClient()

  // Derive scope options for the New Channel modal from the admin's primary circle
  const scopeOptions: { scope: 'hub' | 'nexus' | 'outpost'; scopeId: string; label: string }[] = []
  const { data: membership } = await admin
    .from('memberships')
    .select(`circle:circles!circle_id (
      hub:hubs!hub_id ( id, name, nexus:nexuses!nexus_id ( id, name, outpost:outposts!outpost_id ( id, name ) ) )
    )`)
    .eq('profile_id', profileId)
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
    <AdminPage
      title="Channels"
      eyebrow="Community"
      description="Manage channels across your scope. Archiving hides from discovery."
      actions={scopeOptions.length > 0 ? <NewChannelCompose scopeOptions={scopeOptions} /> : undefined}
      width="default"
    >
      <AdminSection>
        <div className="space-y-2">
          {visible.length === 0 && (
            <p className="py-6 text-center text-sm text-subtle">No public channels yet.</p>
          )}
          {visible.map((ch) => (
            <div key={ch.id} className="group flex items-center gap-3 rounded-2xl bg-surface-elevated/60 px-4 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-elevated">
                <Hash className="h-4 w-4 text-subtle" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-text">{ch.name}</span>
                  <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium capitalize ${TYPE_COLOR[ch.type] ?? TYPE_COLOR.group}`}>
                    {ch.type}
                  </span>
                  <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-xs font-medium capitalize text-muted">
                    {ch.scope}
                  </span>
                </div>
                {ch.description && (
                  <p className="mt-0.5 truncate text-xs text-subtle">{ch.description}</p>
                )}
              </div>
              <form action={archiveChannel.bind(null, ch.id)}>
                <button
                  type="submit"
                  title="Hide from discovery"
                  className="rounded-lg p-1.5 text-subtle transition-all hover:bg-warning-bg hover:text-warning dark:hover:bg-warning-bg/30"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          ))}
        </div>
      </AdminSection>

      {hidden.length > 0 && (
        <AdminSection>
          <details>
            <summary className="cursor-pointer select-none text-xs font-medium text-subtle hover:text-muted">
              {hidden.length} hidden channel{hidden.length > 1 ? 's' : ''}
            </summary>
            <div className="mt-2 space-y-2 opacity-60">
              {hidden.map((ch) => (
                <div key={ch.id} className="flex items-center gap-3 rounded-2xl bg-surface-elevated/60 px-4 py-3">
                  <Hash className="h-4 w-4 shrink-0 text-subtle" />
                  <span className="flex-1 text-sm text-muted">{ch.name}</span>
                  <span className="text-xs text-subtle">hidden</span>
                </div>
              ))}
            </div>
          </details>
        </AdminSection>
      )}
    </AdminPage>
  )
}
