import Image from 'next/image'
import { Mail, Phone, MapPin, Globe, Instagram, Linkedin, Link2, Users2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import type { SharedWithSpaceView } from '@/lib/connections/store'

// SHARED-WITH-SPACE — the team read view for the 'shared' network-contact tier (ADR-778). A member can
// share a contact's CARD with a Space's team; this is where the team reads it. Presentational only: the
// gated route (app/(main)/spaces/[slug]/crm/shared) authorizes the viewer as a team member and hands the
// card projection here. CARD FIELDS ONLY — the reader never returns the owner's private notes or tags, so
// there is nothing private to render. Semantic DAWN tokens only, no hex. Voice per CONTENT-VOICE (plain,
// no em dashes).

/** Prefix a bare host with https:// so a stored URL without a scheme still links out safely. */
function ensureUrl(value: string): string {
  const v = value.trim()
  if (/^https?:\/\//i.test(v)) return v
  return `https://${v.replace(/^\/+/, '')}`
}

/** A social handle or URL → a safe external href for the given platform. */
function socialHref(platform: 'instagram' | 'linkedin' | 'x' | 'other', value: string): string {
  const v = value.trim()
  if (/^https?:\/\//i.test(v)) return v
  const handle = v.replace(/^@/, '')
  switch (platform) {
    case 'instagram':
      return `https://instagram.com/${handle}`
    case 'linkedin':
      return v.includes('/') ? ensureUrl(v) : `https://linkedin.com/in/${handle}`
    case 'x':
      return `https://x.com/${handle}`
    default:
      return ensureUrl(v)
  }
}

const SOCIAL_META: Record<'instagram' | 'linkedin' | 'x' | 'other', { Icon: LucideIcon; label: string }> = {
  instagram: { Icon: Instagram, label: 'Instagram' },
  linkedin: { Icon: Linkedin, label: 'LinkedIn' },
  x: { Icon: Link2, label: 'X' },
  other: { Icon: Link2, label: 'Link' },
}

function LinkChip({ href, Icon, label }: { href: string; Icon: LucideIcon; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-primary/40 hover:text-primary-strong"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </a>
  )
}

function initial(name: string | null): string {
  const c = (name ?? '').trim().charAt(0)
  return c ? c.toUpperCase() : '?'
}

function ContactCard({ contact }: { contact: SharedWithSpaceView }) {
  const name = contact.displayName || 'A contact'
  const roleLine = [contact.title, contact.company].filter(Boolean).join(' · ')
  const socials = contact.socials ?? {}
  const socialEntries = (['instagram', 'linkedin', 'x', 'other'] as const)
    .map((key) => ({ key, value: socials[key] }))
    .filter((s): s is { key: 'instagram' | 'linkedin' | 'x' | 'other'; value: string } => !!s.value?.trim())

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        {contact.avatarUrl ? (
          <Image
            src={contact.avatarUrl}
            alt=""
            width={44}
            height={44}
            unoptimized
            className="h-11 w-11 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-bg text-sm font-semibold text-primary-strong">
            {initial(contact.displayName)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">{name}</p>
          {roleLine && <p className="truncate text-xs text-muted">{roleLine}</p>}
          {contact.city && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-subtle">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              {contact.city}
            </p>
          )}
        </div>
      </div>

      {(contact.email || contact.phone) && (
        <div className="space-y-1.5">
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="flex items-center gap-2 text-xs text-muted hover:text-primary-strong"
            >
              <Mail className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
              <span className="truncate">{contact.email}</span>
            </a>
          )}
          {contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              className="flex items-center gap-2 text-xs text-muted hover:text-primary-strong"
            >
              <Phone className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
              <span className="truncate">{contact.phone}</span>
            </a>
          )}
        </div>
      )}

      {(contact.website || socialEntries.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {contact.website && <LinkChip href={ensureUrl(contact.website)} Icon={Globe} label="Website" />}
          {socialEntries.map((s) => (
            <LinkChip
              key={s.key}
              href={socialHref(s.key, s.value)}
              Icon={SOCIAL_META[s.key].Icon}
              label={SOCIAL_META[s.key].label}
            />
          ))}
        </div>
      )}
    </li>
  )
}

export function SharedContactsView({ contacts }: { contacts: SharedWithSpaceView[] }) {
  if (contacts.length === 0) {
    return (
      <EmptyState
        icon={Users2}
        variant="first-use"
        title="No shared contacts yet"
        description="No contacts have been shared with your team yet. When a member shares a contact's card with your team, it shows up here with their name, role, and how to reach them."
      />
    )
  }

  return (
    <section>
      <SectionHeader title="Shared with your team" count={contacts.length} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {contacts.map((c) => (
          <ContactCard key={c.id} contact={c} />
        ))}
      </ul>
    </section>
  )
}
