import Image from 'next/image'
import Link from 'next/link'
import { AtSign, BookOpen, Briefcase, Calendar, Camera, Globe, Headphones, Heart, Link2, Mail, Music, ShoppingBag, Users, Video, type LucideIcon } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { BETA_CTA_HREF } from '@/lib/site'
import { SOCIAL_LABEL, visibleLinks, type LinkIcon, type SocialKind, type SpotlightPageSettings } from '@/lib/spotlight/link-in-bio'
import type { SpotlightRow } from '@/lib/spotlight/privacy'
import { CountedExternalLink } from '@/components/spotlight/counted-external-link'

// THE PERSONAL SPOTLIGHT AS A LINK-IN-BIO. Server Component, kit tokens only. Photo, name, bio, a social row, then the
// member's ordered links (the highlighted one filled). `children` is the optional "On Frequency" body: the shell passes
// the member's Frequency blocks when "Show Frequency features" is on and nothing when it is off. The small
// "Get your spotlight on Frequency" link at the bottom is always there; it is not a setting.

const ICONS: Record<LinkIcon, LucideIcon> = {
  link: Link2,
  calendar: Calendar,
  mail: Mail,
  music: Music,
  video: Video,
  shop: ShoppingBag,
  book: BookOpen,
  heart: Heart,
}

// One distinct, neutral glyph per network (the icon set carries no brand marks), so the row reads at a glance.
const SOCIAL_ICONS: Record<SocialKind, LucideIcon> = {
  instagram: Camera,
  tiktok: Music,
  youtube: Video,
  spotify: Headphones,
  x: AtSign,
  linkedin: Briefcase,
  facebook: Users,
  email: Mail,
  website: Globe,
}

export function LinkInBioPage({
  profile,
  page,
  headingFont,
  preview = false,
  children,
}: {
  profile: SpotlightRow
  page: SpotlightPageSettings
  headingFont?: string
  /** The editor's live preview: no full-height page. */
  preview?: boolean
  children?: React.ReactNode
}) {
  const name = profile.display_name || `@${profile.handle}`
  const links = visibleLinks(page.links)
  return (
    <main className={`relative mx-auto flex max-w-xl flex-col px-4 pb-10 pt-10 ${preview ? "" : "min-h-screen"}`}>
      <div className="flex flex-col items-center text-center">
        {profile.avatar_url ? (
          <Image
            src={avatarSrc(profile.avatar_url)}
            alt={name}
            width={96}
            height={96}
            priority
            className="h-24 w-24 rounded-pill object-cover ring-4 ring-canvas lift-1"
            style={avatarFocusStyle(profile.avatar_url)}
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-pill bg-primary-bg text-stat-sm font-bold text-primary-strong ring-4 ring-canvas lift-1">
            {getInitials(name)}
          </div>
        )}
        <h1 className="mt-4 text-page-title font-bold text-text" style={{ fontFamily: headingFont }}>
          {name}
        </h1>
        <p className="text-body-sm text-muted">@{profile.handle}</p>
        {profile.bio && <p className="mt-3 max-w-md text-pretty text-body-sm leading-relaxed text-text">{profile.bio}</p>}
        {page.socials.length > 0 && (
          <ul className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Find me online">
            {page.socials.map((s) => (
              <li key={s.kind}>
                <a
                  href={s.url}
                  target={s.kind === 'email' ? undefined : '_blank'}
                  rel="noopener noreferrer me"
                  className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3 py-1.5 text-meta font-semibold text-text transition-colors hover:bg-surface-elevated"
                >
                  {(() => {
                    const SocialIcon = SOCIAL_ICONS[s.kind]
                    return <SocialIcon className="h-3.5 w-3.5" aria-hidden />
                  })()}
                  {SOCIAL_LABEL[s.kind]}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {links.length > 0 && (
        <ul className="mt-6 space-y-3">
          {links.map((l) => {
            const Icon = ICONS[l.icon]
            return (
              <li key={l.id}>
                <CountedExternalLink
                  href={l.url}
                  beacon={preview ? null : { profile: profile.id, link: l.id }}
                  className={`flex items-center gap-3 rounded-card border px-4 py-3.5 text-body-sm font-semibold transition-colors ${
                    l.highlight
                      ? 'border-primary bg-primary text-on-primary hover:bg-primary-hover'
                      : 'border-border bg-surface text-text lift-1 hover:bg-surface-elevated'
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-center">{l.title}</span>
                  <span className="h-5 w-5 shrink-0" aria-hidden />
                </CountedExternalLink>
              </li>
            )
          })}
        </ul>
      )}

      {children ? (
        <section className="mt-10" aria-label="On Frequency">
          <p className="mb-3 text-center text-meta font-semibold uppercase tracking-wide text-subtle">On Frequency</p>
          {children}
        </section>
      ) : null}

      <footer className="mt-auto pt-12 text-center">
        <Link href={BETA_CTA_HREF} className="text-meta font-semibold text-primary-strong underline-offset-4 hover:underline">
          Get your spotlight on Frequency
        </Link>
      </footer>
    </main>
  )
}
