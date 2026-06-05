import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { isPlatformStaff } from '@/lib/auth'

// The site-wide staff edit affordance. Drop this on any entity's page (a circle,
// a practice, …) pointing at that entity's editor; it renders an "Edit" button
// ONLY for platform staff (admin/janitor) and nothing for everyone else, so staff
// get one consistent way to edit content they don't own, everywhere. Server
// component — it does its own role check (the editor it links to re-enforces).
export async function StaffEditButton({
  href,
  label = 'Edit',
}: {
  /** The entity's editor URL. */
  href: string
  /** Button text (e.g. "Edit circle"). */
  label?: string
}) {
  if (!(await isPlatformStaff())) return null
  return (
    <Link
      href={href}
      className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:border-primary hover:text-primary-strong"
    >
      <Pencil className="h-4 w-4" /> {label}
    </Link>
  )
}
