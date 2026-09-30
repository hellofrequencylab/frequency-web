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
      title="Add a contact"
      description="Scan a card or poster, or type the details in with Vera’s help. Only you can see it."
      back={{ href: '/connections', label: 'My Contacts' }}
    >
      <Creator userId={user.id} />
    </FocusTemplate>
  )
}
