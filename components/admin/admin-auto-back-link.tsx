'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { backToDomainFor } from '@/app/(main)/admin/sections'

// The admin back affordance: a link from a sub-page up to its parent DOMAIN dashboard.
// Client-side (usePathname + the pure backToDomainFor resolver) so AdminTemplate itself
// stays client-importable — it must NOT pull in next/headers, because a few client
// components render AdminTemplate. An explicit `back` always wins; otherwise the parent
// domain is resolved from the path, and a domain root (or non-admin page) renders nothing.
export function AdminAutoBackLink({ back }: { back?: { href: string; label: string } }) {
  const pathname = usePathname()
  const resolved = back ?? backToDomainFor(pathname)
  if (!resolved) return null

  return (
    <Link
      href={resolved.href}
      className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-text"
    >
      <ChevronLeft className="h-4 w-4" />
      {resolved.label}
    </Link>
  )
}
