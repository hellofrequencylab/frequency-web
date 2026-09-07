'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { labelClasses } from '@/components/ui/field'
import { HeaderImageField } from '@/components/ui/header-image-field'
import { ImageUpload } from '@/components/ui/image-upload'
import { RailAutosaveForm, useRailSaveNow } from '@/components/admin/rail/rail-autosave-form'
import { RailManifestFields, type RailManifestFieldsProps } from '@/components/admin/rail/rail-manifest-fields'
import type { FieldOptions } from '@/components/studio/spark/field/field-control'
import { PublishCelebration, VeraRankPanel, useJourneyPublishing } from '@/components/journey/v2/journey-settings'
import { getJourneyRailData, type JourneyRailData } from '@/app/(main)/journeys/admin-actions'
import {
  saveJourneyMeta,
  setJourneyAttributes,
  setJourneyDelivery,
  setJourneyHeaderFocus,
  setJourneyMeeting,
  setJourneyRewards,
  listMyJourneyEvents,
} from '@/app/(main)/journeys/actions'
import { isError, type ActionResult } from '@/lib/action-result'
import { readJourneyCoverFocus } from '@/lib/journeys/header'
import type { PlanVisibility } from '@/lib/journey-plans'
import { JOURNEY_MANIFEST } from '@/lib/studio/entities/journey'
import type { FieldDef } from '@/lib/studio/kernel/manifest'
import {
  JOURNEY_RAIL,
  JOURNEY_HEADER_WRITES,
  JOURNEY_IDENTITY_WRITES,
  journeyAttributesPatch,
  journeyDeliveryPatch,
  journeyMeetingPatch,
  journeyMetaPatch,
  journeyRailValues,
  journeyRewards,
  type JourneyRailValues,
} from './journey-rail-plan'

// In-place "Journey settings" module (ADR-515 Phase 6, the 'basics' spine cell). Self-fetches
// getJourneyRailData(slug), which re-resolves journey.editSettings and returns null for anyone else, so
// this renders nothing for a non-owner. Every save action re-checks ownership server-side (the gate
// here is UX).
//
// THE FIELDS COME FROM THE MANIFEST (ADR-1240, ADR-1246). This module declares no field: `JOURNEY_RAIL`
// is JOURNEY_MANIFEST filtered through the kernel's `railForm()` for the columns each save path writes,
// so a label, a kind, or a placement changed on the manifest changes here with no edit to this file.
// The six zones below are the six SAVE PATHS, not six field lists. It used to mount the 700-line
// JourneySettings editor whole; that editor still serves /journeys/[slug]/edit.
//
// HOW A SAVE READS ITS VALUES. The Journey's actions take JSON patches, not FormData, so each form's
// action ignores the FormData snapshot the rail hands it and builds its patch from `values`, the one
// controlled state every control on this rail renders from. The form is still what decides WHEN to
// save (text on blur, a choice instantly), which is the shared rail model (docs/ADMIN-RAIL.md).

/** A failed ActionResult becomes a thrown error, which is what the rail's save cue listens for. */
function unwrap(res: ActionResult<unknown>): void {
  if (isError(res)) throw new Error(res.error)
}

/** Ghost text is the surface's, not the manifest's (see FieldControlProps.placeholder). */
const PLACEHOLDERS: Record<string, string> = {
  category: 'e.g. Rest and recovery',
  daily_minutes: 'Optional',
  enroll_cap: 'No limit',
}
for (const prefix of ['meeting', 'meeting.gathering']) {
  PLACEHOLDERS[`${prefix}.schedule`] = 'e.g. Sundays 7pm'
  PLACEHOLDERS[`${prefix}.timezone`] = 'e.g. ET'
  PLACEHOLDERS[`${prefix}.location`] = 'e.g. The community hall, 14 Main St'
  PLACEHOLDERS[`${prefix}.link`] = 'https://'
  PLACEHOLDERS[`${prefix}.notes`] = 'Any other details people should know before they join'
}

/** Standing guidance under a control. Also the surface's. */
const HINTS: Record<string, string> = {
  enroll_cap: 'A Run of about 8 to 12 keeps real accountability.',
  certificate_enabled: 'A printable certificate when someone finishes.',
  header_overlay_color: 'A hex color. Leave it empty for the overlay style’s own shade.',
}

