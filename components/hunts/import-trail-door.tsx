'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button, buttonClasses } from '@/components/ui/button'
import { importQrCampaignAction, importRegularsHuntAction } from '@/app/(main)/hunts/edition-actions'

// THE IMPORT DOOR (FH-044S, ADR-1972 point 8): start a Trail draft from a legacy hunt. A Regulars hunt is
// imported from its host Space's Hunts section, a QR campaign from /admin/qr. The action reads the
// legacy hunt's shape only and writes one private draft the caller owns; stamps, scans, finishes and
// rewards stay with the old hunt, which keeps working as it is. The notices the import returns are
// shown before the author opens the draft. The caller renders this only while HUNTS_AUTHORING_ENABLED
// is on; the action refuses on its own without it.

type Source = { kind: 'regulars'; spaceId: string; legacyHuntId: string } | { kind: 'qr_campaign'; challengeId: string }

export function ImportTrailDoor({ source }: { source: Source }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [made, setMade] = useState<{ huntId: string; notices: string[] } | null>(null)

  const start = async () => {
    setPending(true)
    setError(null)
    const res = source.kind === 'regulars'
      ? await importRegularsHuntAction({ spaceId: source.spaceId, legacyHuntId: source.legacyHuntId })
      : await importQrCampaignAction({ challengeId: source.challengeId })
    setPending(false)
    if ('error' in res) setError(res.error)
    else setMade(res.data)
  }

  if (made) {
    return (
      <div className="space-y-2 rounded-card border border-border bg-surface p-3 text-body-sm">
        <p className="font-semibold text-text">A trail draft is ready.</p>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          {made.notices.map((n) => <li key={n}>{n}</li>)}
        </ul>
        <Link href={`/hunts/edit/${made.huntId}`} className={buttonClasses('primary', 'sm')}>
          Open the draft
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <Button size="sm" variant="secondary" onClick={start} loading={pending}>
        Start a trail from this {source.kind === 'regulars' ? 'hunt' : 'campaign'}
      </Button>
      {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
    </div>
  )
}
