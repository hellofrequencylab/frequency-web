// Canonical Quest icon set (DAWN handoff — "Quest icon set" round). ONE lucide-react
// glyph per Quest concept, so every Quest surface (currencies, nodes, rewards, ladder)
// uses the same mark instead of re-picking ad hoc. Reference design:
// design_handoff/quest-icons.card.html.
//
// Treatment when an icon stands alone: the amber chip — `bg-primary-bg
// text-primary-strong rounded-xl`, ~22px glyph (see the reference card).
//
// The left-nav area glyphs live in components/layout/nav-icons.ts (AREA_ICONS) and are
// kept in lockstep with this set (quests → Compass, vault → Vault, …).

import {
  Zap, Gem, Vault, Store, Receipt, Gift, CircleCheckBig, Footprints, QrCode,
  Nfc, Ghost, UserPlus, Compass, Sun, Route, Waypoints, Sparkles, Flame,
  Target, Award, BadgeCheck, Trophy, ListOrdered, Crown,
} from 'lucide-react'

export const QUEST_ICONS = {
  zaps: Zap,
  gems: Gem,
  vault: Vault,
  store: Store,
  earnLog: Receipt,
  merch: Gift,
  verifiedPractice: CircleCheckBig,
  checkIn: Footprints,
  qrNode: QrCode,
  nfcNode: Nfc,
  ghostNode: Ghost,
  invite: UserPlus,
  theQuest: Compass,
  season: Sun,
  journey: Route,
  arc: Waypoints,
  practice: Sparkles,
  streak: Flame,
  challenge: Target,
  achievement: Award,
  endorsed: BadgeCheck,
  trophy: Trophy,
  leaderboard: ListOrdered,
  luminary: Crown,
} as const

export type QuestConcept = keyof typeof QUEST_ICONS
