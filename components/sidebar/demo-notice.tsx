import Link from 'next/link'
import { Zap } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { demoModeEnabled } from '@/lib/platform-flags'
import { ZAP_AMOUNTS } from '@/lib/zaps'

// Right-sidebar explainer for Beta testers: what the little ⚡ bolt means, the
// *honest* headcount, and — the activation nudge — a few direct links to real
// actions with their ⚡ reward shown, so "help us make this real" is a tappable
// to-do, not just a plea. Only shows while demo_mode is on and demo content exists.
const ACTIONS = [
  { label: 'Log a practice', href: '/practices', zaps: ZAP_AMOUNTS.practice_logged },
  { label: 'Start a circle', href: '/circles', zaps: ZAP_AMOUNTS.circle_start },
  { label: 'Invite a friend', href: '/friends', zaps: ZAP_AMOUNTS.invite_accepted },
  { label: 'Show up to an event', href: '/events', zaps: ZAP_AMOUNTS.event_attend },
] as const

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
        sample content we seeded so the community feels alive while we grow. It recedes as real
        members join.
      </p>

      <p className="mt-2 text-[13px] font-semibold text-text">
        {demoCount.toLocaleString()} demo {demoCount === 1 ? 'member' : 'members'} + {realCount}{' '}
        real {realCount === 1 ? 'one' : 'ones'}
      </p>

      {/* Make it real — direct actions with their ⚡ reward. */}
      <div className="mt-2.5 border-t border-warning/20 pt-2">
        <p className="mb-1 px-1.5 text-[11px] font-bold uppercase tracking-wide text-warning">
          Help make it real — earn ⚡
        </p>
        <ul>
          {ACTIONS.map((a) => (
            <li key={a.href}>
              <Link
                href={a.href}
                className="group flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-warning-bg/70"
              >
                <span className="text-[13px] text-text transition-colors group-hover:text-warning">{a.label}</span>
                <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-bold text-warning tabular-nums">
                  +{a.zaps}
                  <Zap className="h-3 w-3 fill-warning" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
