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
  Send,
  Contact,
  ContactRound,
  LayoutDashboard,
  Building2,
  Activity,
  Bot,
  Map,
  Route,
  QrCode,
  Library,
} from 'lucide-react'

// Maps each NAV_AREAS key (lib/nav-areas.ts — the framework-free source of truth)
// to its lucide icon. Used by the single left rail (app-shell.tsx) — desktop and
// the mobile drawer — so every surface stays in lockstep. To give a new area an
// icon, add its key here.
export const AREA_ICONS: Record<string, ElementType> = {
  feed: Home,
  circles: Users,
  channels: Radio,
  events: CalendarDays,
  practices: Sparkles,
  journeys: Route,
  programs: BookOpen,
  library: Library,
  broadcast: Megaphone,
  messages: MessageSquare,
  friends: UserPlus,
  partners: Store,
  people: Globe,
  codes: QrCode,
  crew: Zap,
  quests: Map,
  store: Store,
  vault: Gem,
  'admin-community': LayoutDashboard,
  'admin-structure': Building2,
  'admin-insights': Activity,
  'admin-vera': Bot,
  'admin-platform': Shield,
  'admin-qr': QrCode,
  crm: Contact,
  connections: ContactRound,
  marketing: Briefcase,
  outreach: Send,
  pages: FileText,
}

// Fallback for any key without an explicit icon above.
export const FALLBACK_AREA_ICON: ElementType = Globe
