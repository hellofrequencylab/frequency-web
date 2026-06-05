'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, UserPlus } from 'lucide-react'
import { addMembersToCircle, addCircle } from './actions'

type DemoCircle = { id: string; name: string; memberCount: number; channel: string | null }
type Channel = { slug: string; name: string }

// Non-destructive growth: top up a circle's roster, or spin up a new circle.
// Each arrives fully populated (host, posts, reactions, streaks, an event).
export function GrowNetwork({ circles, channels }: { circles: DemoCircle[]; channels: Channel[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [memberCircle, setMemberCircle] = useState(circles[0]?.id ?? '')
  const [memberCount, setMemberCount] = useState(5)
  const [circleName, setCircleName] = useState('')
  const [circleChannel, setCircleChannel] = useState(channels[0]?.slug ?? 'movement')
  const [circleCity, setCircleCity] = useState('Encinitas')
  const [circleSize, setCircleSize] = useState(14)

  function run(fn: () => Promise<void>, ok?: string) {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      try {
        await fn()
        if (ok) setNotice(ok)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong.')
      }
    })
  }

  const field =
    'rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-border-strong focus:outline-none'

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg border border-danger-bg bg-danger-bg/30 px-3 py-2 text-sm text-danger">{error}</p>}
      {notice && <p className="rounded-lg border border-success-bg bg-success-bg/40 px-3 py-2 text-sm text-success">{notice}</p>}

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Add members to an existing circle */}
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-sm font-semibold text-text">Top up a circle</p>
          <p className="mt-0.5 text-sm text-muted">Add members to an existing demo circle — each brings a post, reactions, a streak, and a practice.</p>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Add members to
              <select
                value={memberCircle}
                onChange={(e) => setMemberCircle(e.target.value)}
                className={`min-w-44 ${field}`}
              >
                {circles.length === 0 && <option value="">No demo circles yet</option>}
                {circles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.memberCount})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              How many
              <input
                type="number"
                min={1}
                max={50}
                value={memberCount}
                onChange={(e) => setMemberCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                className={`w-20 ${field}`}
              />
            </label>
            <button
              type="button"
              disabled={pending || !memberCircle}
              onClick={() =>
                run(
                  () => addMembersToCircle(memberCircle, memberCount).then(() => undefined),
                  `Added ${memberCount} member${memberCount === 1 ? '' : 's'}.`,
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Add members
            </button>
          </div>
        </div>

        {/* Spin up a new circle */}
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-sm font-semibold text-text">Spin up a circle</p>
          <p className="mt-0.5 text-sm text-muted">A new circle arrives with a host, a roster, a practice, and an upcoming event.</p>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              New circle name
              <input
                value={circleName}
                onChange={(e) => setCircleName(e.target.value)}
                placeholder="e.g. Cardiff Trail Runners"
                className={`min-w-52 ${field}`}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Channel
              <select value={circleChannel} onChange={(e) => setCircleChannel(e.target.value)} className={field}>
                {channels.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              City
              <input value={circleCity} onChange={(e) => setCircleCity(e.target.value)} className={`w-32 ${field}`} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Size
              <input
                type="number"
                min={6}
                max={49}
                value={circleSize}
                onChange={(e) => setCircleSize(Math.max(6, Math.min(49, Number(e.target.value) || 14)))}
                className={`w-20 ${field}`}
              />
            </label>
            <button
              type="button"
              disabled={pending || !circleName.trim()}
              onClick={() =>
                run(
                  () =>
                    addCircle({ name: circleName, channel: circleChannel, city: circleCity, size: circleSize }).then(
                      () => undefined,
                    ),
                  `Spun up "${circleName.trim()}" with ${circleSize} members.`,
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Spin up circle
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
