'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Textarea, Input, labelClasses } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { InlineCover } from '@/components/admin/inline/inline-cover'
import { RailAutosaveForm } from '@/components/admin/rail/rail-autosave-form'
import {
  getCircleAdminData,
  updateCircleSettings,
  updateCirclePermalink,
  setCircleChannelAction,
  setCircleAccessAction,
  setCircleCoverUrl,
  removeCircleCover,
  deleteCircle,
} from '@/app/(main)/circles/admin-actions'
import { DangerDelete } from '@/components/admin/danger-delete'
import { CircleHeaderControls } from '@/components/admin/modules/circle-header-controls'
import { readCircleCoverFocus, readCircleHeroHeight } from '@/lib/circles/hero'
import { readCoverScrimSetting } from '@/lib/layout/cover-scrim'
import {
  asCircleAccess,
  CIRCLE_ACCESS_HINT,
  CIRCLE_ACCESS_LABEL,
  CIRCLE_ACCESS_LIMIT_NOTE,
  type CircleAccess,
} from '@/lib/circles/visibility'

// In-place "Circle settings" (EMBEDDED-ADMIN.md / ADR-133), rendered inside the page admin rail on a
// /circles/[slug] page. The rail section header is the single title. The main fields autosave and reflect
// on the page live (RailAutosaveForm); the cover self-saves through InlineCover; the permalink keeps its
// own action because a rename REDIRECTS the page to the new URL (not a silent field save).

type CircleData = NonNullable<Awaited<ReturnType<typeof getCircleAdminData>>>

const fieldLabel = labelClasses

