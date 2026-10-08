import Link from 'next/link'
import { BookOpen, Play, LibraryBig, Info } from 'lucide-react'
import { ProgressRing } from './progress-ring'

// THE JOURNEY DOCK — the one navigation shared by a Journey's four views: About (the sales page),
// Course (the course home), Focus (the player) and Library (every Journey you are on). Four peer
// destinations with an icon and a label each, which is the bottom-bar rule on both platforms
// (Material 3 and Apple HIG both say three to five, equal weight, fixed, never scrolling).
//
// WHY A FLOATING PILL AND NOT A SECOND TAB BAR. Below md the bottom edge already belongs to the
// app's tab bar, the raised Zap catch and the chat tab (the mobile lane, app/globals.css). A
// full-bleed second bar would have to pad itself by the whole lane rise. A narrow pill that floats
// ABOVE the lane is the shape the lane contract already has a slot for (the teaser pill, the Quest
// CTA), so this reads `--tab-bar-clearance` and nothing else. On desktop the same pill floats at
// the foot of the content column. One component, one look, both platforms.
//
// It is `sticky`, not `fixed`: it rides at the end of the page's own column, so it centres in the
// column (not the window, which has rails) and it can never sit over the page's last line, because
// it takes its own space in the flow. In focus mode the shell hides its tab bar, so `focus` drops
// the lane offset and the pill sits on the true bottom edge.
//
// Server component: four links and a ring, no client JS.

export type JourneyView = 'about' | 'course' | 'focus' | 'library'

export function JourneyDock({
  slug,
  active,
  percent,
  aboutHref,
  focusHref,
  focus = false,
}: {
  /** The Journey these tabs belong to. Null on the Library, which has no current Journey: the
   *  About, Course and Focus tabs then point at the most recent one, or hide when there is none. */
  slug: string | null
  active: JourneyView
  /** The viewer's overall progress, drawn on the Course tab. */
  percent: number
  /** The sales page. An enrolled member is redirected off the bare slug to the course, so their
   *  About link carries ?preview=1; an author is never redirected and gets the bare slug. */
  aboutHref?: string
  /** Deep link into the player at the next lesson. Defaults to the player's own resume point. */
  focusHref?: string
  /** The player: the shell's tab bar is hidden there, so the pill sits on the bottom edge. */
  focus?: boolean
}) {
  const tabs = [
    ...(slug
      ? [
          { key: 'about' as const, label: 'About', href: aboutHref ?? `/journeys/${slug}?preview=1`, icon: () => <Info className="h-5 w-5" aria-hidden /> },
          {
            key: 'course' as const,
            label: 'Course',
            href: `/journeys/${slug}/learn`,
            icon: (on: boolean) => (
              <ProgressRing value={percent} size={20} stroke={2.5} tone={on ? 'current' : 'primary'} label={`${Math.round(percent)}% done`}>
                <BookOpen className="h-2.5 w-2.5" aria-hidden />
              </ProgressRing>
            ),
          },
          { key: 'focus' as const, label: 'Focus', href: focusHref ?? `/journeys/${slug}/play`, icon: () => <Play className="h-5 w-5" aria-hidden /> },
        ]
      : []),
    { key: 'library' as const, label: 'Library', href: '/journeys/library', icon: () => <LibraryBig className="h-5 w-5" aria-hidden /> },
  ]

  return (
    <nav
      aria-label="Journey"
      className={`pointer-events-none sticky z-30 mt-10 flex justify-center ${
        focus ? 'bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]' : 'bottom-[calc(var(--tab-bar-clearance)+0.5rem)] md:bottom-5'
      }`}
    >
      <ul className="pointer-events-auto flex items-stretch gap-1 rounded-pill border border-border bg-surface/95 p-1.5 shadow-pop backdrop-blur-sm">
        {tabs.map((t) => {
          const on = t.key === active
          return (
            <li key={t.key}>
              <Link
                href={t.href}
                aria-current={on ? 'page' : undefined}
                className={`flex min-w-[4.25rem] flex-col items-center gap-1 rounded-pill px-3 py-1.5 text-3xs font-semibold transition-colors sm:min-w-0 sm:flex-row sm:gap-2 sm:px-4 sm:py-2 sm:text-body-sm ${
                  on ? 'bg-primary text-on-primary' : 'text-muted hover:bg-surface-elevated hover:text-text'
                }`}
              >
                {t.icon(on)}
                <span className="leading-none">{t.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
