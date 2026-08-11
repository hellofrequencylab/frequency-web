'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowRight, Users, Circle as CircleIcon, Radio, Pencil } from 'lucide-react'
import { Textarea, Input, labelClasses } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { InlineCover } from '@/components/admin/inline/inline-cover'
import { RailAutosaveForm } from '@/components/admin/rail/rail-autosave-form'
import { CHANNEL_CATEGORIES, isChannelCategory } from '@/lib/channels/categories'
import { ChannelHeaderControls } from '@/components/admin/modules/channel-header-controls'
import { readChannelCoverFocus, readChannelHeroHeight } from '@/lib/channels/hero'
import {
  getChannelAdminData,
  updateChannelSettings,
  updateChannelSlug,
  setChannelCoverUrl,
  removeChannelCover,
} from '@/app/(main)/channels/admin-actions'

// In-place "Channel settings" module (EMBEDDED-ADMIN.md / ADR-133, PX.5). Renders inside the page admin
// dock on /channels/[id] and inside the Channel Manage hub's Settings tab, and renders nothing unless the
// server grants channel.manage (topical channels are platform-curated → staff). The rail section header is
// the single title. Edits autosave and reflect live: text on blur, selects instantly.
//
// ADR-879 made this the COMPLETE operator surface for the Channel itself: cover image, name, description,
// category (a closed vocabulary shared with the icon map), Pillar, display order, the URL, and visibility.
// Three things are deliberately NOT here because the Channel Manage hub (ADR-870/871) already owns them:
// Members, Circles, and the Program (including the owner Space). They get link rows instead, so this panel
// still reads as the full map of what a Janitor can do.
//
// The cover self-saves through its own bound actions; the URL keeps its own action because a rename MOVES
// the page; everything else rides the autosave form.

type ChannelData = NonNullable<Awaited<ReturnType<typeof getChannelAdminData>>>

const fieldLabel = labelClasses

const LINK_ROW =
  'group flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2 outline-none transition-colors hover:border-border-strong hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none'

