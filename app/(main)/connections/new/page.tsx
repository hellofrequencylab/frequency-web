import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { connectionsOwnerId } from '@/lib/connections/access'
import { Creator } from './creator'

export const dynamic = 'force-dynamic'

export default async function NewProfilePage() {
  const ownerId = await connectionsOwnerId()
  if (!ownerId) redirect('/feed')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/connections"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" /> Profiles
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-text">New profile</h1>
      <p className="mb-6 text-sm text-muted">
        Scan a card or poster, or enter details by hand with Vera’s help. Saved privately to you.
      </p>
      <Creator userId={user.id} />
    </div>
  )
}
