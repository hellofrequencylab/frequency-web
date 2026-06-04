'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2, AlertTriangle, Plus, Sparkles, UserPlus } from 'lucide-react'
import {
  setDemoMode,
  purgeDemoContent,
  addMembersToCircle,
  addCircle,
  deleteDemoCircles,
} from './actions'

type DemoCircle = { id: string; name: string; memberCount: number; channel: string | null }
type Channel = { slug: string; name: string }

export function DemoControls({
  enabled,
  counts,
  total,
  circles,
  channels,
}: {
  enabled: boolean
  counts: { label: string; count: number }[]
  total: number
  circles: DemoCircle[]
  channels: Channel[]
}) {
  const router = useRouter()
  const [on, setOn] = useState(enabled)
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // grow-the-network form state
  const [memberCircle, setMemberCircle] = useState(circles[0]?.id ?? '')
  const [memberCount, setMemberCount] = useState(5)
  const [circleName, setCircleName] = useState('')
  const [circleChannel, setCircleChannel] = useState(channels[0]?.slug ?? 'movement')
  const [circleCity, setCircleCity] = useState('Encinitas')
  const [circleSize, setCircleSize] = useState(14)

  // select-to-delete state
  const [selected, setSelected] = useState<Set<string>>(new Set())

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

  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg border border-danger-bg bg-danger-bg/30 px-3 py-2 text-sm text-danger">{error}</p>
      )}
      {notice && (
        <p className="rounded-lg border border-success-bg bg-success-bg/40 px-3 py-2 text-sm text-success">{notice}</p>
      )}

      {/* Soft switch */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">Show demo content</p>
          <p className="mt-0.5 text-sm text-muted">
            {on
              ? 'Demo content is visible across the directory, circles, events, and feeds.'
              : 'Demo content is hidden everywhere. The rows still exist — flip back on, or purge below.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Show demo content"
          onClick={() => {
            const next = !on
            setOn(next)
            run(() => setDemoMode(next))
          }}
          disabled={pending}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            on ? 'bg-primary' : 'bg-border-strong'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-surface shadow transition-transform ${
              on ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Grow the network */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-text">Grow the network</p>
        </div>
        <p className="mt-0.5 text-sm text-muted">
          New demo content arrives fully populated — members bring a post, reactions, a streak, and a
          practice; a new circle spins up with a host, a roster, a practice, and an upcoming event.
        </p>

        {/* add members to a circle */}
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Add members to
            <select
              value={memberCircle}
              onChange={(e) => setMemberCircle(e.target.value)}
              className="min-w-44 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none"
            >
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
              className="w-20 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none"
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

        {/* spin up a circle */}
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
          <label className="flex flex-col gap-1 text-xs text-muted">
            New circle name
            <input
              value={circleName}
              onChange={(e) => setCircleName(e.target.value)}
              placeholder="e.g. Cardiff Trail Runners"
              className="min-w-52 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Channel
            <select
              value={circleChannel}
              onChange={(e) => setCircleChannel(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none"
            >
              {channels.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            City
            <input
              value={circleCity}
              onChange={(e) => setCircleCity(e.target.value)}
              className="w-32 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Size
            <input
              type="number"
              min={6}
              max={49}
              value={circleSize}
              onChange={(e) => setCircleSize(Math.max(6, Math.min(49, Number(e.target.value) || 14)))}
              className="w-20 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none"
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

      {/* Select & delete circles */}
      {circles.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-text">Select &amp; delete circles</p>
            <button
              type="button"
              disabled={pending || selected.size === 0}
              onClick={() =>
                run(() => deleteDemoCircles([...selected]).then(() => setSelected(new Set())), 'Deleted the selected circles.')
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-danger px-3 py-1.5 text-sm font-semibold text-danger transition-colors hover:bg-danger-bg/30 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Delete selected ({selected.size})
            </button>
          </div>
          <p className="mt-0.5 text-sm text-muted">
            Removes the circle and its posts, events, memberships, and RSVPs. Members of only that circle are
            left in the directory; delete them from the People admin if needed.
          </p>
          <ul className="mt-3 divide-y divide-border">
            {circles.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggleSel(c.id)}
                  className="h-4 w-4 accent-danger"
                  aria-label={`Select ${c.name}`}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-text">{c.name}</span>
                {c.channel && <span className="shrink-0 text-xs text-subtle">{c.channel}</span>}
                <span className="shrink-0 text-xs tabular-nums text-muted">{c.memberCount} members</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Danger zone — permanent purge */}
      <div className="rounded-2xl border border-danger-bg bg-danger-bg/10 p-5">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text">Purge all demo content</p>
            <p className="mt-0.5 text-sm text-muted">
              Permanently deletes the {total.toLocaleString()} demo {total === 1 ? 'row' : 'rows'} below (and
              their reactions, memberships, and RSVPs). This cannot be undone — use it once real content has
              taken over.
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
              {counts.map((c) => (
                <li key={c.label}>
                  <span className="font-semibold tabular-nums text-text">{c.count}</span> {c.label}
                </li>
              ))}
            </ul>

            {total > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted" htmlFor="purge-confirm">
                  Type <span className="font-mono font-semibold text-danger">PURGE</span> to confirm:
                </label>
                <input
                  id="purge-confirm"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-28 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-danger focus:outline-none"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => run(() => purgeDemoContent().then(() => setConfirm('')), 'Demo content purged.')}
                  disabled={confirm !== 'PURGE' || pending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Purge demo content
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
