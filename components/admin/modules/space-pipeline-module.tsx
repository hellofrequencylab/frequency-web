'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ArrowUpRight, Columns3 } from 'lucide-react'
import { getSpacePipelineData } from '@/app/(main)/spaces/[slug]/manage/rail-getters'

// SPACE PIPELINE — the inline rail control for the standardized admin bar (ADR-517 Phase F2 · audit
// GAP 1: "the on-screen pipeline gets an admin function in the bar"). Mirrors space-autonomy-module:
// reads the Space slug from the live path, calls the read-gated getSpacePipelineData(slug) on mount, and
// renders a COMPACT preview of the current stages plus a link INTO the full editor (the board's Pipeline
// view, where the "Edit stages" control lives). The getter re-gates manage access + the crm function
// server-side and returns null otherwise, so a non-manager sees nothing here; every stage WRITE re-gates
// the same authority, so this is convenience over an unchanged gate. No em dashes (voice).

type Data = NonNullable<Awaited<ReturnType<typeof getSpacePipelineData>>>

function slugFromPath(pathname: string): string | null {
  return pathname.match(/^\/spaces\/([^/]+)/)?.[1] ?? null
}

function dotClass(kind: Data['stages'][number]['kind']): string {
  return kind === 'won' ? 'bg-success' : kind === 'lost' ? 'bg-danger' : 'bg-primary'
}

export function SpacePipelineModule() {
  const pathname = usePathname()
  const slug = slugFromPath(pathname)

  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getSpacePipelineData(slug).then((d) => {
      if (active) {
        setData(d)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [slug])

  if (!slug) return null
  if (loading) {
    return <div className="h-28 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null // not permitted / not found → no chrome

  const editHref = `/spaces/${data.slug}/crm?view=pipeline`

  return (
    <section className="min-w-0 space-y-3">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text">
          <Columns3 className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
          Pipeline
        </h3>
        <p className="text-sm text-muted">Your CRM stages. Rename, reorder, and set what each one means.</p>
      </header>

      {data.stages.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {data.stages.map((s) => (
            <li
              key={s.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${dotClass(s.kind)}`} aria-hidden />
              {s.name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-subtle">Your pipeline seeds when you open the CRM board.</p>
      )}

      <Link
        href={editHref}
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary-strong hover:underline"
      >
        Edit stages
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </section>
  )
}
