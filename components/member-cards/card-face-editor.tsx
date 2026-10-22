'use client'

import { useId, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeftRight, Contact, ExternalLink, Globe, Link2, Mail, MousePointerClick, Pause, Phone, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Field, Input, labelClasses } from '@/components/ui/field'
import { StatCard } from '@/components/ui/stat-card'
import { Switch } from '@/components/ui/switch'
import { CardPreview } from './card-preview'
import { CARD_LIMITS, CARD_MODES, normalizeCardLink, type CardFace, type CardMode } from '@/lib/member-cards/face'
import { saveMyCardFace, saveSpaceCardFace } from '@/lib/member-cards/actions'
import type { CardStats } from '@/lib/member-cards/store'

// THE CARD FACE EDITOR (LIVE-1282, ADR-1874, docs/LOYALTY.md "Member cards"). One editor for both
// owners of a face: a member on /crew/card, and a Space in its Check-in workspace's Member cards
// section. Left column: the card itself (./card-preview.tsx), the owner's three numbers and the Pause
// switch. Right column: "When someone taps my card", the three CARD_MODES as big choices, the link
// field (link only), the field switches (card only), a Space's cardholder perk, and a live "What they
// see" preview that follows the choice. Saving runs the pure normalizer on the server
// (lib/member-cards/actions.ts), whose error line prints here as is.
//
// Tokens and the shared primitives only (Switch, Field, StatCard, Button, Avatar), so both designs
// paint it. Copy obeys CONTENT-VOICE (plain, no em dashes) and NAMING (Space, Crew, Zaps).

type Owner = { kind: 'member'; handle: string } | { kind: 'space'; spaceId: string; slug: string }

/** What the Save contact card shows, so the "card" preview reads like the real thing. */
export interface CardContactPreview {
  title: string | null
  phone: string | null
  email: string | null
  website: string | null
}

const MODE_ICON: Record<CardMode, LucideIcon> = { page: UserRound, card: Contact, link: Link2 }

// A Space's face reads in its own voice: "our page", not "my page".
const SPACE_MODE_COPY: Record<CardMode, { label: string; hint: string }> = {
  page: { label: 'Open our page', hint: 'Your Space page. This is where a new card goes.' },
  card: { label: 'Show our card', hint: 'Logo, links and Save contact.' },
  link: { label: 'Open our link', hint: 'Your site, your event, your offer.' },
}

