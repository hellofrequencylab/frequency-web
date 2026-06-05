import { CreditCard } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'

export default function BillingPage() {
  return (
    <FocusTemplate
      title="Billing & Plans"
      description="Manage your subscription and payment methods."
      back={{ href: '/settings', label: 'Settings' }}
    >
      <EmptyState
        icon={CreditCard}
        title="Coming soon"
        description="Billing management is being set up. Check back soon."
      />
    </FocusTemplate>
  )
}
