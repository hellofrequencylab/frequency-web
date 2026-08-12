'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { Archive } from 'lucide-react'
import { getHubAdminData, archiveHub } from '@/app/(main)/hubs/admin-actions'

// In-place "Danger zone" module (ADMIN-RAIL.md Phase 7, the 'danger' spine cell for hubs). Renders in
// the page admin dock on /hubs/[slug]; getHubAdminData returns null unless the caller holds hub.manage,
// so the module shows nothing for anyone else. Archiving drops the hub from listings; its circles stay
// put. Two-step arm-then-confirm so it can't fire on a stray tap. archiveHub re-checks hub.manage.

type HubData = NonNullable<Awaited<ReturnType<typeof getHubAdminData>>>

export function HubDangerModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/hubs\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<HubData | null>(null)
  const [loading, setLoading] = useState(true)
  const [armed, setArmed] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!slug) return
    let active = true
    getHubAdminData(slug)
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
    return <div className="h-32 animate-pulse rounded-card border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  const alreadyArchived = data.status === 'archived'

  function handleArchive() {
    if (!data || pending) return
    startTransition(async () => {
      const res = await archiveHub(data!.id, data!.slug)
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
      <div className="rounded-card border border-danger/30 bg-danger/5 p-4">
          {alreadyArchived || done ? (
            <p className="text-body-sm font-medium text-text">This hub is archived.</p>
          ) : !armed ? (
            <button
              type="button"
              onClick={() => setArmed(true)}
              className="inline-flex items-center gap-1.5 rounded-control border border-danger/40 bg-surface px-4 py-2 text-meta font-semibold text-danger transition-colors hover:bg-danger/10"
            >
              <Archive className="h-3.5 w-3.5" /> Archive this hub
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-meta text-muted">
                Archiving hides the hub from listings. Its circles stay exactly where they are. You can bring
                it back from the full admin editor later.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleArchive}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-control bg-danger px-4 py-2 text-meta font-semibold text-on-danger transition-colors hover:bg-danger/90 disabled:opacity-40"
                >
                  {pending ? 'Archiving…' : 'Yes, archive it'}
                </button>
                <button
                  type="button"
                  onClick={() => setArmed(false)}
                  disabled={pending}
                  className="rounded-control px-3 py-2 text-meta font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        {error && <p className="mt-3 text-meta font-medium text-danger">{error}</p>}
      </div>
    </div>
  )
}
