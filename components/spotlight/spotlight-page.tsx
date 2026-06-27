import Image from 'next/image'
import Link from 'next/link'
import { CalendarDays, Flame, Gem, Globe, MapPin } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { resolveProfileSkin } from '@/lib/theme/profile-skins'
import { RoleBadge, type CommunityRole } from '@/lib/community-roles'
import type { SpotlightData } from '@/lib/spotlight/data'
import { SpotlightBlocks } from './blocks/render'

const PUBLIC_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/avatars/`

// The PUBLIC Spotlight page — a member's themed mini-site (linktree-style). Pure
// presentation over already-allowlisted data (lib/spotlight/privacy.ts); it renders
// no contact or location, only what the member curates + the stats they display.
// Themed by wrapping the whole subtree in [data-skin] derived from profile_theme, so
// the built-in skin CSS (app/globals.css) cascades here without touching the app shell.

function normalizeUrl(raw: string): { href: string; label: string } {
  const label = raw.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const href = /^https?:\/\//.test(raw) ? raw : `https://${raw}`
  return { href, label }
}

function StatPill({ icon: Icon, value, label }: { icon: typeof Flame; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
      <Icon className="h-4 w-4 text-primary-strong" aria-hidden />
      <span className="text-sm font-semibold text-text tabular-nums">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  )
}

export function SpotlightPage({ data }: { data: SpotlightData }) {
  const { profile, hostedEvents, layout, background } = data
  const skin = resolveProfileSkin(profile.profile_theme)
  const name = profile.display_name || `@${profile.handle}`
  const region = profile.nexus_regions?.name ?? null
  const website = profile.website ? normalizeUrl(profile.website) : null
  // When the member has built a custom layout, it replaces the curated body below the
  // identity header; otherwise the curated default (links + events) renders unchanged.
  const hasLayout = layout.blocks.length > 0

  return (
    <div data-skin={skin} className="relative min-h-screen bg-canvas">
      {background.assetPath && (
        <div className="pointer-events-none fixed inset-0 -z-0" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${PUBLIC_BASE}${background.assetPath}`} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-canvas" style={{ opacity: background.dim / 100 }} />
        </div>
      )}
      <div className="relative z-10">
      <main className="mx-auto max-w-xl px-4 pb-16">
        {/* Header image (optional) */}
        {profile.header_image_url ? (
          <div className="relative -mx-4 mb-[-3rem] h-40 overflow-hidden sm:rounded-b-3xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={profile.header_image_url} alt="" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="h-10" />
        )}

        {/* Identity */}
        <div className="flex flex-col items-center text-center">
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

          <h1 className="mt-4 text-2xl font-bold text-text">{name}</h1>
          <p className="text-sm text-muted">@{profile.handle}</p>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {profile.community_role && (
              <RoleBadge role={profile.community_role as CommunityRole} className="text-xs" />
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

        {/* Stats the member chooses to display */}
        {(profile.current_streak || profile.lifetime_gems) ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {!!profile.current_streak && profile.current_streak > 0 && (
              <StatPill icon={Flame} value={String(profile.current_streak)} label="day streak" />
            )}
            {!!profile.lifetime_gems && profile.lifetime_gems > 0 && (
              <StatPill icon={Gem} value={profile.lifetime_gems.toLocaleString()} label="gems earned" />
            )}
          </div>
        ) : null}

        {hasLayout ? (
          /* Member-built layout: their blocks replace the curated body. */
          <SpotlightBlocks blocks={layout.blocks} />
        ) : (
          <>
            {/* Curated default — links + upcoming events (unchanged from before). */}
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