export function CircleSettingsModule() {
  const pathname = usePathname()
  const router = useRouter()
  const slug = pathname.match(/^\/circles\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<CircleData | null>(null)
  const [loading, setLoading] = useState(true)

  const [permalink, setPermalink] = useState('')
  const [permaErr, setPermaErr] = useState<string | null>(null)
  const [permaPending, startPerma] = useTransition()

  const [channelId, setChannelId] = useState('')
  const [channelErr, setChannelErr] = useState<string | null>(null)
  const [channelPending, startChannel] = useTransition()

  const [access, setAccess] = useState<CircleAccess>('open')
  const [accessErr, setAccessErr] = useState<string | null>(null)
  const [accessPending, startAccess] = useTransition()

  useEffect(() => {
    if (!slug) return
    let active = true
    getCircleAdminData(slug).then((d) => {
      if (active) {
        setData(d)
        if (d) {
          setPermalink(d.slug)
          setChannelId(d.topical_channel_id ?? '')
          setAccess(d.access)
        }
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [slug])

  if (!slug) return null
  if (loading) {
    return <div className="h-48 animate-pulse rounded-card border border-border bg-surface-elevated/50" />
  }
  if (!data) return null // not permitted / not found → no chrome

  function handlePermalink() {
    setPermaErr(null)
    startPerma(async () => {
      const res = await updateCirclePermalink(data!.id, data!.slug, permalink)
      if ('error' in res) {
        setPermaErr(res.error)
      } else {
        router.push(`/circles/${res.slug}`)
      }
    })
  }

  /** Declare the circle's Channel (ADR-871). Its own action, not the autosave form:
   *  the save can be REFUSED (a paused Program takes no new Circles), and that
   *  refusal has to land next to the select, with the pick rolled back. */
  function handleChannel(next: string) {
    const prev = channelId
    setChannelId(next)
    setChannelErr(null)
    startChannel(async () => {
      const res = await setCircleChannelAction(data!.id, data!.slug, next || null)
      if ('error' in res) {
        setChannelErr(res.error)
        setChannelId(prev)
      } else {
        router.refresh()
      }
    })
  }

  /** Set who may enter the circle (axis 2, ADR-1015). Its own action for the same reason the
   *  Channel select has one: the save can be REFUSED, so the refusal lands next to the select and
   *  the pick rolls back rather than leaving the control claiming a mode that was never stored. */
  function handleAccess(next: string) {
    const prev = access
    setAccess(asCircleAccess(next))
    setAccessErr(null)
    startAccess(async () => {
      const res = await setCircleAccessAction(data!.id, data!.slug, next)
      if ('error' in res) {
        setAccessErr(res.error)
        setAccess(prev)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* Cover image — self-saves through its own bound actions. */}
      <div className="space-y-1.5">
        <span className={fieldLabel}>Cover image</span>
        <InlineCover
          value={data.image_url ?? null}
          alt={data.name}
          canEdit
          forceEdit
          setUrl={setCircleCoverUrl.bind(null, data.id, data.slug)}
          remove={removeCircleCover.bind(null, data.id, data.slug)}
        />
      </div>

      {/* HEADER controls, mirroring the Event/Channel settings flow (ADR-886): the cover, then how
          it is framed and what sits over it. Only meaningful once there is an image, and the
          component itself hides the focal picker and the overlay buttons when there is not. All
          three read out of the one `theme` bag this module already loads. */}
      <CircleHeaderControls
        circleId={data.id}
        slug={data.slug}
        imageUrl={data.image_url ?? null}
        initialFocus={readCircleCoverFocus(data.theme)}
        initialHeight={readCircleHeroHeight(data.theme)}
        initialScrim={readCoverScrimSetting(data.theme)}
      />

      <RailAutosaveForm action={updateCircleSettings.bind(null, data.id, data.slug)}>
        <label className="block space-y-1.5">
          <span className={fieldLabel}>Name</span>
          <Input name="name" defaultValue={data.name} required />
        </label>

        <label className="block space-y-1.5">
          <span className={fieldLabel}>Description</span>
          <Textarea name="about" defaultValue={data.about ?? ''} rows={3} className="resize-none" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className={fieldLabel}>Type</span>
            <Select
              name="type"
              defaultValue={data.type}
              options={[
                { value: 'in-person', label: 'In-person' },
                { value: 'online', label: 'Online' },
              ]}
            />
          </label>

          <label className="block space-y-1.5">
            <span className={fieldLabel}>Member cap</span>
            <Input name="member_cap" type="number" min={1} max={500} defaultValue={data.member_cap ?? 12} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className={fieldLabel}>Status</span>
            <Select name="status" defaultValue={data.status}>
              <option value="draft">Draft (only you can see it)</option>
              <option value="forming">Forming</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </Select>
          </label>

          {/* Visibility — a select (not a checkbox) so the native autosave form always submits a value,
              which lets a host switch it back to Listed. Unlisted hides the circle from discovery. */}
          <label className="block space-y-1.5">
            <span className={fieldLabel}>Visibility</span>
            <Select
              name="unlisted"
              defaultValue={data.unlisted ? 'on' : 'off'}
              options={[
                { value: 'off', label: 'Listed' },
                { value: 'on', label: 'Unlisted' },
              ]}
            />
          </label>
        </div>
        <p className="text-2xs text-muted">Unlisted keeps this circle off the directory, map, and search. The link still works and members always see it.</p>
      </RailAutosaveForm>

      {/* THE SECOND AXIS (ADR-1015), sitting under the first. Visibility above answers "can they
          find it"; this answers "can they get in", and the two are independent: a listed circle
          with a closed door is a shopfront, an unlisted circle anyone can join is a quiet room.
          Reading them together is what makes that pair legible.

          Its own action, outside the autosave form: the save can be refused (the list below is
          narrowed by the owning Space, and `trg_circles_access_shape` refuses the same two shapes
          on the service role), so the refusal shows here and the pick rolls back. */}
      <div className="space-y-1.5">
        <label htmlFor="circle-access" className={fieldLabel}>
          Who can join
        </label>
        <Select
          id="circle-access"
          value={access}
          onChange={(e) => handleAccess(e.target.value)}
          disabled={accessPending}
          options={data.access_modes.map((mode) => ({ value: mode, label: CIRCLE_ACCESS_LABEL[mode] }))}
        />
        <p className="text-2xs text-muted">{CIRCLE_ACCESS_HINT[access]}</p>
        {data.access_limited && <p className="text-2xs text-muted">{CIRCLE_ACCESS_LIMIT_NOTE}</p>}
        {accessErr && <span className="text-meta font-medium text-danger">{accessErr}</span>}
      </div>

      {/* Channel — its own action: the save can be refused (a paused Program takes no
          new Circles), so the refusal shows here and the pick rolls back. */}
      <div className="space-y-1.5">
        {/* A <label htmlFor>, not the bare <span> this used to be: this select lives outside the
            autosave form in its own block, so nothing was naming it. */}
        <label htmlFor="circle-channel" className={fieldLabel}>
          Channel
        </label>
        <Select
          id="circle-channel"
          value={channelId}
          onChange={(e) => handleChannel(e.target.value)}
          disabled={channelPending}
          emptyLabel="No Channel"
        >
          {data.channel_groups.map((g) => (
            <optgroup key={g.pillar} label={g.pillar}>
              {g.channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.paused ? ' (paused)' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <p className="text-2xs text-muted">
          The Channel this circle practices in. It shows up on that Channel&apos;s page, and its
          posts join that feed.
        </p>
        {channelErr && <span className="text-meta font-medium text-danger">{channelErr}</span>}
      </div>

      {/* Permalink — its own action: a rename redirects the page to the new URL. */}
      <div className="space-y-1.5">
        <span className={fieldLabel}>Permalink</span>
        <div className="flex items-center gap-2">
          <span className="flex flex-1 items-center rounded-control border border-border bg-surface px-3 text-body-sm text-subtle">
            <span className="shrink-0">/circles/</span>
            <Input
              variant="seamless"
              value={permalink}
              onChange={(e) => setPermalink(e.target.value)}
              disabled={permaPending}
              className="min-w-0 flex-1 py-2 text-text"
            />
          </span>
          <button
            type="button"
            onClick={handlePermalink}
            disabled={permaPending || !permalink.trim() || permalink.trim() === data.slug}
            className="inline-flex shrink-0 items-center rounded-control border border-border bg-surface px-3 py-2 text-meta font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-40"
          >
            {permaPending ? 'Saving…' : 'Update'}
          </button>
        </div>
        {permaErr && <span className="text-meta font-medium text-danger">{permaErr}</span>}
      </div>

      <DangerDelete
        entity="circle"
        warning="Members lose access and memberships, invites, tasks, and awards are erased. Posts are unlinked to the public feed."
        onDelete={() => deleteCircle(data!.id, data!.slug)}
        redirectTo="/circles"
      />
    </div>
  )
}
