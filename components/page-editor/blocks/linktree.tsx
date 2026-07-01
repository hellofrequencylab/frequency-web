// LINK-TREE / SIGNAL block library — the member Spotlight (bio-link page) block set,
// registered into the SHARED Puck config so member link-trees and brand Spaces run off
// ONE builder + ONE registry (Phase 3 of unifying every builder onto Puck).
//
// Keys:   SpotlightHeading | SpotlightText | LinkTree | SpotlightImage |
//         SpotlightGallery | SpotlightQuote | SpotlightStats | TopFriends |
//         SpotlightEmbed | SpotlightDivider
// Category: link-tree (appended last in lib/page-editor/config.tsx)
//
// WHY A DEDICATED SET (not a remap onto marketing blocks): a Spotlight block carries a
// distinct, security-shaped data contract the marketing blocks don't — owner-bucket
// asset PATHS (never site URLs), strict-hex per-block tints, server-resolved Stats +
// Top Friends (values injected at render via `puck.metadata.spotlight`, never stored),
// and validated embed refs. Keeping them 1:1 is what lets the converter round-trip an
// existing spotlight with NO data loss (lib/spotlight/puck/convert.ts).
//
// CLIENT-SAFE (the build trap): this file imports ONLY pure modules (the block schema,
// the embed src builder, the render metadata TYPES) + client UI (next/image, next/link,
// lucide). No `server-only` module is reachable, so it is safe inside the shared config
// that the <Puck> client editor loads. The server DATA (stat values, friend faces) rides
// `puck.metadata`, populated by the RSC render bridge only.
//
// WHITE-LABEL + tokens: cards/type use semantic DAWN tokens; the only raw colours are the
// member's OWN validated hex tints (BlockTint) applied inline, exactly as the bespoke
// renderer did. No hardcoded brand hex.

import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { Flame, Gem, CalendarDays, MapPin, Zap } from 'lucide-react'
import type { ComponentConfig } from '@measured/puck'
import { getInitials } from '@/lib/utils'
import {
  MAX_LINKS_PER_BLOCK,
  MAX_GALLERY_IMAGES,
  MAX_TOP_FRIENDS,
  SPOTLIGHT_STAT_KEYS,
  type SpotlightStatKey,
  type BlockTint,
} from '@/lib/spotlight/blocks/schema'
import { buildEmbedSrc, embedHeight, EMBED_PROVIDERS, type EmbedProvider } from '@/lib/spotlight/embeds'
import type { SpotlightPuckMetadata, SpotlightRenderMeta } from '@/lib/spotlight/puck/metadata'
import { EMPTY_SPOTLIGHT_META } from '@/lib/spotlight/puck/metadata'
import { spotlightAssetField, spotlightGalleryImageField } from '@/lib/page-editor/spotlight-asset-field'

// ── Shared helpers ──────────────────────────────────────────────────────────────

/** A validated per-block hex tint → inline style. `bg` recolours the card, `text` the type. */
function tintStyle(tint?: BlockTint): CSSProperties {
  return {
    ...(tint?.bg ? { backgroundColor: tint.bg } : {}),
    ...(tint?.text ? { color: tint.text } : {}),
  }
}

/** Read the spotlight render metadata off Puck's metadata channel, or a safe empty. */
function readMeta(puck?: { metadata?: SpotlightPuckMetadata }): SpotlightRenderMeta {
  return puck?.metadata?.spotlight ?? EMPTY_SPOTLIGHT_META
}

// The tint field is a small object control (two optional hex strings). It maps 1:1 to the
// stored BlockTint, so a member's existing tints survive the round-trip. Blank = untinted.
const tintField = {
  type: 'object' as const,
  label: 'Colours (optional)',
  objectFields: {
    text: { type: 'text' as const, label: 'Text colour (#rrggbb)' },
    bg: { type: 'text' as const, label: 'Card colour (#rrggbb)' },
  },
}
const tintDefault = { text: '', bg: '' }

