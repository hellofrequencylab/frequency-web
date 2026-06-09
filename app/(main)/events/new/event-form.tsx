'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createEvent } from '@/app/(main)/events/actions'
import { Input, Textarea, Label, fieldClasses } from '@/components/ui/field'

type Group = {
  id: string
  name: string
}

type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly'

const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string; helper: string }[] = [
  { value: 'none',    label: 'One-time',  helper: 'Happens once'                          },
  { value: 'daily',   label: 'Every day', helper: 'Same time each day'                    },
  { value: 'weekly',  label: 'Weekly',    helper: 'Same day & time each week'             },
  { value: 'monthly', label: 'Monthly',   helper: 'Same date each month'                  },
]

// Friendly Title Case labels — what the event *is*, no jargon.
const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'gathering',       label: 'Gathering'        },
  { value: 'ceremony',        label: 'Ceremony'         },
  { value: 'movement',        label: 'Movement'         },
  { value: 'circle_ritual',   label: 'Circle Ritual'    },
  { value: 'learning',        label: 'Learning'         },
  { value: 'social',          label: 'Social'           },
  { value: 'service',         label: 'Service'          },
  { value: 'external_meetup', label: 'External Meetup'  },
  { value: 'retreat',         label: 'Retreat'          },
  { value: 'online',          label: 'Online'           },
]

// Default keeps the pre-P0 model: shared with your circle, nothing broadcast.
const VISIBILITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'circle_only', label: 'My circle'           },
  { value: 'public',      label: 'Anyone'              },
  { value: 'unlisted',    label: 'Anyone with the link' },
  { value: 'private',     label: 'Invite only'         },
]

// Blank = unset. How the gathering tends to land on the nervous system.
const ENERGY_OPTIONS: { value: string; label: string }[] = [
  { value: '',                label: 'Not sure yet'     },
  { value: 'grounding',       label: 'Grounding'        },
  { value: 'high_activation', label: 'High activation'  },
  { value: 'social',          label: 'Social'           },
  { value: 'ceremonial',      label: 'Ceremonial'       },
]

export function EventForm({ groups }: { groups: Group[] }) {
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [scopeId, setScopeId] = useState(groups[0]?.id ?? '')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('none')
  const [recurrenceUntil, setRecurrenceUntil] = useState('')
  const [capacity, setCapacity] = useState('')
  const [visibility, setVisibility] = useState('circle_only')
  const [category, setCategory] = useState('gathering')
  const [energyTag, setEnergyTag] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !scopeId || !startsAt || isPending) return

    const fd = new FormData()
    fd.set('title', title.trim())
    fd.set('description', description.trim())
    fd.set('location', location.trim())
    fd.set('scopeId', scopeId)
    fd.set('scopeType', 'group')
    fd.set('startsAt', startsAt)
    if (endsAt) fd.set('endsAt', endsAt)
    fd.set('recurrenceType', recurrenceType)
    if (recurrenceType !== 'none' && recurrenceUntil) {
      fd.set('recurrenceUntil', recurrenceUntil)
    }
    fd.set('category', category)
    fd.set('visibility', visibility)
    if (capacity.trim()) fd.set('capacity', capacity.trim())
    if (energyTag) fd.set('energyTag', energyTag)

    startTransition(async () => {
      await createEvent(fd)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Title */}
      <div className="space-y-1.5">
        <Label className="text-sm text-text">
          Event title <span className="text-danger">*</span>
        </Label>
        <Input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Wednesday Morning Ride"
          required
          disabled={isPending}
        />
      </div>

      {/* Group */}
      <div className="space-y-1.5">
        <Label className="text-sm text-text">
          Group <span className="text-danger">*</span>
        </Label>
        {groups.length === 0 ? (
          <p className="text-sm text-muted">You must be in a group to create an event.</p>
        ) : (
          <select
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
            required
            disabled={isPending}
            className={fieldClasses}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Category */}
      <div className="space-y-1.5">
        <Label className="text-sm text-text">What kind of gathering is this?</Label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={isPending}
          className={fieldClasses}
        >
          {CATEGORY_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Start */}
      <div className="space-y-1.5">
        <Label className="text-sm text-text">
          Starts at <span className="text-danger">*</span>
        </Label>
        <Input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          required
          disabled={isPending}
        />
      </div>

      {/* End */}
      <div className="space-y-1.5">
        <Label className="text-sm text-text">
          Ends at <span className="text-2xs font-normal text-subtle">(optional)</span>
        </Label>
        <Input
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          disabled={isPending}
        />
      </div>

      {/* Recurrence */}
      <div className="space-y-1.5">
        <Label className="text-sm text-text">Repeats</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {RECURRENCE_OPTIONS.map(({ value, label, helper }) => {
            const active = recurrenceType === value
            return (
              <button
                type="button"
                key={value}
                onClick={() => setRecurrenceType(value)}
                disabled={isPending}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  active
                    ? 'border-primary bg-primary-bg ring-2 ring-primary/30'
                    : 'border-border bg-surface hover:border-border-strong'
                } disabled:opacity-60`}
              >
                <p className={`text-sm font-medium ${active ? 'text-primary-strong' : 'text-text'}`}>
                  {label}
                </p>
                <p className="mt-0.5 text-2xs text-muted">{helper}</p>
              </button>
            )
          })}
        </div>
        {recurrenceType !== 'none' && (
          <div className="mt-3 space-y-1.5">
            <Label className="text-text">
              Ends on <span className="text-subtle">(optional — leave blank for indefinite)</span>
            </Label>
            <Input
              type="date"
              value={recurrenceUntil}
              onChange={(e) => setRecurrenceUntil(e.target.value)}
              disabled={isPending}
            />
            <p className="mt-1.5 text-2xs text-muted">
              The first 60 days of occurrences will be created immediately. A daily job rolls the window forward.
            </p>
          </div>
        )}
      </div>

      {/* Location */}
      <div className="space-y-1.5">
        <Label className="text-sm text-text">
          Location <span className="text-2xs font-normal text-subtle">(optional)</span>
        </Label>
        <Input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Balboa Park, San Diego"
          disabled={isPending}
        />
      </div>

      {/* Capacity */}
      <div className="space-y-1.5">
        <Label className="text-sm text-text">
          Group size <span className="text-2xs font-normal text-subtle">(optional)</span>
        </Label>
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          placeholder="Cap the group size so it stays intimate."
          disabled={isPending}
        />
        <p className="mt-1.5 text-2xs text-muted">Leave blank for unlimited.</p>
      </div>

      {/* Visibility */}
      <div className="space-y-1.5">
        <Label className="text-sm text-text">Who can see this?</Label>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
          disabled={isPending}
          className={fieldClasses}
        >
          {VISIBILITY_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Energy */}
      <div className="space-y-1.5">
        <Label className="text-sm text-text">
          Energy <span className="text-2xs font-normal text-subtle">(optional)</span>
        </Label>
        <select
          value={energyTag}
          onChange={(e) => setEnergyTag(e.target.value)}
          disabled={isPending}
          className={fieldClasses}
        >
          {ENERGY_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-2xs text-muted">
          How the event tends to land on the nervous system — used to suggest the right events to the right people.
        </p>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label className="text-sm text-text">
          Description <span className="text-2xs font-normal text-subtle">(optional)</span>
        </Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Details, what to bring, meetup point…"
          rows={4}
          disabled={isPending}
          className="resize-none leading-relaxed"
        />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={!title.trim() || !scopeId || !startsAt || isPending || groups.length === 0}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? 'Creating…' : 'Create Event'}
        </button>
        <Link
          href="/events"
          className="text-sm text-muted transition-colors hover:text-text"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
