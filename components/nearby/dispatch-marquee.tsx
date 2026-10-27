import Link from 'next/link'
import { Megaphone, Zap } from 'lucide-react'
import { SITE_DESIGN } from '@/lib/theme/design'

export type MarqueeItem = {
  id: string
  title: string
  authorName: string | null
  timeLabel: string
  linked: boolean
}

// Around You's Dispatch ticker: a full-width strip that scrolls the latest announcements past the
// reader, the way a score bar does. It is a Server Component on purpose. The motion is the existing
// `.animate-marquee` keyframe (a CSS transform, no JS timer), the list is rendered twice so the loop
// has no seam, and the second copy is aria-hidden so a screen reader hears each Dispatch once.
//
// Pausing (WCAG 2.2.2): hover or keyboard focus on the strip stops it (`animation-play-state`), and
// under prefers-reduced-motion `.animate-marquee` is `animation: none`, so the strip becomes a plain
// horizontally scrollable row instead of a frozen one. The former global member ticker was a
// separate surface; the human explicitly retired that requirement on 2026-10-27. This nearby strip remains.
export function DispatchMarquee({ items }: { items: MarqueeItem[] }) {
  if (items.length === 0) return null

  // Frequency wears the members kit's glass pill (`.ay-ticker`, members-community.css); the motion,
  // the doubled list and the pause rules are the same ones below.
  if (SITE_DESIGN === 'frequency') {
    const kitRow = (hidden: boolean) => (
      <ul className="ay-ticker-row" aria-hidden={hidden || undefined}>
        {items.map((d) => (
          <li key={d.id}>
            <Link href={`/nearby/${d.id}`} tabIndex={hidden ? -1 : undefined} className="ay-ticker-item">
              {d.linked ? <Zap aria-hidden /> : <Megaphone aria-hidden />}
              <span>{d.title}</span>
              <small>{d.authorName ? `${d.authorName} · ` : ''}{d.timeLabel}</small>
            </Link>
          </li>
        ))}
      </ul>
    )
    return (
      <section aria-label="Latest Dispatches" data-visual-mask="nearby-dispatch-ticker" className="ay-ticker">
        <Link href="/nearby?tab=dispatches" aria-label="Dispatches" className="ay-ticker-label">
          <span className="dot" aria-hidden />
          <span>Dispatches</span>
        </Link>
        <div className="ay-ticker-track">
          <div className="animate-marquee flex w-max">
            {kitRow(false)}
            {kitRow(true)}
          </div>
        </div>
      </section>
    )
  }

  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center gap-3 pr-3" aria-hidden={hidden || undefined}>
      {items.map((d) => (
        <li key={d.id} className="shrink-0">
          <Link
            href={`/nearby/${d.id}`}
            tabIndex={hidden ? -1 : undefined}
            className="flex max-w-[22rem] items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-body-sm transition-colors hover:border-primary-bg hover:bg-surface-elevated"
          >
            {d.linked ? (
              <Zap className="h-3.5 w-3.5 shrink-0 text-primary-strong" />
            ) : (
              <Megaphone className="h-3.5 w-3.5 shrink-0 text-subtle" />
            )}
            <span className="truncate font-medium text-text">{d.title}</span>
            <span className="shrink-0 text-meta text-subtle">
              {d.authorName ? `${d.authorName} · ` : ''}
              {d.timeLabel}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )

  return (
    <section
      aria-label="Latest Dispatches"
      data-visual-mask="nearby-dispatch-ticker"
      className="group flex items-center gap-3 overflow-hidden rounded-card border border-border bg-surface/70 py-2.5 pl-4 lift-1"
    >
      <Link
        href="/nearby"
        className="flex shrink-0 items-center gap-2 eyebrow text-primary-strong"
      >
        <span aria-hidden className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        Dispatches
      </Link>
      <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
      <div className="min-w-0 flex-1 overflow-hidden motion-reduce:overflow-x-auto [mask-image:linear-gradient(to_right,transparent,#000_2rem,#000_calc(100%-2rem),transparent)]">
        <div className="animate-marquee flex w-max group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]">
          {row(false)}
          {row(true)}
        </div>
      </div>
    </section>
  )
}
