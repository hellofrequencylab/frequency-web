import Link from 'next/link'
import { Building2, MapPin, Clock, Phone, Mail, Link2 } from 'lucide-react'
import type { ComponentConfig } from '@measured/puck'

import { getInitials } from '@/lib/utils'
import { focalClass } from '@/lib/page-editor/image-controls'
import {
  Band,
  isInk,
  blockFields,
  blockLayoutDefaults,
  CtaButton,
  type LayoutValue,
} from '@/components/page-editor/blocks/kit'
import { imgField } from '@/lib/page-editor/fields'
// TYPE-ONLY import: erased at build, so this NEVER drags the server reader (createAdminClient) into
// the client editor bundle. The Profile blocks read the shared identity + live counts off
// `puck.metadata.space`, injected by the RSC render paths (components/spaces/space-landing.tsx +
// the Spotlight render bridge). This is the build-trap boundary: a Profile block imports NOTHING
// server-only.
import type { SpaceIdentity, SpaceHighlight } from '@/lib/spaces/content-data'

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE BLOCKS (Puck content blocks, Phase 4). A profile-native block set styled
// like a Facebook business page but painted entirely from the app's DAWN design
// system (clean cards, semantic tokens, one consistent radius/spacing/type scale) --
// NOT the marketing display-type blocks. Each block is dual-purpose (editable in
// <Puck>, rendered by <Render>), operator-movable/removable, and reads the shared
// Space identity + live counts off `puck.metadata.space` where dynamic:
//   SpaceIdentityHeader - THE shared cover + logo + name + tagline + primary CTA
//                         header (renders the SAME on the space AND the Spotlight).
//   SpaceAbout          - a clean about / story card.
//   SpaceHighlights     - a calm, card-like stat strip (members / offerings / ...).
//   SpaceOfferings      - the services the space provides, as a card grid.
//   SpaceContact        - contact + hours as an info card.
//   SpaceTeam           - the people, as avatar cards.
//   SpaceCTA            - a tasteful conversion band (card + one button).
// The dynamic reads default to a placeholder in the editor canvas (no metadata) and to
// nothing on the live render when the space has no data, so a block never depends on
// live data and this module stays client-safe. Copy is CONTENT-VOICE: plain, no em
// dashes, never invented counts.
//
// UNIFORM + WHITE-LABEL (AGENTS.md D4/D6): every card uses the SAME semantic tokens +
// the SAME radius/spacing scale, so any space looks cohesive + best-practice out of the
// box, then themes to the space's brand accent at the render layer. No hardcoded hex,
// no text-[10/11px].
// ─────────────────────────────────────────────────────────────────────────────

type PuckArg = { metadata?: Record<string, unknown> } | undefined
function identityFrom(puck: PuckArg): SpaceIdentity | undefined {
  const space = puck?.metadata?.space as { identity?: SpaceIdentity } | undefined
  return space?.identity
}
function highlightsFrom(puck: PuckArg): SpaceHighlight[] {
  const space = puck?.metadata?.space as { highlights?: SpaceHighlight[] } | undefined
  return space?.highlights ?? []
}

// Shown in the editor canvas (no live data) so a section stays visible + draggable there.
function EditorStub({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-4 py-8 text-center text-sm text-muted">
      {label}
      <span className="mt-0.5 block text-2xs text-subtle">{hint}</span>
    </div>
  )
}

// One consistent card shell every Profile info card composes, so the set reads as ONE kit (matched
// radius, border, surface, padding). `ink` swaps to the dark-band treatment for legibility.
function InfoCard({ children, ink, className = '' }: { children: React.ReactNode; ink?: boolean; className?: string }) {
  return (
    <div
      className={`rounded-2xl border ${ink ? 'border-white/10 bg-white/5' : 'border-border bg-surface'} p-6 shadow-sm ${className}`}
    >
      {children}
    </div>
  )
}

