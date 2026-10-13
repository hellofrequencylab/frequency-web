'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setCirclePracticeAction } from '@/app/(main)/practices/actions'
import { isError } from '@/lib/action-result'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

// Host control: pick the circle's current practice from the library.
export function SetCirclePractice({
  circleId,
  library,
  current,
}: {
  circleId: string
  library: { id: string; title: string }[]
  current?: string
}) {
  const [val, setVal] = useState(current ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-meta text-subtle">Set practice:</span>
      <Select
        value={val}
        onChange={(e) => setVal(e.target.value)}
        aria-label="Set practice"
        wrapperClassName="inline-block w-max max-w-full"
        emptyLabel="Choose a practice…"
      >
        {library.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </Select>
      <Button
        disabled={pending || !val || val === current}
        onClick={() =>
          start(async () => {
            const res = await setCirclePracticeAction(circleId, val)
            if (isError(res)) setErr(res.error)
            else {
              setErr(null)
              router.refresh()
            }
          })
        }
      >
        {pending ? 'Setting…' : 'Set'}
      </Button>
      {err && <span className="text-meta text-danger">{err}</span>}
    </div>
  )
}
