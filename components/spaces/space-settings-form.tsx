'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { Input, Label } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { VisibilityField, FormError } from '@/components/spaces/space-form'
import { updateSpaceProfile } from '@/lib/spaces/profile-settings'
import { setSpaceBusinessInfo } from '@/app/(main)/spaces/[slug]/manage/layout/actions'

// THE SETTINGS FORM (Space rail lower Settings section — the standardized rail, ADR-535). The less-frequent
// knobs pulled OUT of the forward-facing sections: the star rating + count (profileData, via
// setSpaceBusinessInfo — which MERGES, so the Story/contact owned by Info & Connect are preserved) and who
// can find this space (visibility, a profile column). One Save. Copy runs CONTENT-VOICE: no em dashes.

export function SpaceSettingsForm({
  spaceId,
  slug,
  rating: initialRating,
  ratingCount: initialRatingCount,
  visibility: initialVisibility,
  readOnly = false,
}: {
  spaceId: string
  slug: string
  rating: string
  ratingCount: string
  visibility: 'network' | 'private'
  readOnly?: boolean
}) {
  const router = useRouter()
  const [rating, setRating] = useState(initialRating)
  const [ratingCount, setRatingCount] = useState(initialRatingCount)
  const [visibility, setVisibility] = useState<'network' | 'private'>(initialVisibility)

  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  function save() {
    setError(null)
    setSaved(false)
    start(async () => {
      const [visResult, ratingResult] = await Promise.all([
        updateSpaceProfile(spaceId, { visibility }),
        setSpaceBusinessInfo(slug, { rating: rating.trim(), ratingCount: ratingCount.trim() }),
      ])
      if (isError(visResult)) return setError(visResult.error)
      if (isError(ratingResult)) return setError(ratingResult.error)
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <form
      className="space-y-8 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (!pending && !readOnly) save()
      }}
    >
      <fieldset disabled={readOnly} className="contents">
        {/* RATING — the star rating shown on the profile, if you keep one. */}
        <section className="space-y-4">
          <SectionHeader title="Rating" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="rating" className="mb-1 block font-semibold">Rating</Label>
              <Input id="rating" value={rating} onChange={(e) => setRating(e.target.value)} placeholder="4.8" />
            </div>
            <div>
              <Label htmlFor="rating-count" className="mb-1 block font-semibold">Rating count</Label>
              <Input id="rating-count" value={ratingCount} onChange={(e) => setRatingCount(e.target.value)} placeholder="126 reviews" />
            </div>
          </div>
        </section>

        {/* VISIBILITY — who can find this space. */}
        <section className="space-y-3">
          <SectionHeader title="Visibility" />
          <VisibilityField value={visibility} onChange={setVisibility} />
        </section>

        {error && <FormError message={error} />}
      </fieldset>

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
      </div>
    </form>
  )
}
