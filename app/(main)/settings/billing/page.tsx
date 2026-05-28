import { CreditCard } from 'lucide-react'

export default function BillingPage() {
  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-text mb-1">Billing & Plans</h1>
      <p className="text-sm text-muted mb-8">
        Manage your subscription and payment methods.
      </p>
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <CreditCard className="w-8 h-8 text-subtle/60 mx-auto mb-3" />
        <p className="text-sm font-medium text-text mb-1">Coming soon</p>
        <p className="text-sm text-muted">
          Billing management is being set up. Check back soon.
        </p>
      </div>
    </div>
  )
}
