'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { isError } from '@/lib/action-result'
import { formatCustomFieldValue } from '@/lib/crm/import/custom-fields'
import type { ValueType } from '@/lib/crm/import/types'
import { saveContactCustomFields } from '@/lib/crm/segment-fields-actions'

// A contact's custom fields, editable in place (LIVE-662). The fields a segment template asks for show
// even when empty, so filling them in is one Edit away; imported values that no template names stay
// editable too. The action re-gates the Space editor and normalizes each value by its type.

interface Field {
  key: string
  label: string
  value: string
  valueType: ValueType
  options?: string[]
  segments: string[]
}

const INPUT_TYPE: Partial<Record<ValueType, string>> = { date: 'date', number: 'number', email: 'email', phone: 'tel', url: 'url' }

export function ContactCustomFieldsEditor({
  spaceId,
  slug,
  contactId,
  fields,
}: {
  spaceId: string
  slug: string
  contactId: string
  fields: Field[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.value])))
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (fields.length === 0) return null

  function save() {
    setError(null)
    start(async () => {
      const r = await saveContactCustomFields(spaceId, slug, contactId, draft)
      if (isError(r)) {
        setError(r.error)
        return
      }
      setEditing(false)
      router.refresh()
    })
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="eyebrow text-subtle">Custom fields</p>
        {!editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
          </Button>
        )}
      </div>
      <dl className="grid gap-x-6 gap-y-3 @md:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className="min-w-0">
            <dt className="text-meta font-medium text-muted">
              {f.label}
              {f.segments.length > 0 && <span className="text-subtle"> · {f.segments.join(', ')}</span>}
            </dt>
            <dd className="text-body-sm text-text">
              {editing ? (
                <FieldInput field={f} value={draft[f.key] ?? ''} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
              ) : (
                <span className="block truncate">{formatCustomFieldValue(f.value, f.valueType).display || <span className="text-subtle">Not set</span>}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save fields'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setDraft(Object.fromEntries(fields.map((f) => [f.key, f.value])))
              setEditing(false)
              setError(null)
            }}
          >
            Cancel
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-body-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

function FieldInput({ field, value, onChange }: { field: Field; value: string; onChange: (v: string) => void }) {
  if (field.valueType === 'boolean') {
    return (
      <Select
        aria-label={field.label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        emptyLabel="Not set"
        options={[
          { value: 'true', label: 'Yes' },
          { value: 'false', label: 'No' },
        ]}
      />
    )
  }
  if (field.valueType === 'select' && field.options?.length) {
    return (
      <Select aria-label={field.label} value={value} onChange={(e) => onChange(e.target.value)} emptyLabel="Not set" options={field.options} />
    )
  }
  return (
    <Input
      aria-label={field.label}
      type={INPUT_TYPE[field.valueType] ?? 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={500}
    />
  )
}