// The header zone: the two Loom-picked images render through the Journey's own cover controls (the
// Loom is the one image control, ADR-987, and the cover carries a focal point the kit has no kind for);
// the overlay pair renders through the kit. Manifest order puts the cover first, pinned by the test.
const [COVER, LOGO] = JOURNEY_RAIL.header.fields.filter((f) => f.kind === 'image')
const OVERLAY = JOURNEY_RAIL.header.fields.filter((f) => f.kind !== 'image')
const [VISIBILITY] = JOURNEY_RAIL.visibility.fields

/** The meeting zone's fields grouped by manifest section, with that section's own title and hint. */
const MEETING_GROUPS = (() => {
  const keys = [...new Set(JOURNEY_RAIL.meeting.fields.map((f) => f.section))]
  return keys.map((key) => ({
    section: JOURNEY_MANIFEST.sections.find((s) => s.key === key),
    fields: JOURNEY_RAIL.meeting.fields.filter((f) => f.section === key),
  }))
})()

export function JourneySettingsModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/journeys\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<JourneyRailData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getJourneyRailData(slug)
      .then((d) => {
        if (active) {
          setData(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [slug])

  if (!slug) return null
  if (loading) {
    return <div className="h-40 animate-pulse rounded-card border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  return <JourneySettingsRail key={data.planId} data={data} />
}

/**
 * The plan's fields inside one autosave form. A composite control (tags) fires no native change or
 * blur the form could hear, so its change commits through the form's own `saveNow`; a color swatch
 * pick lands as a whole hex at once and commits the same way, while a typed hex waits for its blur.
 */
function ZoneFields(props: RailManifestFieldsProps) {
  const saveNow = useRailSaveNow()
  const { onChange, fields } = props
  return (
    <RailManifestFields
      {...props}
      onChange={(path, next) => {
        onChange(path, next)
        const kind = fields.find((f) => f.path === path)?.kind
        if (kind === 'tags' || (kind === 'color' && /^#[0-9a-f]{6}$/i.test(next))) saveNow()
      }}
    />
  )
}

function JourneySettingsRail({ data }: { data: JourneyRailData }) {
  const router = useRouter()
  const planId = data.planId

  // ONE controlled state for every field on the rail, keyed by manifest path, plus a ref the forms'
  // actions read at save time (a debounced save runs after the render that changed the value).
  const [values, setValues] = useState<JourneyRailValues>(() => journeyRailValues(data.row))
  const valuesRef = useRef(values)
  const update = useCallback((path: string, next: string) => {
    const merged = { ...valuesRef.current, [path]: next }
    valuesRef.current = merged
    setValues(merged)
  }, [])

  const publishing = useJourneyPublishing({
    planId,
    initialVisibility: values[VISIBILITY.path] as PlanVisibility,
    initialStatus: data.status,
    initialReview: data.review,
  })

  // The manifest names the collection (`optionsFrom: 'events'`); the surface loads it.
  const [events, setEvents] = useState<FieldOptions['events']>([])
  useEffect(() => {
    let active = true
    listMyJourneyEvents(planId)
      .then((res) => {
        if (active && !isError(res)) {
          setEvents(
            res.data.events.map((e) => ({
              value: e.id,
              label: e.startsAt ? `${e.title} (${formatEventDate(e.startsAt)})` : e.title,
            })),
          )
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [planId])
  const loaded = useMemo<FieldOptions>(() => ({ events }), [events])

  // The images self-save on pick, as a pick is one whole change. The cover's focal point debounces
  // (400ms) so a drag never fires a save per pixel; it is a property of the cover, not a field.
  const [, start] = useTransition()
  const meta = (patch: Parameters<typeof saveJourneyMeta>[1]) =>
    start(async () => {
      await saveJourneyMeta(planId, patch)
      router.refresh()
    })
  const [focus, setFocus] = useState(() => readJourneyCoverFocus(data.coverFocus))
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onFocusChange = (next: string) => {
    setFocus(next)
    if (focusTimer.current) clearTimeout(focusTimer.current)
    focusTimer.current = setTimeout(() => {
      start(async () => {
        await setJourneyHeaderFocus(planId, next)
      })
    }, 400)
  }

  // The forms' actions: each builds its own action's patch from the rail's values.
  const saveIdentity = async () => unwrap(await saveJourneyMeta(planId, journeyMetaPatch(valuesRef.current, JOURNEY_IDENTITY_WRITES)))
  const saveHeader = async () => unwrap(await saveJourneyMeta(planId, journeyMetaPatch(valuesRef.current, JOURNEY_HEADER_WRITES)))
  const saveDelivery = async () => {
    const v = valuesRef.current
    const [rewards, delivery] = await Promise.all([
      setJourneyRewards(planId, journeyRewards(v)),
      setJourneyDelivery(planId, journeyDeliveryPatch(v)),
    ])
    unwrap(rewards)
    unwrap(delivery)
  }
  const saveAttributes = async () => unwrap(await setJourneyAttributes(planId, journeyAttributesPatch(valuesRef.current)))
  const saveMeeting = async () => unwrap(await setJourneyMeeting(planId, journeyMeetingPatch(valuesRef.current)))

  const zone = (fields: readonly FieldDef[]) => (
    <ZoneFields fields={fields} values={values} onChange={update} placeholders={PLACEHOLDERS} hints={HINTS} loaded={loaded} />
  )

  return (
    <div className="space-y-5">
      <PublishCelebration celebrate={publishing.celebrate} />

      {/* Identity: the inline plane, hosted here until /journeys/[slug] has an inline canvas. */}
      <RailAutosaveForm action={saveIdentity}>{zone(JOURNEY_RAIL.identity.fields)}</RailAutosaveForm>

      {/* Header: the cover (with its focal point) and the logo self-save on pick; the overlay autosaves. */}
      <div className="space-y-4">
        {COVER && (
          <HeaderImageField
            label={COVER.label}
            value={values[COVER.path] || null}
            onChange={(url) => {
              update(COVER.path, url ?? '')
              meta({ coverImage: url })
            }}
            focus={focus}
            onFocusChange={onFocusChange}
            aspect={16 / 6}
            scopeKey="mine"
            hint="Wide banner shown across the top of the Journey and on its cards."
          />
        )}
        {LOGO && (
          <div className="w-[11rem]">
            <ImageUpload
              label={LOGO.label}
              value={values[LOGO.path] || null}
              onChange={(url) => {
                update(LOGO.path, url ?? '')
                meta({ logoImage: url })
              }}
              folder="journey-logos"
              scopeKey="mine"
              kinds={['image', 'icon']}
              noUrlPaste
              hint="The Journey’s leading mark. Opens the Loom to pick an image or icon, or upload your own."
            />
          </div>
        )}
        <RailAutosaveForm action={saveHeader}>{zone(OVERLAY)}</RailAutosaveForm>
      </div>

      {/* Delivery and rewards: one manifest section, two actions one column apart. */}
      <RailAutosaveForm action={saveDelivery}>{zone(JOURNEY_RAIL.delivery.fields)}</RailAutosaveForm>

      {/* Publishing: its own flow (publish, moderation state, Vera's rank gate), shared with the editor. */}
      {VISIBILITY && (
        <div className="space-y-2">
          <RailManifestFields
            fields={JOURNEY_RAIL.visibility.fields}
            values={{ [VISIBILITY.path]: publishing.visibility }}
            onChange={(_, next) => publishing.changeVisibility(next as PlanVisibility)}
          />
          {publishing.visibility === 'public' && publishing.status === 'pending' && (
            <span className="inline-flex items-center rounded-pill bg-warning-bg px-2.5 py-1 text-meta text-warning">In review</span>
          )}
          {publishing.visibility === 'public' && (publishing.review || publishing.reviewing) && (
            <VeraRankPanel review={publishing.review} reviewing={publishing.reviewing} onResubmit={publishing.resubmitForReview} />
          )}
        </div>
      )}

      {/* Discovery. */}
      <RailAutosaveForm action={saveAttributes}>{zone(JOURNEY_RAIL.attributes.fields)}</RailAutosaveForm>

      {/* How the Circle gathers: two touchpoints, one jsonb column, one form. The group headings are
          the manifest's own section titles and descriptions. */}
      <RailAutosaveForm action={saveMeeting} className="space-y-4">
        {MEETING_GROUPS.map(({ section, fields }) => (
          <div key={section?.key ?? fields[0]?.path} className="space-y-3 rounded-card border border-border bg-canvas/40 p-3">
            {section && (
              <div>
                <p className={labelClasses}>{section.title}</p>
                <p className="mt-0.5 text-2xs text-muted">{section.desc}</p>
              </div>
            )}
            {zone(fields)}
          </div>
        ))}
      </RailAutosaveForm>
    </div>
  )
}

/** Short date for an Event option (e.g. "Sun, Jun 22"). UTC, fixed locale: an event's starts_at stores
 *  its own wall-clock in UTC parts (lib/time/zone), the convention every event surface reads it by. */
function formatEventDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}
