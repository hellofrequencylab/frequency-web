import { BellRing } from 'lucide-react'

export default function NotificationsPage() {
  return (
    <div className="px-6 py-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-1">Notifications</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        Control how and when Frequency contacts you.
      </p>
      <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-800 p-12 text-center">
        <BellRing className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Coming soon</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Notification preferences are being built. Check back soon.
        </p>
      </div>
    </div>
  )
}
