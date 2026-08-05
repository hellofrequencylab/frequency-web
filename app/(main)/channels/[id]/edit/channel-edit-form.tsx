'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Users, Circle as CircleIcon, Radio } from 'lucide-react'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { InlineCover } from '@/components/admin/inline/inline-cover'
import { DangerDelete } from '@/components/admin/danger-delete'
import { CHANNEL_CATEGORIES, isChannelCategory } from '@/lib/channels/categories'
import {
  saveChannelEdits,
  deleteChannel,
  setChannelCoverUrl,
  removeChannelCover,
} from '@/app/(main)/channels/admin-actions'

// The Channel EDITOR form (ADR-882) — the full-page counterpart to the settings drawer, built on
// the event editor's shape: every field on one surface, ONE explicit Save, a danger zone at the
// bottom. The drawer stays (autosave, in place, for a quick tweak); this is where a Channel gets
// set up properly, and the two share the same server actions so neither can drift.
//
// Why an explicit Save and not autosave: the URL is edited here. Renaming a Channel MOVES its page,
// so it belongs in a deliberate commit alongside the rest, not in an on-blur write. The action
// returns the resulting slug and this form navigates to it.
//
// The cover is the one exception: it self-saves through its own bound actions, because picking an
// image is already a deliberate act with its own confirm step in the picker.
//
// Members, Circles, and the Program (with its owner Space) are NOT rebuilt here. They live in the
// Channel Manage hub (ADR-870/871) and get link rows out, so this page still reads as the complete
// map of what an operator can do to a Channel without duplicating a single control.

const input = fieldClasses
const fieldLabel = labelClasses

const LINK_ROW =
  'group flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 outline-none transition-colors hover:border-border-strong hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none'

export interface ChannelEditFormProps {
  channel: {
    id: string
    name: string
    slug: string
    description: string | null
    category: string
    cover_image: string | null
    display_order: number
    is_active: boolean
    pillar_id: string | null
  }
  pillars: { id: string; name: string }[]
}

/** One labelled block: label, control, and the plain line explaining what the field does. */
function FieldBlock({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className={fieldLabel}>{label}</span>
      {children}
      {hint && <p className="text-2xs text-muted">{hint}</p>}
    </label>
  )
}

