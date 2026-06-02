import { redirect } from 'next/navigation'
import { Send, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { atLeastRole, type CommunityRole } from '@/lib/core/roles'
import { ROLE_LABEL } from '@/lib/community-roles'

export const dynamic = 'force-dynamic'

// The scope a steward reaches, by role: host → their circle, guide → their hub,
// mentor/janitor → their nexus.
function scopeFor(role: CommunityRole): string {
  if (role === 'mentor' || role === 'janitor') return 'nexus'
  if (role === 'guide') return 'hub'
  return 'circle'
}

export default async function OutreachPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const role = ((profile?.community_role as CommunityRole) ?? 'member')
  // Outreach is a steward tool — hosts and up.
  if (!atLeastRole(role, 'host')) redirect('/feed')

  const scope = scopeFor(role)

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-1 flex items-center gap-2">
        <Send className="h-5 w-5 text-primary-strong" />
        <h1 className="text-2xl font-bold text-text">Outreach</h1>
      </div>
      <p className="mb-6 text-sm text-muted">
        Reach the people you steward. As a <strong className="text-text">{ROLE_LABEL[role]}</strong>,
        you can message your <strong className="text-text">{scope}</strong>.
      </p>

      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text">
          <Users className="h-4 w-4 text-primary-strong" />
          Message your {scope}
        </div>
        <textarea
          disabled
          rows={4}
          placeholder={`Write a note to everyone in your ${scope}…`}
          className="w-full resize-none rounded-xl border border-border bg-surface-elevated px-4 py-3 text-sm text-text placeholder:text-subtle outline-none disabled:opacity-70"
        />
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-subtle">Sends through the same email + push spine as Broadcast.</p>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary opacity-60"
          >
            <Send className="h-4 w-4" /> Send
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs text-subtle">
        Member-targeted sending is being wired up — for now use{' '}
        <strong className="text-text">Broadcast</strong> for community-wide messages.
      </p>
    </div>
  )
}
