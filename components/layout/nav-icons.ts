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
} from 'lucide-react'

// Maps each NAV_AREAS key (lib/nav-areas.ts — the framework-free source of truth)
// to its lucide icon. Shared by the community sub-menu (community-nav.tsx) and the
// sidebar rail (app-shell.tsx) so both surfaces stay in lockstep. To give a new
// area an icon, add its key here.
export const AREA_ICONS: Record<string, ElementType> = {
  feed: Home,
  circles: Users,
  channels: Radio,
  events: CalendarDays,
  practices: Sparkles,
  programs: BookOpen,
  broadcast: Megaphone,
  messages: MessageSquare,
  friends: UserPlus,
  partners: Store,
  people: Globe,
  crew: Zap,
  vault: Gem,
  admin: Shield,
  crm: Contact,
  marketing: Briefcase,
  outreach: Send,
  pages: FileText,
}

// Fallback for any key without an explicit icon above.
export const FALLBACK_AREA_ICON: ElementType = Globe