/** Normalize the editor's tint object (blank strings) into a stored BlockTint or undefined. */
function toTint(v: unknown): BlockTint | undefined {
  if (!v || typeof v !== 'object') return undefined
  const t = v as { text?: unknown; bg?: unknown }
  const out: BlockTint = {}
  if (typeof t.text === 'string' && t.text.trim()) out.text = t.text.trim()
  if (typeof t.bg === 'string' && t.bg.trim()) out.bg = t.bg.trim()
  return out.text || out.bg ? out : undefined
}

// The link-tree body sits in a centred, narrow column exactly like the public page. Each
// block renders inside this wrapper so the editor preview matches the live render.
function Row({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-xl px-1">{children}</div>
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SpotlightHeading — a section title (level 2 or 3) + optional tint
// ═══════════════════════════════════════════════════════════════════════════════

function HeadingView({ text, level, tint }: { text: string; level: 2 | 3; tint?: BlockTint }) {
  if (!text) return null
  return level === 3 ? (
    <h3 className="mt-2 text-base font-bold text-text" style={tintStyle(tint)}>{text}</h3>
  ) : (
    <h2 className="mt-2 text-lg font-bold text-text" style={tintStyle(tint)}>{text}</h2>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SpotlightText — a paragraph of member copy + optional tint
// ═══════════════════════════════════════════════════════════════════════════════

function TextView({ text, tint }: { text: string; tint?: BlockTint }) {
  if (!text) return null
  return (
    <p className="whitespace-pre-wrap text-pretty text-sm leading-relaxed text-text" style={tintStyle(tint)}>
      {text}
    </p>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. LinkTree — THE core bio-link list (the link tree). Up to MAX_LINKS_PER_BLOCK.
// ═══════════════════════════════════════════════════════════════════════════════

type LinkRow = { label?: string; url?: string }

function LinkTreeView({ items, tint }: { items: LinkRow[]; tint?: BlockTint }) {
  const safe = items.filter((i) => i?.url).slice(0, MAX_LINKS_PER_BLOCK)
  if (safe.length === 0) return null
  return (
    <div className="space-y-2">
      {safe.map((item, i) => (
        <a
          key={i}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="block rounded-2xl border border-border-strong bg-surface px-4 py-3 text-center text-sm font-semibold text-text shadow-sm transition-colors hover:bg-surface-elevated"
          style={tintStyle(tint)}
        >
          {item.label?.trim() || item.url}
        </a>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. SpotlightImage — one member-uploaded image (owner-bucket asset PATH) + framing
// ═══════════════════════════════════════════════════════════════════════════════

function ImageView({
  assetPath, alt, focusX, focusY, zoom, publicBase,
}: {
  assetPath: string; alt: string; focusX: number; focusY: number; zoom: number; publicBase: string
}) {
  if (!assetPath) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-2xl border border-dashed border-border text-xs text-subtle">
        Upload an image
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <Image
        src={`${publicBase}${assetPath}`}
        alt={alt}
        width={640}
        height={640}
        className="h-auto w-full object-cover"
        style={{
          objectPosition: `${focusX}% ${focusY}%`,
          transform: zoom !== 100 ? `scale(${zoom / 100})` : undefined,
        }}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. SpotlightGallery — a grid of member images (owner-bucket PATHs). Up to MAX.
// ═══════════════════════════════════════════════════════════════════════════════

type GalleryRow = { assetPath?: string; alt?: string; focusX?: number; focusY?: number; zoom?: number }

function GalleryView({ items, publicBase }: { items: GalleryRow[]; publicBase: string }) {
  const safe = items.filter((i) => i?.assetPath).slice(0, MAX_GALLERY_IMAGES)
  if (safe.length === 0) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-2xl border border-dashed border-border text-xs text-subtle">
        Add gallery images
      </div>
    )
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {safe.map((it, i) => (
        <div key={i} className="relative aspect-square overflow-hidden rounded-xl border border-border">
          <Image
            src={`${publicBase}${it.assetPath}`}
            alt={it.alt ?? ''}
            fill
            sizes="(max-width: 640px) 33vw, 180px"
            className="object-cover"
            style={{
              objectPosition: `${it.focusX ?? 50}% ${it.focusY ?? 50}%`,
              transform: (it.zoom ?? 100) !== 100 ? `scale(${(it.zoom ?? 100) / 100})` : undefined,
            }}
          />
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. SpotlightQuote — a callout quote + optional attribution + tint
// ═══════════════════════════════════════════════════════════════════════════════

function QuoteView({ text, cite, tint }: { text: string; cite?: string; tint?: BlockTint }) {
  if (!text) return null
  return (
    <blockquote
      className="border-l-4 border-primary-strong bg-surface/60 py-2 pl-4 pr-3"
      style={tint?.bg ? { backgroundColor: tint.bg } : undefined}
    >
      <p className="text-pretty text-sm italic leading-relaxed text-text" style={{ color: tint?.text }}>
        {text}
      </p>
      {cite?.trim() && <footer className="mt-1.5 text-xs font-medium text-muted">— {cite}</footer>}
    </blockquote>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. SpotlightStats — gamification pills. The member picks WHICH; the VALUES come
//    from puck.metadata (server-resolved), never from the stored block.
// ═══════════════════════════════════════════════════════════════════════════════

const STAT_LABEL: Record<SpotlightStatKey, string> = {
  zaps: 'Zaps', streak: 'Day streak', gems: 'Gems earned', joined: 'Member since', region: 'Region',
}

function StatPill({ icon: Icon, value, label }: { icon: typeof Flame; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
      <Icon className="h-4 w-4 text-primary-strong" aria-hidden />
      <span className="text-sm font-semibold text-text tabular-nums">{value}</span>
      {label && <span className="text-xs text-muted">{label}</span>}
    </div>
  )
}

function StatsView({ show, meta }: { show: SpotlightStatKey[]; meta: SpotlightRenderMeta }) {
  const s = meta.stats
  const pills: React.ReactNode[] = []
  for (const key of show) {
    if (key === 'zaps' && s.zaps && s.zaps > 0) pills.push(<StatPill key={key} icon={Zap} value={s.zaps.toLocaleString()} label="zaps" />)
    else if (key === 'streak' && s.streak && s.streak > 0) pills.push(<StatPill key={key} icon={Flame} value={String(s.streak)} label="day streak" />)
    else if (key === 'gems' && s.gems && s.gems > 0) pills.push(<StatPill key={key} icon={Gem} value={s.gems.toLocaleString()} label="gems earned" />)
    else if (key === 'joined' && s.joinedYear) pills.push(<StatPill key={key} icon={CalendarDays} value={String(s.joinedYear)} label="member since" />)
    else if (key === 'region' && s.region) pills.push(<StatPill key={key} icon={MapPin} value={s.region} label="" />)
  }
  // In the editor (no live values yet) show a labelled placeholder pill per pick, so the
  // member sees WHAT they chose even before the numbers resolve on the public page.
  if (pills.length === 0) {
    if (show.length === 0) return null
    return (
      <div className="flex flex-wrap gap-2">
        {show.map((key) => (
          <div key={key} className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-subtle">
            {STAT_LABEL[key]}
          </div>
        ))}
      </div>
    )
  }
  return <div className="flex flex-wrap gap-2">{pills}</div>
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. TopFriends — the "Top 8" grid. Faces come from puck.metadata (server-resolved).
// ═══════════════════════════════════════════════════════════════════════════════

function TopFriendsView({ title, meta }: { title?: string; meta: SpotlightRenderMeta }) {
  const friends = meta.topFriends.slice(0, MAX_TOP_FRIENDS)
  if (friends.length === 0) {
    return (
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">{title?.trim() || 'Top Friends'}</h2>
        <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-subtle">
          Pick your Top Friends to fill this grid
        </p>
      </section>
    )
  }
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">{title?.trim() || 'Top Friends'}</h2>
      <div className="grid grid-cols-4 gap-3">
        {friends.map((f) => {
          const name = f.displayName || `@${f.handle}`
          return (
            <Link
              key={f.profileId}
              href={`/people/${f.handle}`}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-surface p-2 text-center transition-colors hover:bg-surface-elevated"
            >
              {f.avatarUrl ? (
                <Image src={f.avatarUrl} alt={name} width={64} height={64} className="h-14 w-14 rounded-full object-cover" />
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

// ═══════════════════════════════════════════════════════════════════════════════
// 9. SpotlightEmbed — a first-party music/video player. src REBUILT from a validated
//    (provider, ref); a member never supplies a raw iframe src.
// ═══════════════════════════════════════════════════════════════════════════════

function EmbedView({ provider, embedRef }: { provider: EmbedProvider; embedRef: string }) {
  if (!embedRef) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-2xl border border-dashed border-border text-xs text-subtle">
        Add a {provider} link
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <iframe
        src={buildEmbedSrc(provider, embedRef)}
        title={`${provider} embed`}
        height={embedHeight(provider)}
        className="w-full"
        style={{ border: 0 }}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
        allow="autoplay; encrypted-media; clipboard-write; picture-in-picture; fullscreen"
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

const PROVIDER_OPTIONS = EMBED_PROVIDERS.map((p) => ({ label: p.label, value: p.id }))
const STAT_OPTIONS = SPOTLIGHT_STAT_KEYS.map((k) => ({ label: STAT_LABEL[k], value: k }))

// The registry. Every block: a small `fields` set that IS the block's stored contract,
// `defaultProps`, and a `render` that wraps the view in <Row> and threads the tint /
// metadata through. The props map 1:1 to the SpotlightBlock fields so the converter is
// a straight re-shape (see convert.ts).
export const linktreeComponents: Record<string, ComponentConfig> = {
  SpotlightHeading: {
    label: 'Heading',
    fields: {
      text: { type: 'text', label: 'Heading' },
      level: {
        type: 'radio',
        label: 'Size',
        options: [
          { label: 'Large', value: 2 },
          { label: 'Small', value: 3 },
        ],
      },
      tint: tintField,
    },
    defaultProps: { text: 'Section heading', level: 2, tint: tintDefault },
    render: ({ text, level, tint }) => (
      <Row>
        <HeadingView text={(text as string) ?? ''} level={(level as 2 | 3) === 3 ? 3 : 2} tint={toTint(tint)} />
      </Row>
    ),
  },

  SpotlightText: {
    label: 'Text',
    fields: {
      text: { type: 'textarea', label: 'Text' },
      tint: tintField,
    },
    defaultProps: { text: 'Say something about yourself.', tint: tintDefault },
    render: ({ text, tint }) => (
      <Row>
        <TextView text={(text as string) ?? ''} tint={toTint(tint)} />
      </Row>
    ),
  },

  LinkTree: {
    label: 'Links',
    fields: {
      items: {
        type: 'array',
        label: `Links (up to ${MAX_LINKS_PER_BLOCK})`,
        arrayFields: {
          label: { type: 'text', label: 'Label' },
          url: { type: 'text', label: 'URL' },
        },
        getItemSummary: (i: LinkRow) => i.label?.trim() || i.url?.trim() || 'Link',
      },
      tint: tintField,
    },
    defaultProps: {
      items: [{ label: 'My website', url: 'https://' }],
      tint: tintDefault,
    },
    render: ({ items, tint }) => (
      <Row>
        <LinkTreeView items={(items as LinkRow[]) ?? []} tint={toTint(tint)} />
      </Row>
    ),
  },

  SpotlightImage: {
    label: 'Image',
    fields: {
      assetPath: spotlightAssetField,
      alt: { type: 'text', label: 'Alt text' },
      focusX: { type: 'number', label: 'Focus X (0-100)', min: 0, max: 100 },
      focusY: { type: 'number', label: 'Focus Y (0-100)', min: 0, max: 100 },
      zoom: { type: 'number', label: 'Zoom (100-200)', min: 100, max: 200 },
    },
    defaultProps: { assetPath: '', alt: '', focusX: 50, focusY: 50, zoom: 100 },
    render: ({ assetPath, alt, focusX, focusY, zoom, puck }) => (
      <Row>
        <ImageView
          assetPath={(assetPath as string) ?? ''}
          alt={(alt as string) ?? ''}
          focusX={typeof focusX === 'number' ? focusX : 50}
          focusY={typeof focusY === 'number' ? focusY : 50}
          zoom={typeof zoom === 'number' ? zoom : 100}
          publicBase={readMeta(puck).publicBase}
        />
      </Row>
    ),
  },

  SpotlightGallery: {
    label: 'Gallery',
    fields: {
      items: {
        type: 'array',
        label: `Images (up to ${MAX_GALLERY_IMAGES})`,
        arrayFields: {
          assetPath: spotlightGalleryImageField,
          alt: { type: 'text', label: 'Alt text' },
          focusX: { type: 'number', label: 'Focus X', min: 0, max: 100 },
          focusY: { type: 'number', label: 'Focus Y', min: 0, max: 100 },
          zoom: { type: 'number', label: 'Zoom', min: 100, max: 200 },
        },
        getItemSummary: (i: GalleryRow, idx?: number) => i.alt?.trim() || `Image ${(idx ?? 0) + 1}`,
      },
    },
    defaultProps: { items: [] },
    render: ({ items, puck }) => (
      <Row>
        <GalleryView items={(items as GalleryRow[]) ?? []} publicBase={readMeta(puck).publicBase} />
      </Row>
    ),
  },

  SpotlightQuote: {
    label: 'Quote',
    fields: {
      text: { type: 'textarea', label: 'Quote' },
      cite: { type: 'text', label: 'Attribution (optional)' },
      tint: tintField,
    },
    defaultProps: { text: 'A line worth sharing.', cite: '', tint: tintDefault },
    render: ({ text, cite, tint }) => (
      <Row>
        <QuoteView text={(text as string) ?? ''} cite={cite as string | undefined} tint={toTint(tint)} />
      </Row>
    ),
  },

  SpotlightStats: {
    label: 'Stats',
    fields: {
      show: {
        type: 'array',
        label: 'Stats to show',
        arrayFields: {
          key: { type: 'select', label: 'Stat', options: STAT_OPTIONS },
        },
        getItemSummary: (i: { key?: string }) => STAT_LABEL[(i.key as SpotlightStatKey)] ?? 'Stat',
      },
    },
    defaultProps: { show: [{ key: 'zaps' }, { key: 'streak' }] },
    render: ({ show, puck }) => {
      // The stored schema is a flat SpotlightStatKey[]; the editor array uses {key} rows so
      // Puck can render a select per item. Flatten + validate here.
      const keys = Array.isArray(show)
        ? (show as { key?: unknown }[])
            .map((r) => r?.key)
            .filter((k): k is SpotlightStatKey => SPOTLIGHT_STAT_KEYS.includes(k as SpotlightStatKey))
        : []
      return (
        <Row>
          <StatsView show={keys} meta={readMeta(puck)} />
        </Row>
      )
    },
  },

  TopFriends: {
    label: 'Top Friends',
    fields: {
      title: { type: 'text', label: 'Grid title (optional)' },
    },
    defaultProps: { title: '' },
    render: ({ title, puck }) => (
      <Row>
        <TopFriendsView title={title as string | undefined} meta={readMeta(puck)} />
      </Row>
    ),
  },

  SpotlightEmbed: {
    label: 'Music / Video',
    fields: {
      provider: { type: 'select', label: 'Provider', options: PROVIDER_OPTIONS },
      ref: { type: 'text', label: 'Link or ID' },
    },
    defaultProps: { provider: 'spotify', ref: '' },
    render: ({ provider, ref }) => (
      <Row>
        <EmbedView provider={(provider as EmbedProvider) ?? 'spotify'} embedRef={(ref as string) ?? ''} />
      </Row>
    ),
  },

  SpotlightDivider: {
    label: 'Divider',
    fields: { tint: tintField },
    defaultProps: { tint: tintDefault },
    render: ({ tint }) => {
      const t = toTint(tint)
      return (
        <Row>
          <hr className="my-2 border-border" style={t?.text ? { borderColor: t.text } : undefined} />
        </Row>
      )
    },
  },
}

// The left-bar category for the link-tree blocks, appended in lib/page-editor/config.tsx.
export const LINKTREE_CATEGORY_COMPONENTS = [
  'LinkTree',
  'SpotlightHeading',
  'SpotlightText',
  'SpotlightImage',
  'SpotlightGallery',
  'SpotlightQuote',
  'SpotlightStats',
  'TopFriends',
  'SpotlightEmbed',
  'SpotlightDivider',
] as const
