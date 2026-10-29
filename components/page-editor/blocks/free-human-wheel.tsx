import type { ComponentConfig } from '@/lib/page-editor/types'
import { InlineText } from '@/components/sites/inline-text'
import { FreeHumanWheelView } from '@/components/sites/free-human-wheel-view'
import { freeHumanOccurrences } from '@/lib/sites/free-human-events'
import { freeHumanKindMeta } from '@/lib/sites/free-human-calendar'
import type { FreeHumanWheelGathering } from '@/lib/sites/free-human-wheel'
import { FREE_HUMAN_YEAR_WHEEL } from '@/lib/sites/free-human-home'
import { VOICE_HINT, area, block, hrefOf, str, text, type Common } from './midnight'
import { Ground, groundFields } from './free-human'

// ── The Free Human Year Wheel block (design: templates/website/YearWheel.dc.html) ──────────────────────────────
// The wheel of the year with the Space's own gatherings on it: twelve signs, the turns and festivals, every moon, the eclipses and
// Mercury's retrograde, the Space's dates. The sky is computed (lib/sites/free-human-wheel.ts) and the drawing and turning are one
// client view (components/sites/free-human-wheel-view.tsx). The block reads the Space's events from `puck.metadata.space` and
// expands its series across the next thirteen months, like the Calendar block does.

const MONTHS_AHEAD = 13
const MAX_GATHERINGS = 80

type Space = { events?: unknown; series?: unknown } | undefined
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

function Wheel({ p, metadata, now, pad, vis }: Common) {
  const at = now ?? new Date()
  const space = metadata?.space as Space
  const links = metadata?.links as { origin?: string } | undefined
  const occs = freeHumanOccurrences(space, at, MONTHS_AHEAD, (e) => (e.slug ? `${links?.origin ?? ''}/events/${e.slug}` : ''))
  const gatherings: FreeHumanWheelGathering[] = occs.slice(0, MAX_GATHERINGS).map((o) => ({
    date: o.startsAt.slice(0, 10), title: o.title, sub: [o.place, o.price].filter(Boolean).join(' · '), text: o.summary, label: freeHumanKindMeta(o.kind).label, href: o.href,
  }))
  const to = hrefOf(str(p.calendarHref) || '#month-by-month', metadata) ?? '#month-by-month'
  const step = Math.min(90, Math.max(30, num(p.stepHeight, 32)))
  return (
    <Ground p={p} name="wheel" pad={pad} vis={vis}>
      <FreeHumanWheelView
        today={at.toISOString().slice(0, 10)}
        gatherings={gatherings}
        defaultMode={str(p.defaultMode) === 'scroll' ? 'scroll' : 'click'}
        stepHeight={step}
        stickOffset={Math.min(160, Math.max(0, num(p.stickOffset, 78)))}
        eyebrow={str(p.eyebrow) || 'The year wheel · a guide to the sky'}
        title={<InlineText text={str(p.title) || 'Twelve signs, eight festivals, *every moon.*'} />}
        calendarHref={to}
      />
    </Ground>
  )
}

export const freeHumanWheelBlocks: Record<string, ComponentConfig> = {
  FreeHumanYearWheel: block('Free Human year wheel (live)', {
    ...groundFields, eyebrow: text('Small label'), title: area('Heading', VOICE_HINT),
    defaultMode: { type: 'select', label: 'Turns by', options: [{ label: 'Hand (click and drag)', value: 'click' }, { label: 'Scroll (on a wide screen)', value: 'scroll' }] },
    stepHeight: { type: 'number', label: 'Scroll length per stop (screen height, 30 to 90)', min: 30, max: 90 },
    stickOffset: { type: 'number', label: 'Height of the header the wheel sits under (px)', min: 0, max: 160 },
    calendarHref: text('"See it in the calendar" goes to', 'A page link or #anchor.'),
  }, FREE_HUMAN_YEAR_WHEEL, Wheel),
}
