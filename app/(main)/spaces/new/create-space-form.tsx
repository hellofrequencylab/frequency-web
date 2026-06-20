'use client'

import { useState, useTransition } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { isSafeSlug } from '@/lib/theme/validate'
import { cn } from '@/lib/utils'
import { createSpace } from '@/lib/spaces/provision'
import {
  Field,
  TextField,
  VisibilityField,
  FormError,
} from '@/components/spaces/space-form'

// The CREATE-A-SPACE form (client). Collects type, name, slug, brand name, and visibility, then
// calls the createSpace server action (which redirects to the new Space's settings on success). The
// server re-validates everything; this form mirrors the checks for fast, inline feedback only.
//
// Type choices come from the parent (the blueprinted types), so the form auto-includes every wired
// role with no hardcoded type list here.

/** A type the wizard offers: its value, member-facing label, and the blueprint's type label. */
export interface SpaceTypeChoice {
  value: string
  label: string
}

/** Derive a slug suggestion from a name: lowercase, spaces -> hyphens, drop unsafe chars. */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function CreateSpaceForm({ types }: { types: SpaceTypeChoice[] }) {
  const [type, setType] = useState(types[0]?.value ?? '')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [brandName, setBrandName] = useState('')
  const [visibility, setVisibility] = useState<'network' | 'private'>('network')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // Keep the slug in sync with the name until the owner edits the slug by hand.
  function onNameChange(v: string) {
    setName(v)
    if (!slugTouched) setSlug(slugify(v))
  }

  const slugValid = slug === '' || isSafeSlug(slug)
  const canSubmit = !!type && name.trim().length > 0 && isSafeSlug(slug) && !pending

  function submit() {
    setError(null)
    start(async () => {
      const result = await createSpace({
        type,
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        brandName: brandName.trim() || null,
        visibility,
      })
      // createSpace redirects on success, so we only reach here on a returned error.
      if (result && isError(result)) setError(result.error)
    })
  }

  return (
    <form
      className="space-y-6 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSubmit) submit()
      }}
    >
      {/* Type — the role blueprint to provision (drives the profile shape + default skin). */}
      <Field id="space-type" label="Type" hint="What this space is. It sets the profile layout and default look.">
        <div className="grid gap-2 sm:grid-cols-2">
          {types.map((t) => {
            const active = type === t.value
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                aria-pressed={active}
                className={cn(
                  'rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors',
                  active
                    ? 'border-primary bg-primary-bg text-text'
                    : 'border-border bg-surface text-muted hover:border-border-strong',
                )}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </Field>

      <TextField
        id="name"
        label="Name"
        hint="The name people will see across the network."
        value={name}
        onChange={onNameChange}
        placeholder="River Yoga"
        maxLength={200}
        required
      />

      <div>
        <TextField
          id="slug"
          label="Handle"
          hint="Your space lives at /spaces/your-handle. Lowercase letters, numbers, and hyphens."
          value={slug}
          onChange={(v) => {
            setSlugTouched(true)
            setSlug(v.toLowerCase())
          }}
          placeholder="river-yoga"
          maxLength={40}
        />
        {!slugValid && (
          <p className="mt-1 text-xs font-medium text-danger">
            Use lowercase letters, numbers, and hyphens only.
          </p>
        )}
      </div>

      <TextField
        id="brand-name"
        label="Brand name"
        hint="Shown in the space header. Leave blank to use the name above."
        value={brandName}
        onChange={setBrandName}
        placeholder={name || 'River Yoga'}
        maxLength={200}
      />

      <VisibilityField value={visibility} onChange={setVisibility} />

      {error && <FormError message={error} />}

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" disabled={!canSubmit}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Creating…
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" aria-hidden /> Create space
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