export function ChannelSettingsModule() {
  const pathname = usePathname()
  const router = useRouter()
  const id = pathname.match(/^\/channels\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<ChannelData | null>(null)
  const [loading, setLoading] = useState(true)

  const [urlSlug, setUrlSlug] = useState('')
  const [slugErr, setSlugErr] = useState<string | null>(null)
  const [slugPending, startSlug] = useTransition()

  useEffect(() => {
    if (!id) return
    let active = true
    getChannelAdminData(id).then((d) => {
      if (active) {
        setData(d)
        if (d) setUrlSlug(d.slug)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [id])

  if (!id) return null
  if (loading) {
    return <div className="h-48 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null // not staff / not found → no chrome

  function handleSlug() {
    setSlugErr(null)
    startSlug(async () => {
      const res = await updateChannelSlug(data!.id, data!.slug, urlSlug)
      if ('error' in res) {
        setSlugErr(res.error)
      } else {
        router.push(`/channels/${res.slug}`)
      }
    })
  }

  // An older channel may hold a category outside the vocabulary (the field used to be free text).
  // Keep it selectable and marked, so saving any other field never silently relabels the Channel.
  const offList = !isChannelCategory(data.category)
  const manage = `/channels/${data.slug}/manage`

  return (
    <div className="space-y-4">
      {/* Cover image — self-saves through its own bound actions. Without one the page hero falls
          back to its token gradient. */}
      <div className="space-y-1.5">
        <span className={fieldLabel}>Cover image</span>
        <InlineCover
          value={data.cover_image ?? null}
          alt={data.name}
          canEdit
          forceEdit
          setUrl={setChannelCoverUrl.bind(null, data.id, data.slug)}
          remove={removeChannelCover.bind(null, data.id, data.slug)}
        />
        <p className="text-2xs text-muted">
          The wide image behind the Channel title. Leave it empty for the default gradient.
        </p>
      </div>

      {/* HEADER controls, mirroring the Event settings flow: the cover, then how it is framed.
          Only meaningful once there is an image, and the component itself hides the focal picker
          when there is not. */}
      <ChannelHeaderControls
        channelId={data.id}
        slug={data.slug}
        imageUrl={data.cover_image ?? null}
        initialFocus={readChannelCoverFocus(data.theme)}
        initialHeight={readChannelHeroHeight(data.theme)}
      />

      <RailAutosaveForm action={updateChannelSettings.bind(null, data.id, data.slug)}>
        <label className="block space-y-1.5">
          <span className={fieldLabel}>Name</span>
          <Input name="name" defaultValue={data.name} required />
        </label>

        <label className="block space-y-1.5">
          <span className={fieldLabel}>Description</span>
          <Textarea name="description" defaultValue={data.description ?? ''} rows={3} className="resize-none" />
        </label>

        {/* Category — a closed list, because the icon on the Channel page and its directory card is
            picked from this exact vocabulary (lib/channels/categories.ts). */}
        <label className="block space-y-1.5">
          <span className={fieldLabel}>Category</span>
          <Select name="category" defaultValue={data.category}>
            {offList && (
              <option value={data.category}>{data.category} (not a standard category)</option>
            )}
            {CHANNEL_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </Select>
          <p className="text-2xs text-muted">Sets the icon on the Channel page and its directory card.</p>
        </label>

        {/* Pillar — the four active Pillars, read from the pillars table. */}
        <label className="block space-y-1.5">
          <span className={fieldLabel}>Pillar</span>
          <Select name="pillar_id" defaultValue={data.pillar_id ?? ''} emptyLabel="No Pillar">
            {data.pillars.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <p className="text-2xs text-muted">
            The Pillar this Channel groups under in the directory. It also shows as a chip on the
            Channel page.
          </p>
        </label>

        <label className="block space-y-1.5">
          <span className={fieldLabel}>Display order</span>
          <Input
            name="display_order"
            type="number"
            step={1}
            defaultValue={data.display_order ?? 0}
          />
          <p className="text-2xs text-muted">
            Sorts the Channel in the directory. A lower number lists it earlier.
          </p>
        </label>

        {/* Visibility — the archive switch, in its own box so the consequence reads before the click.
            A select, not a checkbox: an unchecked checkbox submits nothing, and the action only writes
            fields it was actually given. */}
        <div className="space-y-1.5 rounded-card border border-border bg-surface-elevated/40 p-3">
          {/* A <label htmlFor>, not the bare <span> this used to be: the control sits in a styled
              box rather than inside a wrapping label, so nothing was naming it. */}
          <label htmlFor="channel-is-active" className={fieldLabel}>
            Visibility
          </label>
          <Select
            id="channel-is-active"
            name="is_active"
            defaultValue={data.is_active ? 'on' : 'off'}
            options={[
              { value: 'on', label: 'Live (listed in the Channels directory)' },
              { value: 'off', label: 'Archived (hidden)' },
            ]}
          />
          <p className="text-2xs text-muted">
            Archived: the Channel page is hidden and it leaves the directory. Circles keep everything
            they have. Set it back to Live to bring it back.
          </p>
        </div>
      </RailAutosaveForm>

      {/* URL — its own action: a rename MOVES the page, and a taken URL comes back as a sentence. */}
      <div className="space-y-1.5">
        <span className={fieldLabel}>URL</span>
        <div className="flex items-center gap-2">
          <span className="flex flex-1 items-center rounded-lg border border-border bg-surface px-3 text-body-sm text-subtle">
            <span className="shrink-0">/channels/</span>
            <Input
              variant="seamless"
              value={urlSlug}
              onChange={(e) => setUrlSlug(e.target.value)}
              disabled={slugPending}
              className="min-w-0 flex-1 py-2 text-text"
            />
          </span>
          <button
            type="button"
            onClick={handleSlug}
            disabled={slugPending || !urlSlug.trim() || urlSlug.trim() === data.slug}
            className="inline-flex shrink-0 items-center rounded-lg border border-border bg-surface px-3 py-2 text-meta font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-40"
          >
            {slugPending ? 'Saving…' : 'Update'}
          </button>
        </div>
        <p className="text-2xs text-muted">
          This is the Channel&apos;s web address. Changing it changes the URL, so any link people
          already shared to the old one stops working.
        </p>
        {slugErr && <span className="text-meta font-medium text-danger">{slugErr}</span>}
      </div>

      {/* The rest of the Channel lives in the Manage hub (ADR-870/871) and the full editor
          (ADR-882). Link out, never rebuild. */}
      <div className="space-y-1.5">
        <span className={fieldLabel}>The rest of this Channel</span>
        <div className="space-y-1.5">
          {[
            { href: `/channels/${data.slug}/edit`, label: 'Full editor (URL, archive, delete)', Icon: Pencil },
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
        <p className="text-2xs text-muted">
          The full editor holds every field on one page with a single Save. Who is tuned in, which
          Circles practice here, and the Chapter blueprint are run from the Channel console.
        </p>
      </div>
    </div>
  )
}
