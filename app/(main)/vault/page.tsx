import { redirect } from 'next/navigation'
import { Gem, Zap, Flame, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function Stat({ Icon, label, value, hint }: { Icon: React.ElementType; label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-3 text-3xl font-bold leading-none tabular-nums text-text">{value.toLocaleString()}</p>
      <p className="mt-1 text-sm font-medium text-text">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-subtle">{hint}</p>}
    </div>
  )
}

export default async function VaultPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('current_season_zaps, lifetime_gems, current_streak')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const zaps = (profile?.current_season_zaps as number) ?? 0
  const gems = (profile?.lifetime_gems as number) ?? 0
  const streak = (profile?.current_streak as number) ?? 0

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-1 flex items-center gap-2">
        <Gem className="h-5 w-5 text-primary-strong" />
        <h1 className="text-2xl font-bold text-text">Your Vault</h1>
      </div>
      <p className="mb-6 text-sm text-muted">
        Everything you earn by showing up — your contribution, saved up.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat Icon={Zap} label="Zaps" value={zaps} hint="this season" />
        <Stat Icon={Gem} label="Gems" value={gems} hint="lifetime" />
        <Stat Icon={Flame} label="Streak" value={streak} hint="weeks" />
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-marketing-canvas p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary-strong" />
          <h2 className="text-sm font-semibold text-text">Redeeming is coming</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Soon your Zaps and Gems will unlock real things here — perks, content, and a way to
          support the community. For now, keep showing up; every practice you log and every event
          you make adds to your Vault.
        </p>
      </div>
    </div>
  )
}