export function CardFaceEditor({
  owner,
  name,
  avatarUrl,
  stageLabel = null,
  cardNumber,
  initialFace,
  stats,
  contact,
  readOnly = false,
}: {
  owner: Owner
  /** The name on the card: the member's display name, or the Space's brand name. */
  name: string
  avatarUrl: string | null
  /** The member's stage ("Regular"). Null for a Space. */
  stageLabel?: string | null
  /** The number of the card the preview draws (the member's newest), or null before one is written. */
  cardNumber: number | null
  initialFace: CardFace
  stats: CardStats
  contact?: CardContactPreview
  /** A staff previewer sees the editor but cannot save. */
  readOnly?: boolean
}) {
  const router = useRouter()
  const ids = useId()
  const [face, setFace] = useState<CardFace>(initialFace)
  const [pending, start] = useTransition()
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const isSpace = owner.kind === 'space'
  const modes = CARD_MODES.map((m) => (isSpace ? { ...m, ...SPACE_MODE_COPY[m.key] } : m))

  function set<K extends keyof CardFace>(key: K, value: CardFace[K]) {
    setFace((f) => ({ ...f, [key]: value }))
    setStatus(null)
  }

  function save() {
    start(async () => {
      const r = owner.kind === 'member' ? await saveMyCardFace(face) : await saveSpaceCardFace(owner.spaceId, face)
      if ('error' in r) {
        setStatus({ tone: 'error', text: r.error })
        return
      }
      setFace(r.data)
      setStatus({ tone: 'ok', text: 'Saved' })
      router.refresh()
    })
  }

  const linkTyped = (face.linkUrl ?? '').trim()
  const linkError = linkTyped && !normalizeCardLink(linkTyped) ? 'Use a full https:// address.' : undefined
  const perkLength = (face.cardholderPerk ?? '').length

  return (
    <fieldset disabled={readOnly} className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <legend className="sr-only">{isSpace ? 'Your Space card' : 'Your member card'}</legend>

      {/* LEFT: the card, its numbers, the Pause switch. */}
      <div className="space-y-4">
        <CardPreview name={name} cardNumber={cardNumber} stageLabel={stageLabel} paused={face.paused} />

        <div className="grid grid-cols-3 gap-2">
          <StatCard bordered size="xs" label="Taps" value={stats.taps} icon={MousePointerClick} />
          <StatCard bordered size="xs" label={isSpace ? 'Saved us' : 'Saved you'} value={stats.saves} icon={Contact} />
          <StatCard bordered size="xs" label="Swapped" value={stats.swaps} icon={ArrowLeftRight} />
        </div>
        {!isSpace && <p className="text-meta text-muted">Every tap of your card earns you Zaps.</p>}

        <SwitchRow
          id={`${ids}-pause`}
          icon={Pause}
          label="Pause card"
          hint={isSpace ? 'A tap shows a short note and nothing else.' : 'Lost it? Pause it and a tap shows a short note and nothing else.'}
          checked={face.paused}
          onChange={(v) => set('paused', v)}
          disabled={readOnly}
        />
      </div>

      {/* RIGHT: what a tap opens. */}
      <div className="space-y-5">
        <div>
          <h3 id={`${ids}-modes`} className="text-body font-bold text-text">
            {isSpace ? 'When someone taps our card' : 'When someone taps my card'}
          </h3>
          <div role="radiogroup" aria-labelledby={`${ids}-modes`} className="mt-3 grid gap-2 sm:grid-cols-3">
            {modes.map((m) => {
              const Icon = MODE_ICON[m.key]
              const on = face.mode === m.key
              return (
                <button
                  key={m.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set('mode', m.key)}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-card border p-3 text-left press transition-[background-color,border-color,transform] motion-reduce:transition-none',
                    on
                      ? 'border-primary bg-primary-bg text-primary-strong'
                      : 'border-border bg-surface text-text hover:border-border-strong hover:bg-surface-elevated',
                  )}
                >
                  <Icon aria-hidden className="h-5 w-5" />
                  <span className="text-body-sm font-bold">{m.label}</span>
                  <span className={cn('text-meta', on ? 'text-primary-strong' : 'text-muted')}>{m.hint}</span>
                </button>
              )
            })}
          </div>
        </div>

        {face.mode === 'link' && (
          <Field label="The link it opens" hint="A full https:// address. A bare domain works too." error={linkError}>
            <Input
              type="url"
              inputMode="url"
              placeholder="https://"
              maxLength={CARD_LIMITS.linkMax}
              value={face.linkUrl ?? ''}
              aria-invalid={linkError ? true : undefined}
              onChange={(e) => set('linkUrl', e.target.value || null)}
            />
          </Field>
        )}

        {face.mode === 'card' && (
          <div role="group" aria-labelledby={`${ids}-fields`} className="space-y-2">
            <p id={`${ids}-fields`} className={labelClasses}>
              On the card
            </p>
            <SwitchRow id={`${ids}-phone`} icon={Phone} label="Phone" checked={face.showPhone} onChange={(v) => set('showPhone', v)} disabled={readOnly} />
            <SwitchRow id={`${ids}-email`} icon={Mail} label="Email" checked={face.showEmail} onChange={(v) => set('showEmail', v)} disabled={readOnly} />
            <SwitchRow id={`${ids}-links`} icon={Globe} label="Links" checked={face.showLinks} onChange={(v) => set('showLinks', v)} disabled={readOnly} />
            <SwitchRow
              id={`${ids}-swap`}
              icon={ArrowLeftRight}
              label="Ask them for theirs (Swap contacts)"
              checked={face.swapBack}
              onChange={(v) => set('swapBack', v)}
              disabled={readOnly}
            />
            {!isSpace && (
              <p className="text-meta text-muted">
                Your phone, email and title come from Save contact on{' '}
                <Link href="/codes" className="font-medium text-primary-strong underline-offset-2 hover:underline">
                  Your codes
                </Link>
                .
              </p>
            )}
          </div>
        )}

        {isSpace && (
          <Field
            label="Cardholder perk"
            hint={`One line cardholders see on your Space page. ${perkLength}/${CARD_LIMITS.perkMax}`}
          >
            <Input
              maxLength={CARD_LIMITS.perkMax}
              placeholder="10% off for cardholders"
              value={face.cardholderPerk ?? ''}
              onChange={(e) => set('cardholderPerk', e.target.value || null)}
            />
          </Field>
        )}

        <div>
          <p className={labelClasses}>What they see</p>
          <TapPreview owner={owner} name={name} avatarUrl={avatarUrl} face={face} contact={contact} />
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={save} loading={pending}>
              Save card
            </Button>
            <span
              aria-live="polite"
              className={cn('text-body-sm', status?.tone === 'error' ? 'font-medium text-danger' : 'text-success')}
            >
              {status?.text}
            </span>
          </div>
        )}
      </div>
    </fieldset>
  )
}

