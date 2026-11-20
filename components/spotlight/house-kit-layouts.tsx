import type { CSSProperties, ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { DoorRuns } from '@/components/spotlight/door-runs'
import { ArrowRight, CalendarDays, Heart, Mail, MapPin, MessageCircle, Sparkles, Star, Tag, Users, type LucideIcon } from 'lucide-react'
import { MEGA_SURFACES } from '@/lib/theme/mega-surfaces'
import { contrastRatio } from '@/lib/spaces/accent'
import { HOUSE_KIT_PREFIX, type HouseKitLayoutKey, type HouseKitSpotlightContent, type HouseKitTheme } from '@/lib/spotlight/house-kit-content'
import { HOUSE_KIT_LAYOUTS_CSS } from './house-kit-layouts-css'

// THE HOUSE KIT SPOTLIGHT LAYOUTS (LIVE-2357): the six whole-page layouts (Stack, Card wall, Story, Calendar first, Shop front,
// Profile) shared by Bold, Wildheart and Nocturne. Server Component, no hooks. One markup; each theme is a presentation: its
// colours come from its own flat token set (lib/theme/mega-surfaces.ts, the same literals its email and preset wear) as --hk-*
// custom properties on the root, and its faces, case, corners and media frame come from the sheet, keyed on data-kit-theme.
// So a token round in a theme's palette module reaches its Spotlight with no second copy, and the build carries one layout set,
// not three.

type C = HouseKitSpotlightContent
type Icon = C['doors'][number]['icon']

const ICONS: Record<Icon, LucideIcon> = { calendar: CalendarDays, star: Star, users: Users, mail: Mail, pin: MapPin, message: MessageCircle, heart: Heart, tag: Tag, sparkle: Sparkles }

/** The layouts, in the shared order, with their words. */
export const HOUSE_KIT_LAYOUT_LABELS: readonly { key: HouseKitLayoutKey; label: string; blurb: string }[] = [
  { key: 'stack', label: 'Stack', blurb: 'Every way in, stacked' },
  { key: 'card-wall', label: 'Card wall', blurb: 'Two columns of square cards' },
  { key: 'story', label: 'Story', blurb: 'One photo, a few lines, one button' },
  { key: 'calendar-first', label: 'Calendar first', blurb: 'Dates lead, booking follows' },
  { key: 'shop-front', label: 'Shop front', blurb: 'Sessions as products' },
  { key: 'profile', label: 'Profile', blurb: 'Who you are, then one thing to do' },
]

const Glyph = ({ icon, size = 20 }: { icon: Icon; size?: number }) => {
  const I = ICONS[icon]
  return <span className="hks-glyph" aria-hidden><I size={size} strokeWidth={1.75} /></span>
}
const Btn = ({ href, children, ghost }: { href: string; children: ReactNode; ghost?: boolean }) => (
  <Link href={href} className={ghost ? 'hks-btn hks-btn--ghost' : 'hks-btn'}>{children}</Link>
)
/** The avatar, or nothing: a live page without a picture never shows an empty frame. */
function Portrait({ src, size }: { src: string | null; size: number }) {
  if (!src) return null
  return <span className="hks-portrait" style={{ width: size, height: size }}><Image src={src} alt="" fill sizes={`${size * 2}px`} style={{ objectFit: 'cover' }} /></span>
}
function Top({ c, big }: { c: C; big?: boolean }) {
  return (
    <header className="hks-top">
      <Portrait src={c.portrait} size={big ? 112 : 84} />
      <h1 className="hks-name">{c.name}</h1>
      {c.descriptor && <p className="hks-label">{c.descriptor}</p>}
      {c.pain && <p className="hks-pain">{c.pain}</p>}
    </header>
  )
}
function Door({ d }: { d: C['doors'][number] }) {
  return (
    <Link href={d.href} className="hks-card hks-door">
      <Glyph icon={d.icon} />
      <span><b>{d.title}</b><small>{d.meta}</small></span>
      <ArrowRight size={14} aria-hidden />
    </Link>
  )
}
const Foot = ({ c }: { c: C }) => (
  <footer className="hks-foot">
    {c.footerCta && <Btn href={c.footerCta.href} ghost>{c.footerCta.label}</Btn>}
    <p className="hks-label">Spotlight on Frequency</p>
  </footer>
)

function Stack({ c }: { c: C }) {
  return (
    <>
      <Top c={c} big />
      <div className="hks-col">
        <Btn href={c.cta.href}>{c.cta.label}</Btn>
        <DoorRuns doors={c.doors} card={(d) => <Door key={d.id} d={d} />} button={(d) => <Btn key={d.id} href={d.href} ghost>{d.title}</Btn>} />
      </div>
      <Foot c={c} />
    </>
  )
}

function CardWall({ c }: { c: C }) {
  return (
    <>
      <Top c={c} />
      <div className="hks-grid">
        <div className="hks-span"><Btn href={c.featured.href}>{c.featured.cta}</Btn></div>
        <DoorRuns
          doors={c.doors}
          card={(d) => <Link key={d.id} href={d.href} className="hks-card hks-sq"><Glyph icon={d.icon} size={24} /><b>{d.title}</b></Link>}
          button={(d) => <div key={d.id} className="hks-span"><Btn href={d.href} ghost>{d.title}</Btn></div>}
        />
      </div>
      <Foot c={c} />
    </>
  )
}

function Story({ c }: { c: C }) {
  return (
    <>
      {c.hero.photo && (
        <div className="hks-photo">
          <Image src={c.hero.photo} alt="" fill sizes="(max-width: 640px) 100vw, 640px" style={{ objectFit: 'cover' }} />
        </div>
      )}
      <div className="hks-col">
        {c.hero.eyebrow && <p className="hks-label">{c.hero.eyebrow}</p>}
        <h1 className="hks-display">{c.hero.title}{c.hero.em && <> <em>{c.hero.em}</em></>}</h1>
        {c.story && <p className="hks-body">{c.story}</p>}
        <Btn href={c.cta.href}>{c.cta.label}</Btn>
        {c.doors.filter((d) => d.id === 'events' || d.id === 'circles').map((d) => <Door key={d.id} d={d} />)}
      </div>
      <Foot c={c} />
    </>
  )
}

function CalendarFirst({ c }: { c: C }) {
  return (
    <>
      <Top c={c} />
      <div className="hks-col">
        <p className="hks-label">Coming up</p>
        {c.openings.map((o) => (
          <Link key={o.day} href={c.featured.href} className="hks-card hks-date">
            <span className="hks-day"><small>{o.mon}</small><b>{Number(o.day)}</b></span>
            <span><b>{o.title}</b><small>{o.time}</small></span>
            <span className="hks-badge">{o.left ? `${o.left} left` : 'Waitlist'}</span>
          </Link>
        ))}
        {c.openings.length === 0 && <Btn href={c.featured.href}>{c.featured.cta}</Btn>}
        {c.doors.filter((d) => d.id === 'events').map((d) => <Door key={d.id} d={d} />)}
      </div>
      <Foot c={c} />
    </>
  )
}

function ShopFront({ c }: { c: C }) {
  return (
    <>
      <Top c={c} />
      <div className="hks-grid">
        {c.offers.map((o) => (
          <Link key={o.name} href="/services" className="hks-card hks-prod">
            <Glyph icon="tag" size={24} />
            <b>{o.name}</b>
            <small>{o.price} · {o.dur}</small>
          </Link>
        ))}
      </div>
      <div className="hks-col"><Btn href={c.cta.href}>{c.cta.label}</Btn></div>
      <Foot c={c} />
    </>
  )
}

function Profile({ c }: { c: C }) {
  return (
    <>
      <div className="hks-profile">
        <Portrait src={c.portrait} size={96} />
        <div><p className="hks-name">{c.owner}</p>{(c.role || c.owner !== c.name) && <p className="hks-label">{[c.role, c.owner !== c.name ? c.name : ''].filter(Boolean).join(' · ')}</p>}</div>
      </div>
      <div className="hks-col">
        {c.quote ? <blockquote className="hks-quote">“{c.quote.text}”</blockquote> : c.story ? <p className="hks-body">{c.story}</p> : null}
        <Btn href={c.cta.href}>{c.cta.label}</Btn>
        {c.doors.filter((d) => d.id === 'reviews' || d.id === 'letter').map((d) => <Door key={d.id} d={d} />)}
      </div>
      <Foot c={c} />
    </>
  )
}

const LAYOUT: Record<HouseKitLayoutKey, (p: { c: C }) => ReactNode> = {
  stack: Stack, 'card-wall': CardWall, story: Story, 'calendar-first': CalendarFirst, 'shop-front': ShopFront, profile: Profile,
}

/** The theme's flat token set as the layout's --hk-* properties, with the owner's accent (when set) over the theme's. The
 *  label on a filled button is the theme's own `on` colour when it reads, else whichever of the ground or the ink reads better. */
export function houseKitVars(theme: HouseKitTheme, stored: string | null): CSSProperties {
  const s = MEGA_SURFACES[theme]!
  // The theme's own accent stored as a hex (the preset carries it) is not an owner's pick: it keeps the theme's text and label colours.
  const accentHex = stored && stored.toLowerCase() !== s.accent.accent.toLowerCase() ? stored : null
  const accent = accentHex ?? s.accent.accent
  const on = [accentHex ? null : s.accent.on, s.canvas, s.text].filter((x): x is string => !!x).sort((a, b) => contrastRatio(b, accent) - contrastRatio(a, accent))[0]!
  return {
    '--hk-canvas': s.canvas, '--hk-raised': s.raised, '--hk-elev': s.elevated, '--hk-line': s.border,
    '--hk-text': s.text, '--hk-muted': s.muted, '--hk-subtle': s.subtle,
    '--hk-accent': accent, '--hk-accent-text': accentHex ? `color-mix(in oklab, ${accentHex} 72%, ${s.text})` : s.accent.text, '--hk-on-accent': on,
    colorScheme: s.dark ? 'dark' : 'light',
  } as CSSProperties
}

/** One house kit Spotlight layout. `layout` is the stored id (`bold-kit:stack`, `wildheart-kit:story`, `nocturne-kit:profile`). */
export function HouseKitSpotlightLayout({ layout, content, className }: { layout: string; content: C; className?: string }) {
  const key = layout.slice(HOUSE_KIT_PREFIX[content.theme].length + 1) as HouseKitLayoutKey
  const Layout = LAYOUT[key]
  if (!layout.startsWith(`${HOUSE_KIT_PREFIX[content.theme]}:`) || !Layout) return null
  return (
    <div data-kit-theme={content.theme} data-layout={layout} className={`hks${className ? ` ${className}` : ''}`} style={houseKitVars(content.theme, content.accentHex)}>
      <style dangerouslySetInnerHTML={{ __html: HOUSE_KIT_LAYOUTS_CSS }} />
      <Layout c={content} />
    </div>
  )
}
