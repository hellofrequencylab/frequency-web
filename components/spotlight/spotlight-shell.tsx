import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, MapPin } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { BETA_CTA_HREF, BETA_CTA_LABEL } from '@/lib/site'
import { resolveProfileSkin } from '@/lib/theme/profile-skins'
import { ROLE_LABEL, roleBadgeStyle, type RoleChipKey } from '@/lib/community-roles'
import type { SpotlightData } from '@/lib/spotlight/data'
import { spotlightThemeStyles } from '@/lib/spotlight/theme'
import { SPOTLIGHT_PUBLIC_BASE } from '@/lib/spotlight/puck/resolve'

// THE SHARED PUBLIC SPOTLIGHT CHROME. The member's identity header + theme wrapper + optional
// background + join CTA footer, with the BLOCK BODY handed in as `children`. Since ADR-523 the ONLY body
// is the module engine (MemberProfileModules, the grid render) — the Puck Spotlight render is retired.
// This shell keeps the identity/theme/background/OG/CTA framing so the public page look is unchanged.
//
// The server-resolved values (name, avatar, theme, background) read the allowlisted SpotlightData. The
// public page passes `showBio={false}`: the `about` block owns the bio, so showing it here would double
// it. Server Component throughout; ships no editor runtime.

export function SpotlightShell({
  data,
  showJoinCta = false,
  showBio = true,
  children,
}: {
  data: SpotlightData
  showJoinCta?: boolean
  /** Show the member's bio in the identity header. Puck body: true. Module body: false (the `about`
   *  block renders the bio, so the header must not repeat it). */
  showBio?: boolean
  /** The block body (Puck <BlockRender> or <MemberProfileModules>), placed where the body renders. */
  children: React.ReactNode
}) {
  const { profile, background, theme } = data
  const skin = resolveProfileSkin(profile.profile_theme)
  const themeStyles = spotlightThemeStyles(theme)
  const name = profile.display_name || `@${profile.handle}`
  const region = profile.nexus_regions?.name ?? null

  return (
    <div data-skin={skin} className="spotlight-root relative min-h-screen bg-canvas" style={themeStyles.wrapper}>
      {background.assetPath && (
        <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden" aria-hidden>
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
          {theme.header.show && profile.header_image_url ? (
            <div className="relative -mx-4 overflow-hidden sm:rounded-b-3xl" style={{ height: theme.header.height }}>
              <Image
                src={profile.header_image_url}
                alt=""
                fill
                priority
                sizes="(max-width: 640px) 100vw, 608px"
                className="object-cover"
                style={{ objectPosition: `50% ${theme.header.focusY}%` }}
              />
            </div>
          ) : null}

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

            <h1 className="mt-4 text-2xl font-bold text-text" style={{ fontFamily: themeStyles.headingFont }}>
              {name}
            </h1>
            <p className="text-sm text-muted">@{profile.handle}</p>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              {profile.community_role && (
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

            {showBio && profile.bio && (
              <p className="mt-4 max-w-md text-pretty text-sm leading-relaxed text-text">{profile.bio}</p>
            )}
          </div>

          {/* The member's block body (Puck or module engine). */}
          <div className="mt-6">{children}</div>

          {showJoinCta ? (
            <footer className="mt-12">
              <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-sm">
                <p className="text-sm font-semibold text-text">Want a page like this?</p>
                <p className="mx-auto mt-1 max-w-sm text-pretty text-sm leading-relaxed text-muted">
                  {name.replace(/^@/, '')} built this on Frequency, a place to gather your people and bring real
                  community back to where you live.
                </p>
                <Link
                  href={BETA_CTA_HREF}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover"
                >
                  {BETA_CTA_LABEL}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            </footer>
          ) : (
            <footer className="mt-12 text-center">
              <Link href="/" className="text-xs text-subtle transition-colors hover:text-muted">
                Made on Frequency
              </Link>
            </footer>
          )}
        </main>
      </div>
    </div>
  )
}