// A quiet card-title lockup (eyebrow + heading), calmer than the marketing DisplayHeading -- this set
// is a profile, not a landing page, so headings are plain bold, never full-bleed display type.
function CardTitle({ eyebrow, heading, ink }: { eyebrow?: string; heading?: string; ink?: boolean }) {
  if (!eyebrow && !heading) return null
  return (
    <div className="mb-4">
      {eyebrow && (
        <p className={`text-2xs font-bold uppercase tracking-[0.2em] ${ink ? 'text-primary' : 'text-primary-strong'}`}>
          {eyebrow}
        </p>
      )}
      {heading && (
        <h2 className={`mt-1 text-xl font-bold ${ink ? 'text-on-ink' : 'text-text'}`}>{heading}</h2>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SpaceIdentityHeader -- THE shared cover + logo + name identity. FB-business-page
// layout: a cover band with the logo/name lockup overlapping it. Renders the SAME on
// the space landing AND a brand/space Spotlight (uniform by default). The operator can
// toggle it off or override the cover/logo per surface.
// ─────────────────────────────────────────────────────────────────────────────

const COVER_HEIGHT: Record<string, string> = {
  short: 'h-40 sm:h-52',
  medium: 'h-52 sm:h-64',
  tall: 'h-64 sm:h-80',
}

export function SpaceIdentityHeaderBlock({
  identity,
  coverOverride,
  logoOverride,
  focal,
  height,
  showFollow,
}: {
  identity: SpaceIdentity
  coverOverride?: string
  logoOverride?: string
  focal?: string
  height?: string
  showFollow?: boolean
}) {
  const cover = coverOverride || identity.coverUrl || ''
  const logo = logoOverride || identity.logoUrl || ''
  const h = COVER_HEIGHT[height ?? 'medium'] ?? COVER_HEIGHT.medium
  return (
    <section className="mx-auto w-full max-w-5xl px-6 pt-8">
      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
        {/* Cover band. A neutral tinted fill when there is no uploaded cover, so the header still reads
            as an intentional identity card, never broken. */}
        <div className={`relative w-full ${h} ${cover ? '' : 'bg-gradient-to-br from-primary-bg/40 via-surface-elevated to-surface'}`}>
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element -- operator-supplied cover URL, not a build-time asset
            <img src={cover} alt="" className={`h-full w-full object-cover ${focalClass(focal)}`} />
          )}
        </div>
        {/* Identity lockup: the logo chip overlaps the cover (FB business page), name + type badge +
            tagline beside it, the primary action + follow trailing. */}
        <div className="px-6 pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 items-end gap-4">
              <div className="-mt-10 shrink-0 sm:-mt-12">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- operator-supplied logo URL
                  <img
                    src={logo}
                    alt=""
                    className="h-20 w-20 rounded-2xl border-4 border-surface bg-surface object-contain shadow-md sm:h-24 sm:w-24"
                  />
                ) : (
                  <span className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-surface bg-surface-elevated text-2xl font-bold text-subtle shadow-md sm:h-24 sm:w-24">
                    {getInitials(identity.name)}
                  </span>
                )}
              </div>
              <div className="min-w-0 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="min-w-0 break-words text-2xl font-bold leading-tight text-text">
                    {identity.name}
                  </h1>
                  {identity.typeLabel && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-bg px-2.5 py-0.5 text-2xs font-semibold text-primary-strong">
                      <Building2 className="h-3 w-3" aria-hidden />
                      {identity.typeLabel}
                    </span>
                  )}
                </div>
                {identity.tagline && <p className="mt-1 max-w-2xl text-sm text-muted">{identity.tagline}</p>}
              </div>
            </div>
            {(identity.primaryCta || showFollow) && (
              <div className="flex shrink-0 flex-wrap items-center gap-2 pb-1">
                {identity.primaryCta && (
                  <Link
                    href={identity.primaryCta.href || '#'}
                    className="inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-2.5 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover shadow-pop"
                  >
                    {identity.primaryCta.label}
                  </Link>
                )}
                {showFollow && (
                  <span className="inline-flex items-center gap-2 rounded-2xl border border-border-strong px-6 py-2.5 text-sm font-bold text-text">
                    Follow
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SpaceAbout -- a clean about / story card.
// ─────────────────────────────────────────────────────────────────────────────

export function SpaceAboutBlock({
  eyebrow,
  heading,
  body,
  ink,
}: {
  eyebrow?: string
  heading?: string
  body?: string
  ink?: boolean
}) {
  if (!body && !heading) return null
  return (
    <InfoCard ink={ink}>
      <CardTitle eyebrow={eyebrow} heading={heading} ink={ink} />
      {body && (
        <div className={`space-y-3 text-base leading-relaxed ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>
          {body.split('\n').filter(Boolean).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}
    </InfoCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SpaceHighlights -- a calm, card-like stat strip (members / offerings / ...),
// NOT the marketing StatRow. Reads live counts off metadata; nothing when empty.
// ─────────────────────────────────────────────────────────────────────────────

export function SpaceHighlightsBlock({ highlights, ink }: { highlights: SpaceHighlight[]; ink?: boolean }) {
  if (highlights.length === 0) return null
  const shown = highlights.slice(0, 4)
  return (
    <div className={`grid gap-3 ${shown.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : shown.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {shown.map((s) => (
        <div
          key={s.label}
          className={`rounded-2xl border p-5 text-center ${ink ? 'border-white/10 bg-white/5' : 'border-border bg-surface'} shadow-sm`}
        >
          <div className={`text-2xl font-bold ${ink ? 'text-on-ink' : 'text-text'}`}>{s.value.toLocaleString()}</div>
          <div className={`mt-0.5 text-2xs font-semibold uppercase tracking-wide ${ink ? 'text-on-ink-muted' : 'text-subtle'}`}>
            {s.label}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SpaceOfferings -- the services the space provides, as a card grid. Operator
// authored (title + blurb per card); the editor placeholder shows when empty.
// ─────────────────────────────────────────────────────────────────────────────

type OfferingItem = { title?: string; blurb?: string }

export function SpaceOfferingsBlock({
  eyebrow,
  heading,
  items,
  ink,
}: {
  eyebrow?: string
  heading?: string
  items: OfferingItem[]
  ink?: boolean
}) {
  const shown = items.filter((o) => o.title || o.blurb)
  return (
    <div>
      <CardTitle eyebrow={eyebrow} heading={heading} ink={ink} />
      {shown.length === 0 ? (
        <EditorStub label="Offerings" hint="Add the services this space provides" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {shown.map((o, i) => (
            <InfoCard key={i} ink={ink}>
              {o.title && <h3 className={`text-base font-bold ${ink ? 'text-on-ink' : 'text-text'}`}>{o.title}</h3>}
              {o.blurb && (
                <p className={`mt-2 text-sm leading-relaxed ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>{o.blurb}</p>
              )}
            </InfoCard>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SpaceContact -- contact + hours as an info card (address, hours, phone, email,
// links). Simple: a static-map link, never a heavy embedded map.
// ─────────────────────────────────────────────────────────────────────────────

export function SpaceContactBlock({
  eyebrow,
  heading,
  address,
  hours,
  phone,
  email,
  linkLabel,
  linkHref,
  ink,
}: {
  eyebrow?: string
  heading?: string
  address?: string
  hours?: string
  phone?: string
  email?: string
  linkLabel?: string
  linkHref?: string
  ink?: boolean
}) {
  const rows: { icon: React.ReactNode; text: React.ReactNode }[] = []
  if (address) {
    const mapHref = `https://maps.google.com/?q=${encodeURIComponent(address)}`
    rows.push({
      icon: <MapPin className="h-4 w-4" aria-hidden />,
      text: (
        <a href={mapHref} className="hover:underline" target="_blank" rel="noreferrer">
          {address}
        </a>
      ),
    })
  }
  if (hours) rows.push({ icon: <Clock className="h-4 w-4" aria-hidden />, text: hours })
  if (phone) rows.push({ icon: <Phone className="h-4 w-4" aria-hidden />, text: <a href={`tel:${phone}`} className="hover:underline">{phone}</a> })
  if (email) rows.push({ icon: <Mail className="h-4 w-4" aria-hidden />, text: <a href={`mailto:${email}`} className="hover:underline">{email}</a> })
  if (linkHref) rows.push({ icon: <Link2 className="h-4 w-4" aria-hidden />, text: <a href={linkHref} className="hover:underline" target="_blank" rel="noreferrer">{linkLabel || linkHref}</a> })

  if (rows.length === 0) {
    return (
      <div>
        <CardTitle eyebrow={eyebrow} heading={heading} ink={ink} />
        <EditorStub label="Contact" hint="Add an address, hours, and how to reach you" />
      </div>
    )
  }
  return (
    <InfoCard ink={ink}>
      <CardTitle eyebrow={eyebrow} heading={heading} ink={ink} />
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={i} className={`flex items-start gap-3 text-sm ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>
            <span className={`mt-0.5 shrink-0 ${ink ? 'text-primary' : 'text-primary-strong'}`}>{r.icon}</span>
            <span className="min-w-0 break-words">{r.text}</span>
          </li>
        ))}
      </ul>
    </InfoCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. SpaceTeam -- the people, as avatar cards. Operator authored (name + role per
// person); the editor placeholder shows when empty.
// ─────────────────────────────────────────────────────────────────────────────

type TeamMember = { name?: string; role?: string; avatar?: string }

export function SpaceTeamBlock({
  eyebrow,
  heading,
  members,
  ink,
}: {
  eyebrow?: string
  heading?: string
  members: TeamMember[]
  ink?: boolean
}) {
  const shown = members.filter((m) => m.name || m.role)
  return (
    <div>
      <CardTitle eyebrow={eyebrow} heading={heading} ink={ink} />
      {shown.length === 0 ? (
        <EditorStub label="Team" hint="Introduce the people behind this space" />
      ) : (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
          {shown.map((m, i) => (
            <InfoCard key={i} ink={ink} className="text-center">
              {m.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- operator-supplied avatar URL
                <img src={m.avatar} alt="" className="mx-auto h-16 w-16 rounded-full object-cover" />
              ) : (
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-surface-elevated text-lg font-bold text-subtle">
                  {getInitials(m.name || '')}
                </span>
              )}
              {m.name && <div className={`mt-3 text-sm font-bold ${ink ? 'text-on-ink' : 'text-text'}`}>{m.name}</div>}
              {m.role && <div className={`text-2xs ${ink ? 'text-on-ink-muted' : 'text-subtle'}`}>{m.role}</div>}
            </InfoCard>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. SpaceCTA -- a tasteful conversion band (a card with a headline + one button),
// NOT a full-bleed marketing hero.
// ─────────────────────────────────────────────────────────────────────────────

export function SpaceCTABlock({
  heading,
  body,
  ctaLabel,
  ctaHref,
  ink,
}: {
  heading?: string
  body?: string
  ctaLabel?: string
  ctaHref?: string
  ink?: boolean
}) {
  if (!heading && !ctaLabel) return null
  return (
    <InfoCard ink={ink} className="text-center">
      {heading && <h2 className={`text-xl font-bold ${ink ? 'text-on-ink' : 'text-text'}`}>{heading}</h2>}
      {body && <p className={`mx-auto mt-2 max-w-xl text-sm leading-relaxed ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>{body}</p>}
      {ctaLabel && (
        <div className="mt-5 flex justify-center">
          <CtaButton href={ctaHref || '#'} label={ctaLabel} variant="primary" onInk={ink} withArrow />
        </div>
      )}
    </InfoCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared field atoms for the operator-authored list blocks.
// ─────────────────────────────────────────────────────────────────────────────

const offeringArrayField = {
  type: 'array' as const,
  label: 'Offerings',
  arrayFields: {
    title: { type: 'text' as const, label: 'Title' },
    blurb: { type: 'textarea' as const, label: 'Short blurb' },
  },
  defaultItemProps: { title: '', blurb: '' },
}

const teamArrayField = {
  type: 'array' as const,
  label: 'People',
  arrayFields: {
    name: { type: 'text' as const, label: 'Name' },
    role: { type: 'text' as const, label: 'Role' },
    avatar: imgField,
  },
  defaultItemProps: { name: '', role: '', avatar: '' },
}

// ─────────────────────────────────────────────────────────────────────────────
// ComponentConfig map -- exported as profileComponents
// ─────────────────────────────────────────────────────────────────────────────

export const profileComponents: Record<string, ComponentConfig> = {
  SpaceIdentityHeader: {
    label: 'Identity header (cover + logo)',
    fields: {
      coverOverride: { ...imgField, label: 'Cover override (optional)' },
      logoOverride: { ...imgField, label: 'Logo override (optional)' },
      focal: {
        type: 'select',
        label: 'Cover focal point',
        options: [
          { label: 'Center', value: 'center' },
          { label: 'Top', value: 'top' },
          { label: 'Bottom', value: 'bottom' },
        ],
      },
      height: {
        type: 'select',
        label: 'Cover height',
        options: [
          { label: 'Short', value: 'short' },
          { label: 'Medium', value: 'medium' },
          { label: 'Tall', value: 'tall' },
        ],
      },
      showFollow: {
        type: 'radio',
        label: 'Show follow',
        options: [
          { label: 'Yes', value: 'yes' },
          { label: 'No', value: 'no' },
        ],
      },
    },
    defaultProps: {
      coverOverride: '',
      logoOverride: '',
      focal: 'center',
      height: 'medium',
      showFollow: 'yes',
    },
    render: ({ coverOverride, logoOverride, focal, height, showFollow, puck }) => {
      const identity = identityFrom(puck)
      if (!identity) {
        return <div className="mx-auto w-full max-w-5xl px-6 pt-8"><EditorStub label="Identity header" hint="The space cover, logo, and name show on the live page" /></div>
      }
      return (
        <SpaceIdentityHeaderBlock
          identity={identity}
          coverOverride={(coverOverride as string) || undefined}
          logoOverride={(logoOverride as string) || undefined}
          focal={focal as string}
          height={height as string}
          showFollow={showFollow === 'yes'}
        />
      )
    },
  },

  SpaceAbout: {
    label: 'About card',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      heading: { type: 'text', label: 'Heading' },
      body: { type: 'textarea', label: 'Story' },
      ...blockFields(),
    },
    defaultProps: {
      eyebrow: 'About',
      heading: 'Our story',
      body: 'Tell people who you are and what to expect.',
      ...blockLayoutDefaults,
    },
    render: ({ eyebrow, heading, body, tone, width, align, layout }) => (
      <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
        <SpaceAboutBlock
          eyebrow={(eyebrow as string) || undefined}
          heading={(heading as string) || undefined}
          body={(body as string) || undefined}
          ink={isInk(tone)}
        />
      </Band>
    ),
  },

  SpaceHighlights: {
    label: 'Highlights (live)',
    fields: {
      ...blockFields(),
    },
    defaultProps: {
      ...blockLayoutDefaults,
    },
    render: ({ tone, width, align, layout, puck }) => {
      const highlights = highlightsFrom(puck)
      const content = highlights.length > 0
        ? <SpaceHighlightsBlock highlights={highlights} ink={isInk(tone)} />
        : <EditorStub label="Highlights" hint="Your live counts show on the live page" />
      return (
        <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
          {content}
        </Band>
      )
    },
  },

  SpaceOfferings: {
    label: 'Offerings grid',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      heading: { type: 'text', label: 'Heading' },
      items: offeringArrayField,
      ...blockFields(),
    },
    defaultProps: {
      eyebrow: 'What we offer',
      heading: 'Offerings',
      items: [],
      ...blockLayoutDefaults,
    },
    render: ({ eyebrow, heading, items, tone, width, align, layout }) => (
      <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
        <SpaceOfferingsBlock
          eyebrow={(eyebrow as string) || undefined}
          heading={(heading as string) || undefined}
          items={(items as OfferingItem[]) ?? []}
          ink={isInk(tone)}
        />
      </Band>
    ),
  },

  SpaceContact: {
    label: 'Contact + hours',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      heading: { type: 'text', label: 'Heading' },
      address: { type: 'text', label: 'Address' },
      hours: { type: 'textarea', label: 'Hours' },
      phone: { type: 'text', label: 'Phone' },
      email: { type: 'text', label: 'Email' },
      linkLabel: { type: 'text', label: 'Link label' },
      linkHref: { type: 'text', label: 'Link URL' },
      ...blockFields(),
    },
    defaultProps: {
      eyebrow: 'Find us',
      heading: 'Contact',
      address: '',
      hours: '',
      phone: '',
      email: '',
      linkLabel: '',
      linkHref: '',
      ...blockLayoutDefaults,
    },
    render: ({ eyebrow, heading, address, hours, phone, email, linkLabel, linkHref, tone, width, align, layout }) => (
      <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
        <SpaceContactBlock
          eyebrow={(eyebrow as string) || undefined}
          heading={(heading as string) || undefined}
          address={(address as string) || undefined}
          hours={(hours as string) || undefined}
          phone={(phone as string) || undefined}
          email={(email as string) || undefined}
          linkLabel={(linkLabel as string) || undefined}
          linkHref={(linkHref as string) || undefined}
          ink={isInk(tone)}
        />
      </Band>
    ),
  },

  SpaceTeam: {
    label: 'Team',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      heading: { type: 'text', label: 'Heading' },
      members: teamArrayField,
      ...blockFields(),
    },
    defaultProps: {
      eyebrow: 'The people',
      heading: 'Meet the team',
      members: [],
      ...blockLayoutDefaults,
    },
    render: ({ eyebrow, heading, members, tone, width, align, layout }) => (
      <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
        <SpaceTeamBlock
          eyebrow={(eyebrow as string) || undefined}
          heading={(heading as string) || undefined}
          members={(members as TeamMember[]) ?? []}
          ink={isInk(tone)}
        />
      </Band>
    ),
  },

  SpaceCTA: {
    label: 'Call to action card',
    fields: {
      heading: { type: 'text', label: 'Heading' },
      body: { type: 'textarea', label: 'Body (optional)' },
      ctaLabel: { type: 'text', label: 'Button label' },
      ctaHref: { type: 'text', label: 'Button link' },
      ...blockFields(),
    },
    defaultProps: {
      heading: 'Ready when you are',
      body: '',
      ctaLabel: 'Get started',
      ctaHref: '#',
      ...blockLayoutDefaults,
    },
    render: ({ heading, body, ctaLabel, ctaHref, tone, width, align, layout }) => (
      <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
        <SpaceCTABlock
          heading={(heading as string) || undefined}
          body={(body as string) || undefined}
          ctaLabel={(ctaLabel as string) || undefined}
          ctaHref={(ctaHref as string) || undefined}
          ink={isInk(tone)}
        />
      </Band>
    ),
  },
}
