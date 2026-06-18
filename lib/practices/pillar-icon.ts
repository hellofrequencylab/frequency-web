import { Brain, HeartPulse, Sun, Palette, Sparkles, type LucideIcon } from 'lucide-react'
import type { PillarSlug } from '@/lib/pillars'

// One representative icon per Pillar, so a practice card without its own header image still reads as
// what it IS (a Mind practice looks different from a Body one) instead of every card sharing the
// generic spark. Client-safe (icon components only), used by the library + "your practices" cards.
const PILLAR_ICONS: Record<PillarSlug, LucideIcon> = {
  mind: Brain,
  body: HeartPulse,
  spirit: Sun,
  expression: Palette,
}

/** The Pillar's icon, or a neutral spark when the practice has no (known) Pillar. */
export function pillarIcon(slug: string | null | undefined): LucideIcon {
  return PILLAR_ICONS[slug as PillarSlug] ?? Sparkles
}
