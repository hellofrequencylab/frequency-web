import Link from 'next/link'
import { Zap } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { demoModeEnabled } from '@/lib/platform-flags'
import { viewerHidesDemo } from '@/lib/demo-preference'
import { ZAP_AMOUNTS } from '@/lib/zaps'

// Right-sidebar explainer for Beta testers: what the little ⚡ bolt means, the
// *honest* headcount, and — the activation nudge — a few direct links to real
// actions with their ⚡ reward shown, so "help us make this real" is a tappable
// to-do, not just a plea. Only shows while demo_mode is on and demo content exists.
const ACTIONS = [
  { label: 'Log a practice', href: '/practices', zaps: ZAP_AMOUNTS.practice_logged },
  { label: 'Start a circle', href: '/circles', zaps: ZAP_AMOUNTS.circle_start },
  { label: 'Invite a friend', href: '/network/friends', zaps: ZAP_AMOUNTS.invite_accepted },
  { label: 'Show up to an event', href: '/events', zaps: ZAP_AMOUNTS.event_attend },
] as const

export async function DemoNotice() {
  // Hidden when demo content is globally off, or the member turned beta content off.
  if (!(await demoModeEnabled()) || (await viewerHidesDemo())) return null

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
    <section className="overflow-hidden rounded-2xl border border-warning/40 bg-gradient-to-b from-warning-bg/80 to-warning-bg/30 shadow-sm">
      {/* Bold header band — a big bolt + a punchy line, so it reads as an ad, not a footnote. */}
      <div className="flex items-center gap-2.5 border-b border-warning/20 bg-warning-bg/60 px-3.5 py-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning text-on-primary shadow-sm">
          <Zap className="h-5 w-5 fill-current" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-warning">Help build it</h3>
          <p className="text-2xs font-semibold leading-tight text-text">
            {demoCount.toLocaleString()} demo {demoCount === 1 ? 'member' : 'members'} · {realCount} real
          </p>
        </div>
      </div>

      <div className="px-3.5 py-3">
        <p className="text-[13px] leading-snug text-subtle">
          Anything with a{' '}
          <Zap className="inline h-3 w-3 fill-warning align-[-1px] text-warning" aria-hidden /> bolt is
          sample content keeping the place alive while we grow. It recedes as real members join.
          <span className="font-semibold text-text"> Do something real and earn ⚡.</span>
        </p>

        {/* Make it real — direct actions with their ⚡ reward, as tappable buttons. */}
        <ul className="mt-2.5 space-y-1">
          {ACTIONS.map((a) => (
            <li key={a.href}>
              <Link
                href={a.href}
                className="group flex items-center justify-between gap-2 rounded-lg border border-warning/25 bg-surface/60 px-2.5 py-1.5 transition-colors hover:border-warning/50 hover:bg-warning-bg/70"
              >
                <span className="text-[13px] font-medium text-text transition-colors group-hover:text-warning">{a.label}</span>
                <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-extrabold text-warning tabular-nums">
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
