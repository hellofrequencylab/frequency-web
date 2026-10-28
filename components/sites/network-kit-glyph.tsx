import {
  ArrowUpRight, BookOpen, Building2, CalendarClock, CalendarDays, ChevronDown, CircleDot, Coffee, Compass, FileText, Gift, GraduationCap, Handshake, Headphones,
  Heart, HeartHandshake, Layers, LayoutGrid, List, Mail, MapPin, MessageCircle, Mic, Network, Route, ShoppingBag, Sparkles, Star, Ticket, TrendingUp, User,
  UserPlus, Users, Video, type LucideIcon,
} from 'lucide-react'

// THE NETWORK KIT'S MARKS (design: components/core/Glyph.jsx + Sigil.jsx + elements/Seal.jsx). The design keeps its
// mark names ("sigil:ring", "sigil:half") and draws every one as a Lucide icon of people and gathering, so a name
// here is a role, not a shape: ring is people, half is a book, arc is a route. Drawn in currentColor, so the skin
// sets the colour and nothing here spells one.

const ICONS: Record<string, LucideIcon> = {
  circle: CircleDot, ring: Users, dot: User, half: BookOpen, arc: Route, target: Handshake, square: Building2, diamond: HeartHandshake, triangle: CalendarDays,
  hexagon: GraduationCap, plus: UserPlus, lines: List, grid: LayoutGrid, wave: Coffee, step: TrendingUp, spark: Sparkles, stack: Layers, nodes: Network, pin: MapPin,
  calendar: CalendarDays, 'calendar-clock': CalendarClock, users: Users, mail: Mail, shop: ShoppingBag, message: MessageCircle, heart: Heart, star: Star, gift: Gift,
  file: FileText, audio: Headphones, mic: Mic, ticket: Ticket, compass: Compass, video: Video,
}

export const NETWORK_KIT_GLYPH_NAMES = Object.keys(ICONS)

export function NkGlyph({ name, size = 20, stroke = 1.75 }: { name: string; size?: number; stroke?: number }) {
  const Icon = ICONS[name] ?? CircleDot
  return <Icon className="nk-glyph" width={size} height={size} strokeWidth={stroke} aria-hidden="true" />
}

export function NkArrow({ size = 16 }: { size?: number }) {
  return <ArrowUpRight className="nk-glyph" width={size} height={size} strokeWidth={1.75} aria-hidden="true" />
}

export function NkChevron() {
  return <ChevronDown className="nk-glyph" width={16} height={16} strokeWidth={2} aria-hidden="true" />
}

/** Seal (design: elements/Seal.jsx): a mark held in a soft tile. Subtle is the white tile; accent is the one solid hero tile. */
export function NkSeal({ name, size = 56, tone = 'subtle' }: { name: string; size?: number; tone?: 'subtle' | 'accent' }) {
  return (
    <span className="nk-seal" data-tone={tone} style={{ '--nk-seal': `${size}px` } as React.CSSProperties}>
      <NkGlyph name={name} size={Math.round(size * 0.4)} />
    </span>
  )
}
