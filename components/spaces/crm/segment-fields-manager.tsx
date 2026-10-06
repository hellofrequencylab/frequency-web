'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { isError } from '@/lib/action-result'
import { addSpaceCustomField, setSegmentFieldKeys } from '@/lib/crm/segment-fields-actions'

// FIELDS BY SEGMENT (LIVE-662). A segment carries a field template: tick the custom fields its people
// should have, and every contact in that segment shows those fields on their card, ready to fill in.
// Fields come from imports, or are added here. Copy per CONTENT-VOICE: plain, concrete, no em dashes.

const TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'url', label: 'Link' },
  { value: 'boolean', label: 'Yes or no' },
  { value: 'select', label: 'Choice' },
]

interface FieldOption {
  key: string
  label: string
}
interface SegmentTemplate {
  id: string
  name: string
  fieldKeys: string[]
}

export function SegmentFieldsManager({
  spaceId,
  slug,
  fields,
  segments,
}: {
  spaceId: string
  slug: string
  fields: FieldOption[]
  segments: SegmentTemplate[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [type, setType] = useState('text')
  const [choices, setChoices] = useState('')

  function toggle(seg: SegmentTemplate, key: string) {
    const next = seg.fieldKeys.includes(key) ? seg.fieldKeys.filter((k) => k !== key) : [...seg.fieldKeys, key]
    setError(null)
    start(async () => {
      const r = await setSegmentFieldKeys(spaceId, slug, seg.id, next)
      if (isError(r)) setError(r.error)
      else router.refresh()
    })
  }

  function addField() {
    if (!label.trim()) return
    setError(null)
    const options = type === 'select' ? choices.split(',').map((c) => c.trim()).filter(Boolean) : undefined
    start(async () => {
      const r = await addSpaceCustomField(spaceId, slug, label, type, options)
      if (isError(r)) {
        setError(r.error)
        return
      }
      setLabel('')
      setChoices('')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {segments.length === 0 ? (
        <p className="text-body-sm text-muted">
          Save a segment from the Email audience picker first. Then pick the fields its people should carry here.
        </p>
      ) : fields.length === 0 ? (
        <p className="text-body-sm text-muted">No custom fields yet. Add one below, or import a file with extra columns.</p>
      ) : (
        <ul className="space-y-3">
          {segments.map((seg) => (
            <li key={seg.id} className="rounded-card border border-border bg-surface p-4 lift-1">
              <p className="text-body-sm font-semibold text-text">{seg.name}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {fields.map((f) => {
                  const on = seg.fieldKeys.includes(f.key)
                  return (
                    <button
                      key={f.key}
                      type="button"
                      aria-pressed={on}
                      disabled={pending}
                      onClick={() => toggle(seg, f.key)}
                      className={
                        on
                          ? 'tap-target rounded-pill border border-primary bg-primary-bg px-3 py-1 text-meta font-semibold text-primary-strong'
                          : 'tap-target rounded-pill border border-border bg-surface px-3 py-1 text-meta text-muted hover:text-text'
                      }
                    >
                      {f.label}
                    </button>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 rounded-card border border-border bg-surface-elevated/50 p-4 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-meta font-medium text-muted">
          New field
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Shirt size" maxLength={60} />
        </label>
        <label className="flex flex-col gap-1 text-meta font-medium text-muted">
          Type
          <Select value={type} onChange={(e) => setType(e.target.value)} options={TYPE_OPTIONS} />
        </label>
        {type === 'select' && (
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-meta font-medium text-muted">
            Choices, separated by commas
            <Input value={choices} onChange={(e) => setChoices(e.target.value)} placeholder="S, M, L" />
          </label>
        )}
        <Button onClick={addField} disabled={pending || !label.trim()}>
          <Plus className="h-4 w-4" aria-hidden /> Add field
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
