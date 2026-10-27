'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { setAdminDashOrder } from '@/app/(main)/admin/dash-order-actions'
import { DASH_SCOPES, sanitizeDashOrder, type DashScope } from '@/app/(main)/admin/dash-sections'

/** Keyboard-native ordering; the server reads the saved cookie before rendering sections. */
export function AdminDashOrder({ scope, initialOrder }: { scope: DashScope; initialOrder: string[] }) {
  const [order, setOrder] = useState(() => sanitizeDashOrder(scope, initialOrder))
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const saving = useRef(false)
  const router = useRouter()
  const labels = new Map(DASH_SCOPES[scope].map(section => [section.id, section.label]))
  function move(index: number, delta: number) {
    if (saving.current || index + delta < 0 || index + delta >= order.length) return
    setOrder(current => { const next = [...current]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next })
    setMessage('Order changed. Save to apply it.'); setError(false)
  }
  async function save() {
    if (saving.current) return
    saving.current = true; setPending(true); setMessage(''); setError(false)
    try {
      await setAdminDashOrder(scope, order)
      setMessage('Section order saved.'); router.refresh()
    } catch {
      setMessage('Could not save section order. Please try again.'); setError(true)
    } finally { saving.current = false; setPending(false) }
  }
  return <details className="mb-6">
    <summary className="cursor-pointer text-body-sm">Arrange dashboard sections</summary>
    <p className="mt-2 text-body-sm text-muted">Move sections, then save. This order applies in this browser.</p>
    <ol aria-label="Dashboard section order" className="my-3 space-y-2">
      {order.map((id, index) => <li key={id} className="flex items-center gap-2">
        <span className="flex-1 text-body-sm">{labels.get(id)}</span>
        <Button type="button" size="sm" variant="secondary" aria-label={`Move ${labels.get(id)} up`} disabled={pending || index === 0} onClick={() => move(index, -1)}>Up</Button>
        <Button type="button" size="sm" variant="secondary" aria-label={`Move ${labels.get(id)} down`} disabled={pending || index === order.length - 1} onClick={() => move(index, 1)}>Down</Button>
      </li>)}
    </ol>
    <Button type="button" size="sm" disabled={pending} onClick={() => void save()}>{pending ? 'Saving…' : 'Save section order'}</Button>
    {message && <p className="mt-2 text-body-sm" role={error ? 'alert' : 'status'}>{message}</p>}
  </details>
}
