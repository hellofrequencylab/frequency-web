import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { contactsOwnerId } from '@/lib/connections/access'
import { FocusTemplate } from '@/components/templates'
import { Creator } from './creator'

export const dynamic = 'force-dynamic'

export default async function NewProfilePage() {
  const ownerId = await contactsOwnerId()
  if (!ownerId) redirect('/feed')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  return (
    <FocusTemplate
      title="New profile"
      description="Scan a card or poster, or enter details by hand with Vera’s help. Saved privately to you."
      back={{ href: '/connections', label: 'Profiles' }}
    >
      <Creator userId={user.id} />
    </FocusTemplate>
  )
}