export function ChannelEditForm({ channel, pillars }: ChannelEditFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // An older Channel may carry a category from before the vocabulary closed. Keep it selectable and
  // marked, so saving any other field never silently relabels the Channel.
  const offList = !isChannelCategory(channel.category)
  const manage = `/channels/${channel.slug}/manage`

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setError(null)
    start(async () => {
      const res = await saveChannelEdits(channel.id, channel.slug, fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      // The save may have MOVED the page. Land on the Channel under whatever URL it now has.
      router.push(`/channels/${res.slug}`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Cover — self-saving, above the form, because it is the first thing a visitor sees. */}
      <section className="space-y-1.5 rounded-2xl border border-border bg-surface p-5 lift-1">
        <span className={fieldLabel}>Cover image</span>
        <InlineCover
          value={channel.cover_image ?? null}
          alt={channel.name}
          canEdit
          forceEdit
          setUrl={setChannelCoverUrl.bind(null, channel.id, channel.slug)}
          remove={removeChannelCover.bind(null, channel.id, channel.slug)}
        />
        <p className="text-2xs text-muted">
          The wide image behind the Channel title. It saves on its own. Leave it empty for the
          default gradient.
        </p>
      </section>

      <form onSubmit={onSubmit} className="space-y-6">
        <section className="space-y-4 rounded-2xl border border-border bg-surface p-5 lift-1">
          <h2 className="text-body-sm font-semibold text-text">Basics</h2>

          <FieldBlock label="Name">
            <input name="name" defaultValue={channel.name} required className={input} />
          </FieldBlock>

          <FieldBlock
            label="URL"
            hint="The Channel's web address. Changing it changes the URL, so any link people already shared to the old one stops working."
          >
            <span className="flex items-center rounded-lg border border-border bg-surface px-3 text-body-sm text-subtle focus-within:border-border-strong focus-within:ring-2 focus-within:ring-border-strong/30">
              <span className="shrink-0">/channels/</span>
              <input
                name="slug"
                defaultValue={channel.slug}
                className="min-w-0 flex-1 bg-transparent py-2 text-text outline-none"
              />
            </span>
          </FieldBlock>

          <FieldBlock
            label="Description"
            hint="The line under the title, on the Channel page and its directory card."
          >
            <textarea
              name="description"
              defaultValue={channel.description ?? ''}
              rows={3}
              className={`${input} resize-none`}
            />
          </FieldBlock>
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-surface p-5 lift-1">
          <h2 className="text-body-sm font-semibold text-text">Where it sits</h2>

          <FieldBlock
            label="Category"
            hint="Sets the icon on the Channel page and its directory card."
          >
            <select name="category" defaultValue={channel.category} className={input}>
              {offList && (
                <option value={channel.category}>{channel.category} (not a standard category)</option>
              )}
              {CHANNEL_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </FieldBlock>

          <FieldBlock
            label="Pillar"
            hint="The Pillar this Channel groups under in the directory. It also shows as a chip on the Channel page."
          >
            <select name="pillar_id" defaultValue={channel.pillar_id ?? ''} className={input}>
              <option value="">No Pillar</option>
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </FieldBlock>

          <FieldBlock
            label="Display order"
            hint="Sorts the Channel in the directory. A lower number lists it earlier."
          >
            <input
              name="display_order"
              type="number"
              step={1}
              defaultValue={channel.display_order ?? 0}
              className={input}
            />
          </FieldBlock>

          {/* A select, not a checkbox: the two states read as words, and the consequence sits right
              under them. */}
          <FieldBlock
            label="Visibility"
            hint="Archived: the Channel page is hidden and it leaves the directory. Circles keep everything they have. Set it back to Live to bring it back."
          >
            <select name="is_active" defaultValue={channel.is_active ? 'on' : 'off'} className={input}>
              <option value="on">Live (listed in the Channels directory)</option>
              <option value="off">Archived (hidden)</option>
            </select>
          </FieldBlock>
        </section>

        {error && (
          <p role="alert" className="text-body-sm font-medium text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
          {/* No `type` here: asChild renders the Link, and a `type` attribute on an anchor is
              meaningless. It is outside the form's submit path either way. */}
          <Button asChild variant="secondary">
            <Link href={`/channels/${channel.slug}`}>Cancel</Link>
          </Button>
        </div>
      </form>

      {/* The rest of the Channel lives in the Manage hub. Link out, never rebuild. */}
      <section className="space-y-2 rounded-2xl border border-border bg-surface p-5 lift-1">
        <h2 className="text-body-sm font-semibold text-text">The rest of this Channel</h2>
        <p className="text-2xs text-muted">
          Who is tuned in, which Circles practice here, and the Chapter blueprint are run from the
          Channel console.
        </p>
        <div className="space-y-1.5 pt-1">
          {[
            { href: `${manage}?section=members`, label: 'Members', Icon: Users },
            { href: `${manage}?section=circles`, label: 'Circles', Icon: CircleIcon },
            { href: `${manage}?section=program`, label: 'Program and owner Space', Icon: Radio },
          ].map(({ href, label, Icon }) => (
            <Link key={href} href={href} className={LINK_ROW}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-bg text-primary-strong">
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-text">{label}</span>
              <ArrowRight
                className="h-3.5 w-3.5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary-strong motion-reduce:transition-none"
                aria-hidden
              />
            </Link>
          ))}
        </div>
      </section>

      {/* Danger zone — last, and honest about what survives: the Circles do. */}
      <section className="rounded-2xl border border-danger/30 bg-danger-bg/20 p-5">
        <DangerDelete
          entity="Channel"
          warning="Permanently removes the Channel, everyone tuned in, and its forum room. Circles that practiced here are kept, they just stop belonging to a Channel. To take it out of the directory without losing it, set Visibility to Archived instead."
          onDelete={() => deleteChannel(channel.id, channel.slug)}
          redirectTo="/channels"
          confirmText="DELETE"
          chromeless
        />
      </section>
    </div>
  )
}
