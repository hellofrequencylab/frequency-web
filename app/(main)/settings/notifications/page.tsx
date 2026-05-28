import { BellRing } from 'lucide-react'

export default function NotificationsPage() {
  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-text mb-1">Notifications</h1>
      <p className="text-sm text-muted mb-8">
        Control how and when Frequency contacts you.
      </p>
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <BellRing className="w-8 h-8 text-subtle/60 mx-auto mb-3" />
        <p className="text-sm font-medium text-text mb-1">Coming soon</p>
        <p className="text-sm text-muted">
          Notification preferences are being built. Check back soon.
        </p>
      </div>
    </div>
  )
}
