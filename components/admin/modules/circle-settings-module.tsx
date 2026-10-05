'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Input, labelClasses } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { InlineCover } from '@/components/admin/inline/inline-cover'
import { RailAutosaveForm } from '@/components/admin/rail/rail-autosave-form'
import { RailManifestFields } from '@/components/admin/rail/rail-manifest-fields'
import {
  getCircleAdminData,
  updateCircleSettings,
  updateCirclePermalink,
  setCircleChannelsAction,
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
import { CIRCLE_MAX_CHANNELS } from '@/lib/circles/channels'
import { CIRCLE_RAIL, circleRailValues, circleSettingsFormData, type CircleRailValues } from './circle-rail-plan'
import { useEntityRailRead } from './entity-rail-data'

// In-place "Circle settings" (EMBEDDED-ADMIN.md / ADR-133), rendered inside the page admin rail on a
// /circles/[slug] page. The rail section header is the single title. The main fields autosave and reflect
// on the page live (RailAutosaveForm); the cover self-saves through InlineCover; the permalink keeps its
// own action because a rename REDIRECTS the page to the new URL (not a silent field save).
//
// THE FIELDS COME FROM THE MANIFEST (ADR-1240, ADR-1281). This module declares no field: `CIRCLE_RAIL` is
// CIRCLE_MANIFEST filtered through the kernel's `railForm()` for the columns each save path writes, so a
// label, a kind, an option, or a placement changed on the manifest changes here with no edit to this file.
// The five zones below are the five SAVE PATHS, not five field lists.
//
// HOW THE SETTINGS SAVE READS ITS VALUES. The form's action ignores the FormData snapshot the rail hands
// it and builds the action's FormData from `values`, keyed by COLUMN through the plan's map, because the
// manifest paths are camelCase and the action reads snake_case, and because a native checkbox is absent
// from a snapshot when unchecked. The form still decides WHEN (text on blur, a choice instantly).

type CircleData = NonNullable<Awaited<ReturnType<typeof getCircleAdminData>>>

const fieldLabel = labelClasses

/** Standing guidance under a control. The surface's words, not the manifest's. */
const HINTS: Record<string, string> = {
  unlisted: 'Unlisted keeps this circle off the directory, map, and search. The link still works and members always see it.',
}

const [COVER] = CIRCLE_RAIL.cover.fields
const [ACCESS] = CIRCLE_RAIL.access.fields
const [CHANNEL] = CIRCLE_RAIL.channel.fields
const [PERMALINK] = CIRCLE_RAIL.permalink.fields

export function CircleSettingsModule() {
  const pathname = usePathname()
  const router = useRouter()
  const slug = pathname.match(/^\/circles\/([^/]+)/)?.[1] ?? null
  // The first read comes from the rail's one bundled request (ADR-1685); a reload calls the getter.
  const readAdmin = useEntityRailRead('circle', 'admin', getCircleAdminData)

  const [data, setData] = useState<CircleData | null>(null)
  const [loading, setLoading] = useState(true)

  // ONE controlled state for the settings form, keyed by manifest path, plus a ref the form's action
  // reads at save time (a debounced save runs after the render that changed the value).
  const [values, setValues] = useState<CircleRailValues>({})
  const valuesRef = useRef(values)
  const update = useCallback((path: string, next: string) => {
    const merged = { ...valuesRef.current, [path]: next }
    valuesRef.current = merged
    setValues(merged)
  }, [])

  const [permalink, setPermalink] = useState('')
  const [permaErr, setPermaErr] = useState<string | null>(null)
  const [permaPending, startPerma] = useTransition()

  const [channelIds, setChannelIds] = useState<string[]>([])
  const [channelErr, setChannelErr] = useState<string | null>(null)
  const [channelPending, startChannel] = useTransition()

  const [access, setAccess] = useState<CircleAccess>('open')
  const [accessErr, setAccessErr] = useState<string | null>(null)
  const [accessPending, startAccess] = useTransition()

  useEffect(() => {
    if (!slug) return
    let active = true
    readAdmin(slug).then((d) => {
      if (active) {
        setData(d)
        if (d) {
          const initial = circleRailValues(d as unknown as Record<string, unknown>)
          valuesRef.current = initial
          setValues(initial)
          setPermalink(d.slug)
          setChannelIds(d.channel_ids)
          setAccess(d.access)
        }
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [slug, readAdmin])

  if (!slug) return null
  if (loading) {
    return <div className="h-48 animate-pulse rounded-card border border-border bg-surface-elevated/50" />
  }
  if (!data) return null // not permitted / not found → no chrome

  const circleId = data.id
  const circleSlug = data.slug

  // The settings form's action: the plan's FormData from the rail's values, keyed by column.
  const saveSettings = async () => updateCircleSettings(circleId, circleSlug, circleSettingsFormData(valuesRef.current))

  function handlePermalink() {
    setPermaErr(null)
    startPerma(async () => {
      const res = await updateCirclePermalink(circleId, circleSlug, permalink)
      if ('error' in res) {
        setPermaErr(res.error)
      } else {
        router.push(`/circles/${res.slug}`)
      }
    })
  }

  /** Declare the circle's one to three Channels (ADR-871, LIVE-666), primary first. Its own action,
   *  not the autosave form: the save can be REFUSED (a paused Program takes no new Circles, a fourth
   *  Channel has no room), and that refusal has to land next to the picker, with the pick rolled back. */
  function handleChannels(next: string[]) {
    const prev = channelIds
    setChannelIds(next)
    setChannelErr(null)
    startChannel(async () => {
      const res = await setCircleChannelsAction(circleId, circleSlug, next)
      if ('error' in res) {
        setChannelErr(res.error)
        setChannelIds(prev)
      } else {
        router.refresh()
      }
    })
  }
  const channelName = (id: string) => {
    for (const g of data.channel_groups) {
      const hit = g.channels.find((c) => c.id === id)
      if (hit) return hit.paused ? `${hit.name} (paused)` : hit.name
    }
    return 'A Channel no longer listed'
  }

  /** Set who may enter the circle (axis 2, ADR-1015). Its own action for the same reason the
   *  Channel select has one: the save can be REFUSED, so the refusal lands next to the select and
   *  the pick rolls back rather than leaving the control claiming a mode that was never stored. */
  function handleAccess(next: string) {
    const prev = access
    setAccess(asCircleAccess(next))
    setAccessErr(null)
    startAccess(async () => {
      const res = await setCircleAccessAction(circleId, circleSlug, next)
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
      {/* Cover image: self-saves through its own bound actions. The Loom is the one image control
          (ADR-987), so the manifest's `image` field renders through InlineCover rather than the kit. */}
      {COVER && (
        <div className="space-y-1.5">
          <span className={fieldLabel}>{COVER.label}</span>
          <InlineCover
            value={data.image_url ?? null}
            alt={data.name}
            canEdit
            forceEdit
            setUrl={setCircleCoverUrl.bind(null, circleId, circleSlug)}
            remove={removeCircleCover.bind(null, circleId, circleSlug)}
          />
        </div>
      )}

      {/* HEADER controls, mirroring the Event/Channel settings flow (ADR-886): the cover, then how
          it is framed and what sits over it. Only meaningful once there is an image, and the
          component itself hides the focal picker and the overlay buttons when there is not. All
          three read out of the one `theme` bag this module already loads. They are properties of
          the cover control, not fields (ADR-1246). */}
      <CircleHeaderControls
        circleId={circleId}
        slug={circleSlug}
        imageUrl={data.image_url ?? null}
        initialFocus={readCircleCoverFocus(data.theme)}
        initialHeight={readCircleHeroHeight(data.theme)}
        initialScrim={readCoverScrimSetting(data.theme)}
      />

      {/* The settings zone: the plan's fields inside one autosave form. */}
      <RailAutosaveForm action={saveSettings}>
        <RailManifestFields fields={CIRCLE_RAIL.settings.fields} values={values} onChange={update} hints={HINTS} />
      </RailAutosaveForm>

      {/* THE SECOND AXIS (ADR-1015), sitting under the first. Unlisted above answers "can they
          find it"; this answers "can they get in", and the two are independent: a listed circle
          with a closed door is a shopfront, an unlisted circle anyone can join is a quiet room.

          Its own action, outside the autosave form: the save can be refused (the list below is
          narrowed by the owning Space, and `trg_circles_access_shape` refuses the same two shapes
          on the service role), so the refusal shows here and the pick rolls back. The manifest
          declares the closed set; the surface narrows it to what this Space allows. */}
      {ACCESS && (
        <div className="space-y-1.5">
          <label htmlFor="circle-access" className={fieldLabel}>
            {ACCESS.label}
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
      )}

      {/* Channels: its own action, for the same reason. The manifest names the `channels`
          collection and declares a multiselect; the surface loads it grouped by Pillar, which the
          kit has no row for, so the picker stays here under the manifest's label. One to three
          (CIRCLE_MAX_CHANNELS, LIVE-666): the chosen list, the first marked primary, then a select
          that adds one more until the Circle carries three. */}
      {CHANNEL && (
        <div className="space-y-1.5">
          <label htmlFor="circle-channel" className={fieldLabel}>
            {CHANNEL.label}
          </label>
          {channelIds.length > 0 && (
            <ul className="space-y-1">
              {channelIds.map((id, i) => (
                <li
                  key={id}
                  className="flex items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 py-1.5 text-body-sm text-text"
                >
                  <span className="min-w-0 truncate">
                    {channelName(id)}
                    {i === 0 && channelIds.length > 1 ? <span className="ml-1.5 text-2xs text-muted">Primary</span> : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleChannels(channelIds.filter((c) => c !== id))}
                    disabled={channelPending}
                    aria-label={`Take ${channelName(id)} off this circle`}
                    className="shrink-0 text-meta font-semibold text-muted transition-colors hover:text-text disabled:opacity-40"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {channelIds.length < CIRCLE_MAX_CHANNELS && (
            <Select
              id="circle-channel"
              value=""
              onChange={(e) => {
                if (e.target.value) handleChannels([...channelIds, e.target.value])
              }}
              disabled={channelPending}
              emptyLabel={channelIds.length === 0 ? 'No Channel' : 'Add another Channel'}
            >
              {data.channel_groups
                .map((g) => ({ ...g, channels: g.channels.filter((c) => !channelIds.includes(c.id)) }))
                .filter((g) => g.channels.length > 0)
                .map((g) => (
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
          )}
          <p className="text-2xs text-muted">
            Up to three Channels this circle practices in. It shows up on each Channel&apos;s page. Its
            posts join the first one&apos;s feed.
          </p>
          {channelErr && <span className="text-meta font-medium text-danger">{channelErr}</span>}
        </div>
      )}

      {/* Permalink: its own action, a rename redirects the page to the new URL. */}
      {PERMALINK && (
        <div className="space-y-1.5">
          <span className={fieldLabel}>{PERMALINK.label}</span>
          <div className="flex items-center gap-2">
            <span className="flex flex-1 items-center rounded-control border border-border bg-surface px-3 text-body-sm text-subtle">
              <span className="shrink-0">/circles/</span>
              <Input
                variant="seamless"
                aria-label={PERMALINK.label}
                value={permalink}
                onChange={(e) => setPermalink(e.target.value)}
                disabled={permaPending}
                className="min-w-0 flex-1 py-2 text-text"
              />
            </span>
            <button
              type="button"
              onClick={handlePermalink}
              disabled={permaPending || !permalink.trim() || permalink.trim() === circleSlug}
              className="inline-flex shrink-0 items-center rounded-control border border-border bg-surface px-3 py-2 text-meta font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-40"
            >
              {permaPending ? 'Saving…' : 'Update'}
            </button>
          </div>
          {permaErr && <span className="text-meta font-medium text-danger">{permaErr}</span>}
        </div>
      )}

      {data.can_delete && (
        <DangerDelete
          entity="circle"
          warning="Members lose access and memberships, invites, tasks, and awards are erased. Posts are unlinked to the public feed."
          onDelete={() => deleteCircle(circleId, circleSlug)}
          redirectTo="/circles"
        />
      )}
    </div>
  )
}
