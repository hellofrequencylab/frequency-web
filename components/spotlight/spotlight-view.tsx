'use client'

import Image from 'next/image'
import Link from 'next/link'
import { CalendarDays, Globe, MapPin } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { resolveProfileSkin } from '@/lib/theme/profile-skins'
import { ROLE_LABEL, roleBadgeStyle, type RoleChipKey } from '@/lib/community-roles'
import type { SpotlightData } from '@/lib/spotlight/data'
import { spotlightThemeStyles } from '@/lib/spotlight/theme'
import { SpotlightBlocks } from './blocks/render'

// The presentational Spotlight page, shared by the PUBLIC route (server wrapper in
// spotlight-page.tsx) and the live editor preview (components/spotlight/builder.tsx). Pure
// presentation over already-allowlisted data (lib/spotlight/privacy.ts); it renders no
// contact or location, only what the member curates + the stats they display. `contained`
// scopes it to a preview box (absolute background, no min-h-screen) instead of the viewport.

const PUBLIC_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/avatars/`

function normalizeUrl(raw: string): { href: string; label: string } {
  const label = raw.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const href = /^https?:\/\//.test(raw) ? raw : `https://${raw}`
  return { href, label }
}

export function SpotlightView({ data, contained = false }: { data: SpotlightData; contained?: boolean }) {
  const { profile, hostedEvents, layout, background, theme, totalZaps, topFriends } = data
  const skin = resolveProfileSkin(profile.profile_theme)
  // The member's custom colours/gradient/fonts/card style (validated). Empty styles when
  // they haven't customized, so the page renders exactly as the skin alone would.
  const themeStyles = spotlightThemeStyles(theme)
  const name = profile.display_name || `@${profile.handle}`
  const region = profile.nexus_regions?.name ?? null
  const website = profile.website ? normalizeUrl(profile.website) : null
  // Authoritative stat values for any `stats` block — read from the allowlisted row,
  // never from member input, so the numbers shown can't be faked.
  const statsContext = {
    zaps: totalZaps,
    streak: profile.current_streak,
    gems: profile.lifetime_gems,
    joinedYear: profile.created_at ? new Date(profile.created_at).getFullYear() : null,
    region,
  }
  // When the member has built a custom layout, it replaces the curated body below the
  // identity header; otherwise the curated default (links + events) renders unchanged.
  const hasLayout = layout.blocks.length > 0

  return (
    <div
      data-skin={skin}
      className={`spotlight-root relative bg-canvas ${contained ? '' : 'min-h-screen'}`}
      style={themeStyles.wrapper}
    >
      {background.assetPath && (
        <div className={`pointer-events-none ${contained ? 'absolute' : 'fixed'} inset-0 -z-0 overflow-hidden`} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${PUBLIC_BASE}${background.assetPath}`}
            alt=""
            className="h-full w-full object-cover"
            style={{
              objectPosition: `${background.focusX}% ${background.focusY}%`,
              transform: background.zoom !== 100 ? `scale(${background.zoom / 100})` : undefined,
            }}
          />
          <div className="absolute inset-0 bg-canvas" style={{ opacity: background.dim / 100 }} />
        </div>
      )}
      <div className="relative z-10">
      <main className="mx-auto max-w-xl px-4 pb-16">
        {/* Header/cover image at the top — the avatar sits IN FRONT of it (z-index),
            overlapping its lower edge. Toggle, height + vertical focus stay member-adjustable. */}
        {theme.header.show && profile.header_image_url ? (
          <div className="relative -mx-4 overflow-hidden sm:rounded-b-3xl" style={{ height: theme.header.height }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={profile.header_image_url} alt="" className="h-full w-full object-cover" style={{ objectPosition: `50% ${theme.header.focusY}%` }} />
          </div>
        ) : null}

        {/* Identity (Linktree-style): avatar leads and, when a header is set, overlaps it
            from in front via z-index + a negative top margin. */}
        <div
          className={`relative z-10 flex flex-col items-center text-center ${
            theme.header.show && profile.header_image_url ? '-mt-14' : 'mt-8'
          }`}
        >
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt={name}
              width={112}
              height={112}
              className="h-28 w-28 rounded-full object-cover ring-4 ring-canvas shadow-lg"
            />
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-primary-bg text-3xl font-bold text-primary-strong ring-4 ring-canvas shadow-lg">
              {getInitials(name)}
            </div>
          )}

          <h1 className="mt-4 text-2xl font-bold text-text" style={{ fontFamily: themeStyles.headingFont }}>{name}</h1>
          <p className="text-sm text-muted">@{profile.handle}</p>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {profile.community_role && (
              // Solid, high-contrast chip (matches the stat-pill surface) so the role stays
              // readable over any member-chosen gradient; the rank colour is kept as a dot.
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-text shadow-sm"
                style={roleBadgeStyle(profile.community_role as RoleChipKey)}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--rank)' }} aria-hidden />
                {ROLE_LABEL[profile.community_role as RoleChipKey] ?? profile.community_role}
              </span>
            )}
            {region && (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <MapPin className="h-3 w-3" aria-hidden /> {region}
              </span>
            )}
          </div>

          {profile.bio && (
            <p className="mt-4 max-w-md text-pretty text-sm leading-relaxed text-text">{profile.bio}</p>
          )}
        </div>

        {/* Game stats are NOT auto-shown in the header — they appear only in the member's
            stats block (below), so the top stays clean and member-curated. */}

        {hasLayout ? (
          /* Member-built layout: their blocks replace the curated body. */
          <SpotlightBlocks
            blocks={layout.blocks}
            stats={statsContext}
            topFriends={topFriends}
            cardStyle={themeStyles.card}
            headingFont={themeStyles.headingFont}
          />
        ) : (
          <>
            {/* Curated default — links + upcoming events. */}
            {website && (
              <div className="mt-6 space-y-3">
                <a
                  href={website.href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="flex items-center justify-center gap-2 rounded-2xl border border-border-strong bg-surface px-4 py-3.5 text-sm font-semibold text-text shadow-sm transition-colors hover:bg-surface-elevated"
                >
                  <Globe className="h-4 w-4 text-primary-strong" aria-hidden /> {website.label}
                </a>
              </div>
            )}

            {hostedEvents.length > 0 && (
              <section className="mt-8">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">Upcoming</h2>
                <div className="space-y-2">
                  {hostedEvents.map((e) => (
                    <Link
                      key={e.id}
                      href={`/events/${e.slug}`}
                      className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-elevated"
                    >
                      <CalendarDays className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text">{e.title}</p>
                        <p className="text-xs text-muted">
                          {new Date(e.starts_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* Quiet attribution + a way in */}
        <footer className="mt-12 text-center">
          <Link href="/" className="text-xs text-subtle transition-colors hover:text-muted">
            Made on Frequency
          </Link>
        </footer>
      </main>
      </div>
    </div>
  )
}
