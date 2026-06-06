'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MemberAdmin } from '@/app/(main)/admin/members/member-admin'
import { loadMembers } from '@/app/(main)/admin/members/members-action'

// In-place Members roster (ADR-138 — People). Renders the existing MemberAdmin
// (search / filter / role assignment / account actions) inside the page admin
// console. Janitor-only via the loader; subscribers + beta stay on /admin/members
// (linked below). Fetches on mount.

type Data = NonNullable<Awaited<ReturnType<typeof loadMembers>>>

export function MembersModule() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadMembers().then((d) => {
      if (active) {
        setData(d)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return <div className="h-48 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{data.members.length} total members</p>
      <MemberAdmin members={data.members} emailMap={data.emailMap} />
      <Link
        href="/admin/members?view=subscribers"
        className="block px-2.5 py-1.5 text-center text-xs text-subtle transition-colors hover:text-primary-strong"
      >
        Subscribers &amp; beta invites →
      </Link>
    </div>
  )
}
