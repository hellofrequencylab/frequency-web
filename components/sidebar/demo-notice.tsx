import { Zap } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { demoModeEnabled } from '@/lib/platform-flags'

// Right-sidebar explainer for Beta testers: what the little yellow ⚡ bolt means,
// plus the *honest* headcount ("250 demo members + 6 real ones"). It only shows
// while demo_mode is on and there is demo content to explain, so the moment a
// janitor flips the switch off (or purges) in /admin/demo, this disappears too.
// Counts are live from the DB, never inflated — the whole point is honesty.
export async function DemoNotice() {
  if (!(await demoModeEnabled())) return null

  const admin = createAdminClient()
  const head = { count: 'exact' as const, head: true }
  const [demo, real] = await Promise.all([
    admin.from('profiles').select('id', head).eq('is_active', true).eq('is_demo', true),
    admin
      .from('profiles')
      .select('id', head)
      .eq('is_active', true)
      .eq('is_demo', false)
      .eq('is_system', false),
  ])

  const demoCount = demo.count ?? 0
  const realCount = real.count ?? 0
  if (demoCount === 0) return null // nothing to explain — likely already purged

  return (
    <section className="rounded-xl border border-warning/30 bg-warning-bg/40 px-3 py-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Zap className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden />
        <h3 className="text-xs font-bold uppercase tracking-wide text-warning">Beta demo content</h3>
      </div>

      <p className="text-[13px] leading-snug text-subtle">
        Anything marked with a{' '}
        <Zap className="inline h-3 w-3 fill-warning align-[-1px] text-warning" aria-hidden /> bolt is
        sample content we seeded so the community feels alive while we grow. It recedes — and
        eventually disappears — as real members join.
      </p>

      <p className="mt-2 text-[13px] font-semibold text-text">
        {demoCount.toLocaleString()} demo {demoCount === 1 ? 'member' : 'members'} + {realCount}{' '}
        real {realCount === 1 ? 'one' : 'ones'}
      </p>
      <p className="text-[13px] font-medium text-warning">Help us make this real!</p>
    </section>
  )
}
