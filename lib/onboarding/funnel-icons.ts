// Funnel icons — the curated icon set a NICHE funnel's Slide-2 feature cards pick from (ADR-funnels).
// A funnel stores an icon by NAME (a serialisable string in its JSONB config); the induction resolves
// the name to a lucide icon through this map. Keeping the set curated (not "any lucide icon") means the
// editor can show a small, on-brand picker and an unknown/legacy name always resolves to a sane default.
// Client-safe (only lucide-react + types).

import {
  Sparkles,
  CalendarDays,
  CalendarCheck,
  Users,
  UsersRound,
  HeartHandshake,
  Heart,
  Ticket,
  QrCode,
  Store,
  ShoppingBag,
  GraduationCap,
  Repeat,
  ScanLine,
  BarChart3,
  Mail,
  Bell,
  Radar,
  Gamepad2,
  HandCoins,
  HandHeart,
  MapPin,
  Megaphone,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

/** Name → icon. Names are stable strings stored on a funnel; add here to grow the picker. */
export const FUNNEL_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  calendar: CalendarDays,
  'calendar-check': CalendarCheck,
  booking: CalendarCheck,
  users: Users,
  community: UsersRound,
  belonging: HeartHandshake,
  heart: Heart,
  ticket: Ticket,
  qr: QrCode,
  store: Store,
  shop: ShoppingBag,
  learning: GraduationCap,
  memberships: Repeat,
  checkin: ScanLine,
  insights: BarChart3,
  email: Mail,
  reminders: Bell,
  resonance: Radar,
  quest: Gamepad2,
  donations: HandCoins,
  volunteers: HandHeart,
  map: MapPin,
  promotion: Megaphone,
  tools: Wrench,
}

/** The picker's option list (stable order), for the funnel editor's icon select. */
export const FUNNEL_ICON_NAMES: string[] = Object.keys(FUNNEL_ICONS)

/** Resolve an icon name to a lucide component, falling back to a neutral default. */
export function funnelIcon(name: string | undefined): LucideIcon {
  return (name && FUNNEL_ICONS[name]) || Sparkles
}
