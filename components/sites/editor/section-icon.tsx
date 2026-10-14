import { createElement } from 'react'
import { BarChart3, CalendarDays, Camera, CircleHelp, CreditCard, FileText, Image as ImageIcon, LayoutTemplate, MapPin, MoveRight, ShoppingBag, Users, type LucideIcon } from 'lucide-react'

// One glyph per kind of section, shared by the Layers rail, the canvas type tag and the inspector header
// (the Site Editor handoff draws the same icon in all three). Matched on the registry type name, so a new
// block family reads correctly without a list edit; anything unrecognised gets the generic section glyph.
const RULES: [RegExp, LucideIcon][] = [
  [/Hero|Banner|Cover/, ImageIcon],
  [/Event|Calendar|Schedule|Upcoming/, CalendarDays],
  [/Stat|Number|Count/, BarChart3],
  [/Team|Host|Founder|People|Member(?!ship)/, Users],
  [/Gallery|Media|Photo|Video|Social|Podcast/, Camera],
  [/Tier|Membership|Plan|Pricing/, CreditCard],
  [/Faq|FAQ|Question/, CircleHelp],
  [/Chapter|Circle|Map|Location|Contact|Visit/, MapPin],
  [/Offering|Merch|Shop|Product|Store/, ShoppingBag],
  [/Coffee|Cta|CTA|Band|Action|Callout|Join/, MoveRight],
  [/Split|Steps|About|Text|Rich|Story|Editorial|Zigzag|Feature/, FileText],
]

function sectionIconFor(type: string): LucideIcon {
  return RULES.find(([pattern]) => pattern.test(type))?.[1] ?? LayoutTemplate
}

/** The section's glyph as an element, so callers never create a component during render. */
export function SectionIcon({ type, size = 16 }: { type: string; size?: number }) {
  return createElement(sectionIconFor(type), { size, 'aria-hidden': true })
}

/** The plain line a section shows under its name: its own heading or title, voice marks dropped. It renders as
 *  React text (escaped), so markup in a rich field is never interpreted, only shown. */
export function sectionLine(props: Record<string, unknown>, fallback = ''): string {
  for (const key of ['title', 'heading', 'headline', 'eyebrow', 'name', 'lead', 'body']) {
    const value = props[key]
    if (typeof value === 'string' && value.trim()) return value.replace(/\*/g, '').replace(/\s+/g, ' ').trim()
  }
  return fallback.replace(/\*/g, '')
}
