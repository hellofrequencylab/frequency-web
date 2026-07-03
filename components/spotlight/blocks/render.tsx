import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { Flame, Gem, CalendarDays, MapPin, Zap } from 'lucide-react'
import type { SpotlightBlock, SpotlightStatKey, BlockTint } from '@/lib/spotlight/blocks/schema'
import type { TopFriend } from '@/lib/spotlight/top-friends'
import { getInitials } from '@/lib/utils'
import { buildEmbedSrc, embedHeight } from '@/lib/spotlight/embeds'
import { GalleryLightbox } from './gallery-lightbox'

// A per-block colour override → inline style (validated hex). `bg` recolours the card, `text`
// the type. Merged over the page theme's cardStyle so a tint wins for just that block.
function tintStyle(tint?: BlockTint): CSSProperties {
  return {
    ...(tint?.bg ? { backgroundColor: tint.bg } : {}),
    ...(tint?.text ? { color: tint.text } : {}),
  }
}

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
  zaps: number | null
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
    if (key === 'zaps' && stats.zaps && stats.zaps > 0) {
      pills.push({ key, node: <StatPill icon={Zap} value={stats.zaps.toLocaleString()} label="zaps" cardStyle={cardStyle} /> })
    } else if (key === 'streak' && stats.streak && stats.streak > 0) {
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

// The Top Friends grid (the "Top 8"): avatars resolved server-side from the
// spotlight_top_friends table (lib/spotlight/top-friends.ts) — the block carries no
// identities, so the people shown can't be faked. Each avatar links to that member's
// own profile. Renders nothing when the member has featured nobody.
function TopFriendsView({ title, friends, cardStyle, headingFont }: {
  title?: string
  friends: TopFriend[]
  cardStyle?: CSSProperties
  headingFont?: string
}) {
  if (friends.length === 0) return null
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle" style={{ fontFamily: headingFont }}>
        {title || 'Top Friends'}
      </h2>
      <div className="grid grid-cols-4 gap-3">
        {friends.map((f) => {
          const name = f.displayName || `@${f.handle}`
          return (
            <Link
              key={f.profileId}
              href={`/people/${f.handle}`}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-surface p-2 text-center transition-colors hover:bg-surface-elevated"
              style={cardStyle}
            >
              {f.avatarUrl ? (
                <Image
                  src={f.avatarUrl}
                  alt={name}
                  width={64}
                  height={64}
                  className="h-14 w-14 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-bg text-sm font-bold text-primary-strong">
                  {getInitials(name)}
                </div>
              )}
              <span className="w-full truncate text-xs font-medium text-text">{name}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

export function BlockView({
  block, stats, topFriends, cardStyle, headingFont,
}: {
  block: SpotlightBlock
  stats: SpotlightStatsContext
  topFriends: TopFriend[]
  cardStyle?: CSSProperties
  headingFont?: string
}) {
  switch (block.type) {
    case 'heading':
      return block.level === 3 ? (
        <h3 className="mt-4 text-base font-bold text-text" style={{ fontFamily: headingFont, ...tintStyle(block.tint) }}>{block.text}</h3>
      ) : (
        <h2 className="mt-6 text-lg font-bold text-text" style={{ fontFamily: headingFont, ...tintStyle(block.tint) }}>{block.text}</h2>
      )
    case 'text':
      return <p className="whitespace-pre-wrap text-pretty text-sm leading-relaxed text-text" style={tintStyle(block.tint)}>{block.text}</p>
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
              style={{ ...cardStyle, ...tintStyle(block.tint) }}
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
            style={{
              objectPosition: `${block.focusX ?? 50}% ${block.focusY ?? 50}%`,
              transform: (block.zoom ?? 100) !== 100 ? `scale(${(block.zoom ?? 100) / 100})` : undefined,
            }}
          />
        </div>
      )
    case 'gallery':
      // Square thumbnails that open a lightbox — the interactive bits live in a client
      // wrapper since this renderer is a Server Component.
      return <GalleryLightbox items={block.items} publicBase={PUBLIC_BASE} cardStyle={cardStyle} />
    case 'quote':
      return (
        <blockquote className="border-l-4 border-primary-strong bg-surface/60 py-2 pl-4 pr-3" style={{ ...cardStyle, ...(block.tint?.bg ? { backgroundColor: block.tint.bg } : {}) }}>
          <p className="text-pretty text-sm italic leading-relaxed text-text" style={{ color: block.tint?.text }}>{block.text}</p>
          {block.cite && <footer className="mt-1.5 text-xs font-medium text-muted">— {block.cite}</footer>}
        </blockquote>
      )
    case 'embed':
      // The src is REBUILT from the validated (provider, ref) — never a member-supplied src.
      // The allowlisted first-party players are trusted; the iframe is still sandboxed to the
      // perms they need and nothing more.
      return (
        <div className="overflow-hidden rounded-2xl border border-border" style={cardStyle}>
          <iframe
            src={buildEmbedSrc(block.provider, block.ref)}
            title={`${block.provider} embed`}
            height={embedHeight(block.provider)}
            className="w-full"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
            allow="autoplay; encrypted-media; clipboard-write; picture-in-picture; fullscreen"
          />
        </div>
      )
    case 'stats':
      return <StatsView show={block.show} stats={stats} cardStyle={cardStyle} />
    case 'topfriends':
      return <TopFriendsView title={block.title} friends={topFriends} cardStyle={cardStyle} headingFont={headingFont} />
    case 'divider':
      return <hr className="my-2 border-border" style={{ borderColor: block.tint?.text }} />
    default:
      return null
  }
}

export function SpotlightBlocks({
  blocks, stats, topFriends, cardStyle, headingFont,
}: {
  blocks: SpotlightBlock[]
  stats: SpotlightStatsContext
  topFriends: TopFriend[]
  cardStyle?: CSSProperties
  headingFont?: string
}) {
  return (
    <div className="mt-6 space-y-4">
      {blocks.map((block) => (
        <BlockView key={block.id} block={block} stats={stats} topFriends={topFriends} cardStyle={cardStyle} headingFont={headingFont} />
      ))}
    </div>
  )
}
