import { ArrowDown, ArrowLeft, ArrowUpRight, BookOpen, CalendarClock, Clock, Download, Feather, Headphones, Library, Mail, Mic, Video, type LucideIcon } from 'lucide-react'
import { MIDNIGHT_SIGILS } from '@/lib/theme/midnight-sigils'
import { MidnightSigil } from '@/components/sites/midnight-sigil'

// A Midnight glyph (design: components/core/Glyph.jsx): a sigil from the Midnight set, or one of the few plain
// line icons the practice sections use (the design draws them from Lucide at the same 1.5 stroke). Drawn in
// currentColor, so the skin sets its colour and nothing here spells one.

const LINE_ICONS: Record<string, LucideIcon> = {
  'arrow-down': ArrowDown,
  'arrow-left': ArrowLeft,
  'arrow-up-right': ArrowUpRight,
  'book-open': BookOpen,
  'calendar-clock': CalendarClock,
  clock: Clock,
  download: Download,
  feather: Feather,
  headphones: Headphones,
  library: Library,
  mail: Mail,
  mic: Mic,
  video: Video,
}

/** Every name a block field can pick: the sigils, then the line icons. */
export const MIDNIGHT_GLYPH_NAMES = [...Object.keys(MIDNIGHT_SIGILS), ...Object.keys(LINE_ICONS)]

export function MidnightGlyph({ name, size = 20 }: { name: string; size?: number }) {
  const Line = LINE_ICONS[name]
  if (Line) return <Line className="mn-sigil" width={size} height={size} strokeWidth={1.5} aria-hidden="true" />
  return <MidnightSigil name={name} size={size} />
}

/** Seal (design: components/elements/Seal.jsx) around any glyph: a hairline ring with a faint outer ring. */
export function MidnightGlyphSeal({ name, size = 56, tone = 'subtle' }: { name: string; size?: number; tone?: 'subtle' | 'accent' }) {
  return (
    <span className="mn-seal" data-tone={tone} style={{ width: size, height: size }}>
      <MidnightGlyph name={name} size={Math.round(size * 0.4)} />
    </span>
  )
}
