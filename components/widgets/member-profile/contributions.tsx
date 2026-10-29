import type { MemberBlockProps } from '@/lib/entity-blocks/member-adapter'
import { MemberSection } from './section'

// WHAT I GIVE BACK: quiet stat pills the member chooses (SPL-05). DATA block: every number is resolved
// SERVER-SIDE (the real membership tier, count-only aggregates, lifetime Zaps); the block's own switches only
// say WHICH pills show. Defaults: Crew and Zaps on, the rest off. A zero never renders, and with no pill the
// block returns null so `empty:hidden` collapses the section. Never payments, amounts or who tipped.
const SWITCH_DEFAULTS = { showCrew: true, showEvents: false, showJourneys: false, showZaps: true } as const

function on(content: Record<string, unknown> | undefined, key: keyof typeof SWITCH_DEFAULTS): boolean {
  const v = content?.[key]
  return typeof v === 'boolean' ? v : SWITCH_DEFAULTS[key]
}

const count = (n: number) => n.toLocaleString('en-US')

/** The pill labels this member shows, in order. Pure, so the tests read it directly. */
export function contributionPills(
  c: MemberBlockProps['data']['contributions'],
  content?: Record<string, unknown>,
): string[] {
  const out: string[] = []
  if (on(content, 'showCrew') && c.crew) out.push('Crew')
  if (on(content, 'showEvents') && c.eventsHosted > 0) {
    out.push(`${count(c.eventsHosted)} ${c.eventsHosted === 1 ? 'event' : 'events'} hosted`)
  }
  if (on(content, 'showJourneys') && c.journeysFinished > 0) {
    out.push(`${count(c.journeysFinished)} ${c.journeysFinished === 1 ? 'Journey' : 'Journeys'} finished`)
  }
  if (on(content, 'showZaps') && c.zaps > 0) out.push(`${count(c.zaps)} Zaps`)
  return out
}

export function MemberContributionsBlock({ data, content }: MemberBlockProps) {
  const pills = contributionPills(data.contributions, content)
  if (pills.length === 0) return null
  return (
    <MemberSection anchor="contributions">
      <h2 className="text-lead font-semibold text-text">What I give back</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {pills.map((p) => (
          <li key={p} className="rounded-pill border border-border bg-surface px-3 py-1 text-body-sm font-medium text-text">
            {p}
          </li>
        ))}
      </ul>
    </MemberSection>
  )
}
