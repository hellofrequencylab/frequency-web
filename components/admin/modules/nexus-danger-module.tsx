'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { Archive } from 'lucide-react'
import { getNexusAdminData, archiveNexus } from '@/app/(main)/nexuses/admin-actions'

// In-place "Danger zone" module (ADMIN-RAIL.md Phase 7, the 'danger' spine cell for nexuses). Renders
// in the page admin dock on /nexuses/[slug]; getNexusAdminData returns null unless the caller holds
// nexus.manage. Archiving drops the nexus from listings; its hubs stay put. Two-step arm-then-confirm.
// archiveNexus re-checks nexus.manage.

type NexusData = NonNullable<Awaited<ReturnType<typeof getNexusAdminData>>>

export function NexusDangerModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/nexuses\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<NexusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [armed, setArmed] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!slug) return
    let active = true
    getNexusAdminData(slug)
      .then((d) => {
        if (active) {
          setData(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [slug])

  if (!slug) return null
  if (loading) {
    return <div className="h-32 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  const alreadyArchived = data.status === 'archived'

  function handleArchive() {
    if (!data || pending) return
    startTransition(async () => {
      const res = await archiveNexus(data!.id, data!.slug)
      if ('error' in res) {
        setError(res.error)
      } else {
        setError(null)
        setArmed(false)
        setDone(true)
      }
    })
  }

  return (
    <div className="@container">
      <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
          {alreadyArchived || done ? (
            <p className="text-sm font-medium text-text">This nexus is archived.</p>
          ) : !armed ? (
            <button
              type="button"
              onClick={() => setArmed(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 bg-surface px-4 py-2 text-xs font-semibold text-danger transition-colors hover:bg-danger/10"
            >
              <Archive className="h-3.5 w-3.5" /> Archive this nexus
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted">
                Archiving hides the nexus from listings. Its hubs stay exactly where they are. You can bring it
                back from the full admin editor later.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleArchive}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-danger/90 disabled:opacity-40"
                >
                  {pending ? 'Archiving…' : 'Yes, archive it'}
                </button>
                <button
                  type="button"
                  onClick={() => setArmed(false)}
                  disabled={pending}
                  className="rounded-lg px-3 py-2 text-xs font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        {error && <p className="mt-3 text-xs font-medium text-danger">{error}</p>}
      </div>
    </div>
  )
}
