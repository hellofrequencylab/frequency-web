'use client'

// The Spotlight IDENTITY HEADER + THEME WRAPPER, as a CLIENT component. This is the shared
// visual chrome that frames a member's page: the theme wrapper (colours/gradient/fonts via
// spotlightThemeStyles), the fixed/absolute background image + dim, and the Linktree-style
// identity block (header cover image, avatar, name, @handle, role chip, region, bio).
//
// WHY A CLIENT COPY: the PUBLIC page renders this same chrome server-side (puck-render.tsx /
// spotlight-view.tsx). The MOBILE editor's live preview (spotlight-live-preview.tsx) is a
// client surface that must show the EXACT same page while the member edits, so it needs a
// client-renderable version of the identity + wrapper. The markup mirrors puck-render.tsx
// 1:1 (same classes, same structure) so the preview reads identically to live — but the
// public render is NOT changed by this file; it keeps its own server markup unchanged.
//
// Tokens only (semantic DAWN), the sole raw colours are the member's OWN validated theme
// values applied through spotlightThemeStyles. No hardcoded brand hex.

import type { CSSProperties, ReactNode } from 'react'
import { MapPin } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { ROLE_LABEL, roleBadgeStyle, type RoleChipKey } from '@/lib/community-roles'
import { spotlightThemeStyles, type SpotlightTheme } from '@/lib/spotlight/theme'
import type { SpotlightBackground } from '@/lib/spotlight/blocks/schema'

/** The identity bits the header needs, selected from the owner's profile row. Mirrors the
 *  fields puck-render.tsx reads (SpotlightRow) so the preview matches the public page. */
export interface SpotlightIdentity {
  displayName: string | null
  handle: string
  avatarUrl: string | null
  headerImageUrl: string | null
  bio: string | null
  communityRole: string | null
  /** Region LABEL only (never coordinates) — matches the public page's `nexus_regions.name`. */
  regionName: string | null
}

/**
 * The resolved display name: the member's chosen name, else their handle. Pure so the
 * mobile preview + any test agree on exactly what the header shows.
 */
export function spotlightDisplayName(identity: SpotlightIdentity): string {
  return identity.displayName || `@${identity.handle}`
}

/** The public avatars bucket base — client-safe env, mirrors puck-render.tsx / render.tsx. */
export const SPOTLIGHT_PUBLIC_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/avatars/`

/**
 * The themed page shell + identity header, wrapping arbitrary block `children`. Reused by the
 * mobile live preview. `contained` scopes the background to a preview box (absolute, no
 * min-h-screen) exactly like SpotlightView's preview variant, so the preview doesn't paint
 * over the whole editor viewport.
 */
export function SpotlightThemedShell({
  theme,
  background,
  identity,
  contained = false,
  children,
}: {
  theme: SpotlightTheme
  background: SpotlightBackground
  identity: SpotlightIdentity
  contained?: boolean
  children: ReactNode
}) {
  const themeStyles = spotlightThemeStyles(theme)
  const name = spotlightDisplayName(identity)

  return (
    <div
      className={`spotlight-root relative bg-canvas ${contained ? '' : 'min-h-screen'}`}
      style={themeStyles.wrapper as CSSProperties}
    >
      {background.assetPath && (
        <div
          className={`pointer-events-none ${contained ? 'absolute' : 'fixed'} inset-0 -z-0 overflow-hidden`}
          aria-hidden
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${SPOTLIGHT_PUBLIC_BASE}${background.assetPath}`}
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
          {theme.header.show && identity.headerImageUrl ? (
            <div className="relative -mx-4 overflow-hidden sm:rounded-b-3xl" style={{ height: theme.header.height }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={identity.headerImageUrl}
                alt=""
                className="h-full w-full object-cover"
                style={{ objectPosition: `50% ${theme.header.focusY}%` }}
              />
            </div>
          ) : null}

          <div
            className={`relative z-10 flex flex-col items-center text-center ${
              theme.header.show && identity.headerImageUrl ? '-mt-14' : 'mt-8'
            }`}
          >
            {identity.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={identity.avatarUrl}
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

            <h1 className="mt-4 text-2xl font-bold text-text" style={{ fontFamily: themeStyles.headingFont }}>
              {name}
            </h1>
            <p className="text-sm text-muted">@{identity.handle}</p>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              {identity.communityRole && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-text shadow-sm"
                  style={roleBadgeStyle(identity.communityRole as RoleChipKey)}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--rank)' }} aria-hidden />
                  {ROLE_LABEL[identity.communityRole as RoleChipKey] ?? identity.communityRole}
                </span>
              )}
              {identity.regionName && (
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  <MapPin className="h-3 w-3" aria-hidden /> {identity.regionName}
                </span>
              )}
            </div>

            {identity.bio && (
              <p className="mt-4 max-w-md text-pretty text-sm leading-relaxed text-text">{identity.bio}</p>
            )}
          </div>

          {/* The member's block body (tappable in the editor preview). */}
          <div className="mt-6 space-y-4 [&_section]:!py-0">{children}</div>

          <footer className="mt-12 text-center">
            <span className="text-xs text-subtle">Made on Frequency</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