function SwitchRow({
  id,
  icon: Icon,
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  id: string
  icon: LucideIcon
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-2.5">
      <Icon aria-hidden className="h-4 w-4 shrink-0 text-muted" />
      <div className="min-w-0 grow">
        <p id={`${id}-label`} className="text-body-sm font-medium text-text">
          {label}
        </p>
        {hint && <p className="text-meta text-muted">{hint}</p>}
      </div>
      <Switch aria-labelledby={`${id}-label`} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  )
}

/** The phone screen a tap opens, following the chosen face. */
function TapPreview({
  owner,
  name,
  avatarUrl,
  face,
  contact,
}: {
  owner: Owner
  name: string
  avatarUrl: string | null
  face: CardFace
  contact?: CardContactPreview
}) {
  const isSpace = owner.kind === 'space'
  const frame = 'mt-2 rounded-card border border-border bg-surface-elevated/60 p-4'

  if (face.paused) {
    return (
      <div className={frame}>
        <p className="text-body-sm font-bold text-text">This card is paused.</p>
        <p className="mt-1 text-meta text-muted">A tap shows this note and nothing else. Switch Pause off to bring it back.</p>
      </div>
    )
  }

  if (face.mode === 'link') {
    const url = normalizeCardLink(face.linkUrl)
    return (
      <div className={frame}>
        {url ? (
          <p className="flex items-center gap-2 text-body-sm text-text">
            <ExternalLink aria-hidden className="h-4 w-4 shrink-0 text-muted" />
            <span className="min-w-0">
              Their phone opens <span className="break-all font-medium">{new URL(url).host}</span>
            </span>
          </p>
        ) : (
          <p className="text-body-sm text-muted">Add the link above and this shows where a tap goes.</p>
        )}
      </div>
    )
  }

  if (face.mode === 'card') {
    const rows: { icon: LucideIcon; text: string }[] = []
    if (face.showPhone) rows.push({ icon: Phone, text: contact?.phone ?? 'Your phone' })
    if (face.showEmail) rows.push({ icon: Mail, text: contact?.email ?? 'Your email' })
    if (face.showLinks) rows.push({ icon: Globe, text: contact?.website ?? (isSpace ? 'Your Space links' : 'Your links') })
    return (
      <div className={cn(frame, 'text-center')}>
        <div className="flex justify-center">
          <Avatar src={avatarUrl} name={name} size="lg" />
        </div>
        <p className="mt-2 text-body font-bold text-text">{name}</p>
        {contact?.title && <p className="text-meta text-muted">{contact.title}</p>}
        {rows.length > 0 && (
          <ul className="mx-auto mt-3 max-w-xs space-y-1.5 text-left">
            {rows.map((r) => (
              <li key={r.text} className="flex items-center gap-2 text-body-sm text-text">
                <r.icon aria-hidden className="h-4 w-4 shrink-0 text-muted" />
                <span className="truncate">{r.text}</span>
              </li>
            ))}
          </ul>
        )}
        {isSpace && face.cardholderPerk && <p className="mt-3 text-meta font-medium text-primary-strong">{face.cardholderPerk}</p>}
        <div className="mt-4 flex flex-wrap justify-center gap-2" aria-hidden>
          <span className="rounded-pill bg-primary px-3 py-1.5 text-meta font-semibold text-on-primary">Save contact</span>
          {face.swapBack && (
            <span className="rounded-pill border border-border bg-surface px-3 py-1.5 text-meta font-semibold text-text">Swap contacts</span>
          )}
        </div>
      </div>
    )
  }

  const path = owner.kind === 'member' ? `/people/${owner.handle}` : `/spaces/${owner.slug}`
  return (
    <div className={cn(frame, 'flex items-center gap-3')}>
      <Avatar src={avatarUrl} name={name} size="md" />
      <div className="min-w-0">
        <p className="truncate text-body-sm font-bold text-text">{name}</p>
        <p className="truncate text-meta text-muted">
          {isSpace ? 'Your Space page' : 'Your Frequency page'} · {path}
        </p>
        {isSpace && face.cardholderPerk && <p className="mt-1 text-meta font-medium text-primary-strong">{face.cardholderPerk}</p>}
      </div>
    </div>
  )
}
