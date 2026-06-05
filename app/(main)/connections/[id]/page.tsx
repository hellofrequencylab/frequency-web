import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { connectionsOwnerId } from '@/lib/connections/access'
import { getContact } from '@/lib/connections/store'
import { Detail } from './detail'

export const dynamic = 'force-dynamic'

export default async function ProfileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ownerId = await connectionsOwnerId()
  if (!ownerId) redirect('/feed')

  const { id } = await params
  const data = await getContact(ownerId, id)
  if (!data) notFound()

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/connections"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" /> Profiles
      </Link>
      <Detail initial={data} />
    </div>
  )
}
