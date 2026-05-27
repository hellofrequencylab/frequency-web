import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Hash, Plus, EyeOff, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { archiveChannel } from '../actions'

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

  if (!profile || !['host', 'guide', 'mentor'].includes(profile.community_role)) notFound()

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
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Channels</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage channels across your scope. Archiving hides from discovery.
          </p>
        </div>
        <Link
          href="/channels/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          New channel
        </Link>
      </div>

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
                className="p-1.5 rounded-lg text-gray-400 opacity-0 group-hover:opacity-100 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-all"
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
  )
}
