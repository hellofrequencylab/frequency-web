'use client'

// A per-Space control on the Manage Spaces console: create (or open) the editable MASTER PROFILE for a
// hand-made Space, derived from its own content, then route into the review board so the operator can
// edit it, re-voice the copy, or add images. Idempotent server-side — a second click just re-opens the
// same profile. Used only for Spaces that have no master profile yet; a seeded Space shows a plain
// "Re-seed" link instead.

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { adoptSpaceMasterProfile } from '../business-seeder/actions'

export function AdoptMasterProfileButton({ spaceId }: { spaceId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function adopt() {
    setError(null)
    start(async () => {
      const res = await adoptSpaceMasterProfile(spaceId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.push(`/admin/business-seeder/${res.intakeId}`)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" size="sm" onClick={adopt} disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
        {pending ? 'Building…' : 'Master profile'}
      </Button>
      {error && <p className="text-2xs text-danger">{error}</p>}
    </div>
  )
}
