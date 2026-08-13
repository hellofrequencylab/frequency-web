import type { ElementType } from 'react'
import {
  Radio,
  Home,
  Users,
  CalendarDays,
  Globe,
  Shield,
  MessageSquare,
  Megaphone,
  UserPlus,
  Zap,
  Gem,
  Store,
  Briefcase,
  FileText,
  Sparkles,
  BookOpen,
  BookUser,
  Send,
  Contact,
  ContactRound,
  Images,
  ShoppingBag,
  UserRound,
  LayoutDashboard,
  LayoutGrid,
  Building2,
  Activity,
  Bot,
  Compass,
  Route,
  MapPinHouse,
  QrCode,
  Library,
  LifeBuoy,
  NotebookPen,
  Network,
  Coins,
  Banknote,
  Settings,
  Gamepad2,
  SlidersHorizontal,
  TrendingUp,
  Flag,
  CreditCard,
  BellRing,
  HelpCircle,
  User,
  Receipt,
  Blocks,
  ClipboardPaste,
  Vault,
} from 'lucide-react'

// Maps each NAV_AREAS key (lib/nav-areas.ts — the framework-free source of truth)
// to its lucide icon. Used by the single left rail (app-shell.tsx) — desktop and
// the mobile drawer — so every surface stays in lockstep. To give a new area an
// icon, add its key here.
export const AREA_ICONS: Record<string, ElementType> = {
  feed: Home,
  lead: Flag,
  circles: Users,
  channels: Radio,
  events: CalendarDays,
  // 'market' is the Marketplace commerce-umbrella row (ADR-868); Store reads "commerce".
  market: Store,
  // Housing is a home SEARCH surface: MapPinHouse (a house on a map pin) is the closest
  // lucide has to house+search ("find a place near you"); plain House reads as "home page".
  housing: MapPinHouse,
  // The Frequency Store — FIRST-PARTY retail (lib/verticals/shop.ts contributes this row at
  // runtime, which is why a static read of nav-areas.ts misses it). It gets the shopping bag,
  // not Store: `market` already owns Store as the commerce UMBRELLA, and the naming canon keeps
  // the two surfaces distinct, so drawing them with one glyph would say they are one place.
  shop: ShoppingBag,
  practices: Sparkles,
  journeys: Route,
  library: Library,
  // "Around You" — keyed `nearby` since the route rename (ADR-1020); the glyph is unchanged.
  nearby: Megaphone,
  messages: MessageSquare,
  friends: UserPlus,
  partners: Store,
  // The Members directory row (ADR-868): BookUser (an address-book person) reads "the
  // people directory" — clearly people, and distinct from Circles' Users pair glyph.
  people: BookUser,
  codes: QrCode,
  crew: Zap,
  quest: Compass,
  quests: Compass,
  store: Store,
  // The Vault area gets the literal vault-door glyph (DAWN round 2026-08-03); the
  // Gem glyph stays the CURRENCY mark (and stays in LUCIDE_BY_NAME's vocabulary).
  vault: Vault,
  messageBoards: MessageSquare,
  website: Globe,
  'hook-network': Network,
  earnings: Coins,
  status: LayoutDashboard,
  financials: Banknote,
  settings: Settings,
  'admin-community': Users,
  'admin-home': LayoutDashboard,
  'admin-programs': Gamepad2,
  'admin-operations': SlidersHorizontal,
  'admin-growth': TrendingUp,
  'admin-support': LifeBuoy,
  'admin-structure': Building2,
  'admin-insights': Activity,
  'admin-vera': Bot,
  'admin-vera-ai': Bot,
  'admin-platform': Shield,
  'admin-qr': QrCode,
  'admin-spaces': LayoutGrid,
  crm: Contact,
  // The rail's Resonance CRM row is keyed `admin-crm` (lib/nav-areas.ts), NOT `crm` — so the
  // entry above never matched it and the row drew the generic Globe fallback. DAWN's rail
  // reference names `contact` for this row; both keys now resolve to it.
  'admin-crm': Contact,
  // Loom Studio. Same glyph the Space console's own Loom module uses (`space.loom` in
  // lib/admin/modules/space-modules.ts), so the platform-wide studio and the per-Space one
  // read as the same tool at two scopes.
  'admin-library': Images,
  // The operator Market board — the same Store glyph as the member commerce row, because it
  // is the same concept seen from the operator side; the Admin section header disambiguates.
  'admin-marketplace': Store,
  // The member's own Profile row, injected at render time with a dynamic href (app-shell
  // `withHomeProfile`) so it cannot be a static NAV_AREA. Listed here so a DB menu row that
  // stores `profile` resolves to the same glyph the code path already passes.
  profile: UserRound,
  connections: ContactRound,
  'my-spaces': Building2,
  'operated-spaces': Blocks,
  journal: NotebookPen,
  marketing: Briefcase,
  outreach: Send,
  growth: Sparkles,
  pages: FileText,
}

// Fallback for any key without an explicit icon above.
export const FALLBACK_AREA_ICON: ElementType = Globe

// Lucide icons by their PascalCase NAME — the vocabulary a CUSTOM DB menu row can
// store in `icon` (the code defaults store a NAV_AREAS KEY instead, resolved via
// AREA_ICONS above). Seeded from the icons this module already imports, so a custom
// row can pick any of them with ZERO extra bundle cost; an unknown name falls back.
// To widen the vocabulary, import another lucide icon above and add it here.
const LUCIDE_BY_NAME: Record<string, ElementType> = {
  Radio,
  Home,
  Users,
  CalendarDays,
  Globe,
  Shield,
  MessageSquare,
  Megaphone,
  UserPlus,
  Zap,
  Gem,
  Store,
  Briefcase,
  FileText,
  Sparkles,
  BookOpen,
  BookUser,
  Send,
  Contact,
  ContactRound,
  Images,
  ShoppingBag,
  UserRound,
  MapPinHouse,
  LayoutDashboard,
  LayoutGrid,
  Building2,
  Activity,
  Bot,
  Compass,
  Route,
  QrCode,
  Library,
  LifeBuoy,
  NotebookPen,
  Network,
  Coins,
  Banknote,
  Settings,
  Gamepad2,
  SlidersHorizontal,
  TrendingUp,
  Flag,
  CreditCard,
  BellRing,
  HelpCircle,
  User,
  Receipt,
  Blocks,
  ClipboardPaste,
}

// Resolve a menu item's stored `icon` string to an icon component, for the DB-backed
// rail (lib/menus). The defaults store a NAV_AREAS KEY (e.g. 'feed'), so try AREA_ICONS
// first; a custom DB row may store a lucide NAME (e.g. 'Sparkles'), so try LUCIDE_BY_NAME
// next; anything unknown (or absent) gets the safe fallback so a row never renders icon-less.
export function railIconFor(icon: string | undefined): ElementType {
  if (!icon) return FALLBACK_AREA_ICON
  return AREA_ICONS[icon] ?? LUCIDE_BY_NAME[icon] ?? FALLBACK_AREA_ICON
}
