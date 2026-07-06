'use client'

import { fieldClasses, Label } from '@/components/ui/field'
import type { AudienceFilter } from '@/lib/spaces/audiences'

// A LIGHT audience selector for the automation editors: everyone, a tag, or a saved segment. Distinct
// from the email AudiencePicker (which also manages saving segments + a live count); here we only need
// to CHOOSE an audience for a rule / drip sequence, so it is a single controlled <select>. Selecting a
// segment sets { segmentId }; a tag sets { tag }; "Everyone" clears both. No em/en dashes.

const EVERYONE = '__everyone__'
const SEGMENT_PREFIX = 'seg:'
const TAG_PREFIX = 'tag:'

export function AudienceSelect({
  filter,
  tags,
  segments,
  onChange,
  disabled = false,
  label = 'Audience',
  id,
}: {
  filter: AudienceFilter
  tags: string[]
  segments: { id: string; name: string }[]
  onChange: (filter: AudienceFilter) => void
  disabled?: boolean
  label?: string
  id?: string
}) {
  const value = filter.segmentId
    ? `${SEGMENT_PREFIX}${filter.segmentId}`
    : filter.tag
      ? `${TAG_PREFIX}${filter.tag}`
      : EVERYONE

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={fieldClasses}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value
          if (v.startsWith(SEGMENT_PREFIX)) onChange({ segmentId: v.slice(SEGMENT_PREFIX.length) })
          else if (v.startsWith(TAG_PREFIX)) onChange({ tag: v.slice(TAG_PREFIX.length) })
          else onChange({})
        }}
      >
        <option value={EVERYONE}>Everyone in this space</option>
        {tags.length > 0 && (
          <optgroup label="By tag">
            {tags.map((t) => (
              <option key={t} value={`${TAG_PREFIX}${t}`}>
                {t}
              </option>
            ))}
          </optgroup>
        )}
        {segments.length > 0 && (
          <optgroup label="Saved segments">
            {segments.map((s) => (
              <option key={s.id} value={`${SEGMENT_PREFIX}${s.id}`}>
                {s.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  )
}

/** A short, plain description of an audience filter for a list row (no em/en dashes). */
export function audienceLabel(
  filter: AudienceFilter,
  segments: { id: string; name: string }[],
): string {
  if (filter.segmentId) {
    const seg = segments.find((s) => s.id === filter.segmentId)
    return seg ? `Segment: ${seg.name}` : 'Saved segment'
  }
  if (filter.tag) return `Tagged: ${filter.tag}`
  return 'Everyone'
}
