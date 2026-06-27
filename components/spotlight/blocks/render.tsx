import Image from 'next/image'
import type { CSSProperties } from 'react'
import { Flame, Gem, CalendarDays, MapPin } from 'lucide-react'
import type { SpotlightBlock, SpotlightStatKey } from '@/lib/spotlight/blocks/schema'

// Server-side render of a validated Spotlight layout. CLOSED allowlist switch — a block
// type with no renderer produces nothing (never an echo of raw input). No
// dangerouslySetInnerHTML anywhere; all text goes through {value} (React auto-escapes).
// Inputs are already validated (lib/spotlight/blocks/validate.ts), but the renderer adds
// no trust of its own: links carry rel="nofollow", images come from the public bucket.
//
// `cardStyle` + `headingFont` come from the validated custom theme (lib/spotlight/theme.ts):
// both are empty/undefined when the member hasn't customized, so the render is unchanged.

const PUBLIC_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/avatars/`

// The authoritative gamification values a `stats` block can show. Resolved server-side
// from the allowlisted profile row (never member-supplied), so the numbers can't be faked.
export interface SpotlightStatsContext {
  streak: number | null
  gems: number | null
  joinedYear: number | null
  region: string | null
}

function StatPill({ icon: Icon, value, label, cardStyle }: { icon: typeof Flame; value: string; label: string; cardStyle?: CSSProperties }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2" style={cardStyle}>
      <Icon className="h-4 w-4 text-primary-strong" aria-hidden />
      <span className="text-sm font-semibold text-text tabular-nums">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  )
}

function StatsView({ show, stats, cardStyle }: { show: SpotlightStatKey[]; stats: SpotlightStatsContext; cardStyle?: CSSProperties }) {
  const pills: { key: SpotlightStatKey; node: React.ReactNode }[] = []
  for (const key of show) {
    if (key === 'streak' && stats.streak && stats.streak > 0) {
      pills.push({ key, node: <StatPill icon={Flame} value={String(stats.streak)} label="day streak" cardStyle={cardStyle} /> })
    } else if (key === 'gems' && stats.gems && stats.gems > 0) {
      pills.push({ key, node: <StatPill icon={Gem} value={stats.gems.toLocaleString()} label="gems earned" cardStyle={cardStyle} /> })
    } else if (key === 'joined' && stats.joinedYear) {
      pills.push({ key, node: <StatPill icon={CalendarDays} value={String(stats.joinedYear)} label="member since" cardStyle={cardStyle} /> })
    } else if (key === 'region' && stats.region) {
      pills.push({ key, node: <StatPill icon={MapPin} value={stats.region} label="" cardStyle={cardStyle} /> })
    }
  }
  if (pills.length === 0) return null
  return <div className="flex flex-wrap gap-2">{pills.map((p) => <div key={p.key}>{p.node}</div>)}</div>
}

function BlockView({
  block, stats, cardStyle, headingFont,
}: {
  block: SpotlightBlock
  stats: SpotlightStatsContext
  cardStyle?: CSSProperties
  headingFont?: string
}) {
  switch (block.type) {
    case 'heading':
      return block.level === 3 ? (
        <h3 className="mt-4 text-base font-bold text-text" style={{ fontFamily: headingFont }}>{block.text}</h3>
      ) : (
        <h2 className="mt-6 text-lg font-bold text-text" style={{ fontFamily: headingFont }}>{block.text}</h2>
      )
    case 'text':
      return <p className="whitespace-pre-wrap text-pretty text-sm leading-relaxed text-text">{block.text}</p>
    case 'links':
      return (
        <div className="space-y-2">
          {block.items.map((item, i) => (
            <a
              key={i}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="block rounded-2xl border border-border-strong bg-surface px-4 py-3 text-center text-sm font-semibold text-text shadow-sm transition-colors hover:bg-surface-elevated"
              style={cardStyle}
            >
              {item.label}
            </a>
          ))}
        </div>
      )
    case 'image':
      return (
        <div className="overflow-hidden rounded-2xl border border-border" style={cardStyle}>
          <Image
            src={`${PUBLIC_BASE}${block.assetPath}`}
            alt={block.alt}
            width={640}
            height={640}
            className="h-auto w-full object-cover"
          />
        </div>
      )
    case 'gallery':
      return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {block.items.map((item, i) => (
            <div key={i} className="aspect-square overflow-hidden rounded-xl border border-border" style={cardStyle}>
              <Image
                src={`${PUBLIC_BASE}${item.assetPath}`}
                alt={item.alt}
                width={320}
                height={320}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      )
    case 'quote':
      return (
        <blockquote className="border-l-4 border-primary-strong bg-surface/60 py-2 pl-4 pr-3" style={cardStyle}>
          <p className="text-pretty text-sm italic leading-relaxed text-text">{block.text}</p>
          {block.cite && <footer className="mt-1.5 text-xs font-medium text-muted">— {block.cite}</footer>}
        </blockquote>
      )
    case 'stats':
      return <StatsView show={block.show} stats={stats} cardStyle={cardStyle} />
    case 'divider':
      return <hr className="my-2 border-border" />
    default:
      return null
  }
}

export function SpotlightBlocks({
  blocks, stats, cardStyle, headingFont,
}: {
  blocks: SpotlightBlock[]
  stats: SpotlightStatsContext
  cardStyle?: CSSProperties
  headingFont?: string
}) {
  return (
    <div className="mt-6 space-y-4">
      {blocks.map((block) => (
        <BlockView key={block.id} block={block} stats={stats} cardStyle={cardStyle} headingFont={headingFont} />
      ))}
    </div>
  )
}
