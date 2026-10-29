import Link from 'next/link'
import { BookOpen, Building2, CircleDot } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { MemberBlockProps } from '@/lib/entity-blocks/member-adapter'
import { programsOptIn, type ProgramLink } from '@/lib/spotlight/programs.shared'
import { MemberSection } from './section'

// WHAT I'M PART OF (SPL-04). DATA block: the rows come from the Spotlight reader's own allowlisted
// `programs` read (public Circles, Journeys and Spaces only), so there is nothing here a member can fake and
// nothing private to leak. OPT-IN: a kind renders only when the member switched it on in this block's
// settings (showCircles / showJourneys / showSpaces, all default off). No counts, no other people.
// FAIL-SAFE: with nothing switched on, or nothing public to show, it renders nothing and `empty:hidden`
// collapses the section.
function Group({
  label,
  icon: Icon,
  items,
  note,
}: {
  label: string
  icon: LucideIcon
  items: (ProgramLink & { finished?: boolean })[]
  note?: boolean
}) {
  if (items.length === 0) return null
  return (
    <div>
      <h3 className="eyebrow text-subtle">{label}</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.id}>
            <Link
              href={it.href}
              className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-text hover:border-brand"
            >
              <Icon aria-hidden className="size-5 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate font-medium">{it.name}</span>
              {note ? (
                <span className="shrink-0 rounded-pill bg-primary-bg px-2 py-0.5 text-meta font-medium text-primary-strong">
                  {it.finished ? 'Finished' : 'On it now'}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function MemberProgramsBlock({ data, content }: MemberBlockProps) {
  const on = programsOptIn(content)
  const circles = on.circles ? data.programs.circles : []
  const journeys = on.journeys ? data.programs.journeys : []
  const spaces = on.spaces ? data.programs.spaces : []
  if (circles.length + journeys.length + spaces.length === 0) return null
  const title = typeof content?.title === 'string' && content.title.trim() ? content.title.trim() : "What I'm part of"
  return (
    <MemberSection anchor="programs">
      <h2 className="text-lead font-semibold text-text">{title}</h2>
      <div className="mt-3 flex flex-col gap-5">
        <Group label="Circles" icon={CircleDot} items={circles} />
        <Group label="Journeys" icon={BookOpen} items={journeys} note />
        <Group label="Spaces" icon={Building2} items={spaces} />
      </div>
    </MemberSection>
  )
}
