'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError, type ActionResult } from '@/lib/action-result'
import {
  TextField,
  TextareaField,
  AccentPicker,
  VisibilityField,
  FormError,
} from '@/components/spaces/space-form'
import { updateSpaceProfile } from '@/lib/spaces/profile-settings'
import { draftSpaceBioAction, suggestTaglineAction } from '@/app/(main)/spaces/copilot-actions'

// A light client-side hint for the logo URL (https link or a same-origin path). The server
// (updateSpaceProfile) is authoritative; this just flags an obviously-wrong value inline.
function isSafeLogoHint(url: string): boolean {
  if (url.startsWith('/') && !url.startsWith('//')) return true
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

// The OWNER SETTINGS form (client). Edits the Space profile fields and persists them through the
// canEditProfile-gated updateSpaceProfile action. Two Vera draft affordances are wired in:
//   • "Draft with Vera" beside About  -> draftSpaceBioAction(spaceId)
//   • "Suggest with Vera" beside Tagline -> suggestTaglineAction(spaceId)
// Each returns the repo ActionResult<string>; on ok the returned draft FILLS the field for the
// owner to edit before saving (we never auto-save a draft). Both actions re-check authorization
// server-side, so the buttons are convenience, not the gate.

export interface SpaceSettingsValues {
  brandName: string
  brandAccent: string
  brandLogoUrl: string
  about: string
  tagline: string
  visibility: 'network' | 'private'
}

export function SpaceSettingsForm({
  spaceId,
  slug,
  initial,
  readOnly = false,
}: {
  spaceId: string
  slug: string
  initial: SpaceSettingsValues
  /** Read-only mode for a STAFF PREVIEW (a janitor viewing a Space they don't manage). The whole
   *  form is rendered inside a disabled fieldset and the submit is a no-op, so nothing can be edited
   *  or saved here. The write action (updateSpaceProfile) ALSO re-checks canEditProfile server-side,
   *  so this is a UI convenience over an unchanged server gate, never the gate itself. */
  readOnly?: boolean
}) {
  const router = useRouter()
  const [brandName, setBrandName] = useState(initial.brandName)
  const [brandAccent, setBrandAccent] = useState(initial.brandAccent)
  const [brandLogoUrl, setBrandLogoUrl] = useState(initial.brandLogoUrl)
  const [about, setAbout] = useState(initial.about)
  const [tagline, setTagline] = useState(initial.tagline)
  const [visibility, setVisibility] = useState<'network' | 'private'>(initial.visibility)

  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startSave] = useTransition()

  // Vera draft state, per field (so each button shows its own spinner + error).
  const [bioBusy, startBio] = useTransition()
  const [taglineBusy, startTagline] = useTransition()
  const [veraError, setVeraError] = useState<string | null>(null)

  const logoValid = brandLogoUrl.trim() === '' || isSafeLogoHint(brandLogoUrl.trim())

  function runDraft(
    action: () => Promise<ActionResult<string>>,
    apply: (text: string) => void,
    start: (cb: () => void) => void,
  ) {
    setVeraError(null)
    start(async () => {
      const result = await action()
      if (isError(result)) {
        setVeraError(result.error)
        return
      }
      apply(result.data)
    })
  }

  function save() {
    setError(null)
    setSaved(false)
    startSave(async () => {
      const result = await updateSpaceProfile(spaceId, {
        brandName: brandName.trim() || null,
        brandAccent: brandAccent || null,
        brandLogoUrl: brandLogoUrl.trim() || null,
        about: about.trim() || null,
        tagline: tagline.trim() || null,
        visibility,
      })
      if (isError(result)) {
        setError(result.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  const veraButton = (
    onClick: () => void,
    busy: boolean,
    label: string,
  ) => (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || bioBusy || taglineBusy}
      className="inline-flex items-center gap-1 text-xs font-semibold text-primary-strong transition-colors hover:text-primary disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
      {label}
    </button>
  )

  return (
    <form
      className="space-y-6 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (!pending && !readOnly) save()
      }}
    >
      {/* A disabled fieldset natively disables every nested control (the inputs, the accent +
          visibility buttons, and the Vera affordances), so a STAFF PREVIEW reads the form but can
          edit nothing. Save lives outside it and is gated on `readOnly` directly. `display: contents`
          keeps the fieldset out of the layout box model. */}
      <fieldset disabled={readOnly} className="contents">
      <TextField
        id="brand-name"
        label="Brand name"
        hint="Shown in your space header."
        value={brandName}
        onChange={setBrandName}
        placeholder="River Yoga"
        maxLength={200}
      />

      <AccentPicker value={brandAccent} onChange={setBrandAccent} />

      <div>
        <TextField
          id="brand-logo"
          label="Logo URL"
          hint="An https link or a same-origin path (starting with /)."
          value={brandLogoUrl}
          onChange={setBrandLogoUrl}
          placeholder="https://… or /path/to/logo.svg"
          maxLength={1000}
        />
        {!logoValid && (
          <p className="mt-1 text-xs font-medium text-danger">
            Use an https link or a same-origin path.
          </p>
        )}
      </div>

      <TextareaField
        id="tagline"
        label="Tagline"
        hint="One plain line that says what you do."
        value={tagline}
        onChange={setTagline}
        placeholder="Slow, breath-led yoga by the river."
        rows={2}
        maxLength={200}
        action={veraButton(
          () => runDraft(() => suggestTaglineAction(spaceId), setTagline, startTagline),
          taglineBusy,
          'Suggest with Vera',
        )}
      />

      <TextareaField
        id="about"
        label="About"
        hint="A short bio for your profile. A few sentences is plenty."
        value={about}
        onChange={setAbout}
        placeholder="Tell people who you are and what they can expect."
        rows={6}
        maxLength={4000}
        action={veraButton(
          () => runDraft(() => draftSpaceBioAction(spaceId), setAbout, startBio),
          bioBusy,
          'Draft with Vera',
        )}
      />

      <p className="text-xs text-subtle">
        Vera is AI. The Draft and Suggest buttons write a starting point you review and edit; nothing
        is saved or published until you do.
      </p>

      <VisibilityField value={visibility} onChange={setVisibility} />

      {veraError && (
        <p className="rounded-lg bg-warning-bg px-3 py-2 text-sm font-medium text-warning" role="status">
          {veraError}
        </p>
      )}
      {error && <FormError message={error} />}

      </fieldset>

      {/* The action row lives OUTSIDE the disabled fieldset: Save is gated on `readOnly` directly (so
          a staff viewer can't submit), while "View profile" stays available so staff can still open
          the live profile. */}
      <div className="flex items-center gap-3 pt-1">
        {!readOnly && (
          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" aria-hidden /> Save changes
              </>
            )}
          </Button>
        )}
        {saved && !pending && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-success" role="status">
            <Check className="h-4 w-4" aria-hidden /> Saved
          </span>
        )}
        <Button type="button" variant="ghost" onClick={() => router.push(`/spaces/${slug}`)} disabled={pending}>
          View profile
        </Button>
      </div>
    </form>
  )
}
