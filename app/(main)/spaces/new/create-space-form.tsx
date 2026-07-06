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

// The CREATE-A-SPACE form (client). Leads with "what do you run?" (a Mode + Focus choice), then collects
// just name, handle, and visibility, and calls the createSpace server action (which seeds the Mode preset
// and drops the owner straight on their /manage console on success). Brand name is NOT collected here: it
// defaults to the name and is editable later in Basics (ADR-552 Phase 4 slim). The server re-validates
// everything; this form mirrors the checks for fast, inline feedback only.
//
// The "what do you run?" choices come from the parent (the Mode registry, Space Modes M3), so the form
// auto-includes every operating model the registry offers with no hardcoded list here.

/** One "what do you run?" choice the wizard offers: its id, the (type, variant) it maps to, and the
 *  plain headline + tagline (mirrors lib/spaces/modes.ts ModeChoice). */
export interface SpaceModeChoice {
  id: string
  type: string
  variant: string
  label: string
  hint: string
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

export function CreateSpaceForm({ choices }: { choices: SpaceModeChoice[] }) {
  const [choiceId, setChoiceId] = useState(choices[0]?.id ?? '')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [visibility, setVisibility] = useState<'network' | 'private'>('network')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const choice = choices.find((c) => c.id === choiceId) ?? choices[0]

  // Keep the slug in sync with the name until the owner edits the slug by hand.
  function onNameChange(v: string) {
    setName(v)
    if (!slugTouched) setSlug(slugify(v))
  }

  const slugValid = slug === '' || isSafeSlug(slug)
  const canSubmit = !!choice && name.trim().length > 0 && isSafeSlug(slug) && !pending

  function submit() {
    if (!choice) return
    setError(null)
    start(async () => {
      const result = await createSpace({
        type: choice.type,
        modeVariant: choice.variant,
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
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
      {/* What do you run? — the Mode + Focus to provision (drives the console, the starter pipeline, the
          lexicon, and the profile shape). You can switch this later in your console. */}
      <Field
        id="space-mode"
        label="What do you run?"
        hint="This sets up your console and a starter pipeline for how you work. You can switch it later."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {choices.map((c) => {
            const active = choiceId === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setChoiceId(c.id)}
                aria-pressed={active}
                className={cn(
                  'rounded-lg border px-3 py-2 text-left transition-colors',
                  active
                    ? 'border-primary bg-primary-bg text-text'
                    : 'border-border bg-surface text-muted hover:border-border-strong',
                )}
              >
                <span className="block text-sm font-semibold text-text">{c.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{c.hint}</span>
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
