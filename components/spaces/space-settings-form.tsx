'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SectionHeader } from '@/components/ui/section-header'
import { isError } from '@/lib/action-result'
import { VisibilityField, FormError } from '@/components/spaces/space-form'
import { updateSpaceProfile } from '@/lib/spaces/profile-settings'

// THE SETTINGS FORM (Space rail lower Settings section — the standardized rail, ADR-535). The rating box was
// REMOVED (item 6): a Space's rating is now generated automatically from its Reviews (space-landing overrides
// the central rating with the live reviews aggregate), so there is no manual rating to set here. What is left
// is who can find this space (visibility), which autosaves the moment it changes. Copy runs CONTENT-VOICE.

export function SpaceSettingsForm({
  spaceId,
  visibility: initialVisibility,
  readOnly = false,
}: {
  spaceId: string
  /** Accepted for symmetry with the other rail forms (the module passes it); the form does not use it. */
  slug?: string
  visibility: 'network' | 'private'
  readOnly?: boolean
}) {
  const router = useRouter()
  const [visibility, setVisibility] = useState<'network' | 'private'>(initialVisibility)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  // Visibility autosaves on change — no Save button.
  function save(next: 'network' | 'private') {
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await updateSpaceProfile(spaceId, { visibility: next })
      if (isError(res)) return setError(res.error)
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 1500)
    })
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <section className="space-y-3">
        <SectionHeader title="Visibility" />
        <VisibilityField
          value={visibility}
          onChange={(v) => {
            setVisibility(v)
            if (!readOnly) save(v)
          }}
        />
        <p className="text-2xs text-subtle" aria-live="polite">
          {pending
            ? 'Saving…'
            : saved
              ? 'Saved'
              : 'Your rating is generated automatically from your reviews. Changes save automatically.'}
        </p>
      </section>

      {error && <FormError message={error} />}
    </div>
  )
}
