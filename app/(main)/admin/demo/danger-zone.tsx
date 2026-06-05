'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2, AlertTriangle, Eye, Wind, ShieldAlert, MapPin } from 'lucide-react'
import { LocationAutocomplete } from '@/components/admin/location-autocomplete'
import { purgeArea, runDemoDecay } from './studio/actions'
import { deleteDemoCircles, purgeDemoContent } from './actions'

type DemoCircle = { id: string; name: string; memberCount: number; channel: string | null }

// Every destructive action in one place, at the bottom of the page, behind a
// single typed-DELETE confirm that ARMS the whole zone. Non-destructive previews
// (the decay dry-run) stay available without arming. Reordered least → most
// severe: purge an area · delete specific circles · decay pass · purge everything.
export function DangerZone({
  total,
  counts,
  circles,
  defaultLocation,
}: {
  total: number
  counts: { label: string; count: number }[]
  circles: DemoCircle[]
  defaultLocation: { name: string; lat: number; lng: number }
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // One DELETE confirm arms every destructive action in the zone.
  const [confirm, setConfirm] = useState('')
  const armed = confirm.trim().toUpperCase() === 'DELETE'

  // purge-an-area
  const [areaName, setAreaName] = useState(defaultLocation.name)
  const [lat, setLat] = useState(defaultLocation.lat)
  const [lng, setLng] = useState(defaultLocation.lng)
  const [radius, setRadius] = useState(10)

  // select-to-delete
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  // decay
  const [decay, setDecay] = useState<Awaited<ReturnType<typeof runDemoDecay>> | null>(null)

  function run(fn: () => Promise<void>, ok?: string) {
    setError(null)
    setNotice(null)
    start(async () => {
      try {
        await fn()
        if (ok) setNotice(ok)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong.')
      }
    })
  }

  const dangerBtn =
    'inline-flex items-center gap-1.5 rounded-lg border border-danger px-3 py-1.5 text-sm font-semibold text-danger transition-colors hover:bg-danger-bg/30 disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="space-y-4 rounded-2xl border border-danger-bg bg-danger-bg/10 p-5">
      {error && <p className="rounded-lg border border-danger-bg bg-danger-bg/30 px-3 py-2 text-sm text-danger">{error}</p>}
      {notice && <p className="rounded-lg border border-success-bg bg-success-bg/40 px-3 py-2 text-sm text-success">{notice}</p>}

      {/* The single arm — type DELETE to unlock everything below */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/40 bg-surface p-4">
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div>
            <p className="text-sm font-semibold text-text">Destructive actions</p>
            <p className="mt-0.5 text-sm text-muted">
              Type <span className="font-mono font-semibold text-danger">DELETE</span> to unlock the actions below. These can’t be undone.
            </p>
          </div>
        </div>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="DELETE"
          autoComplete="off"
          aria-label="Type DELETE to enable destructive actions"
          className={`w-32 rounded-lg border bg-surface px-3 py-2 text-sm font-semibold tracking-wide focus:outline-none ${
            armed ? 'border-danger text-danger' : 'border-border text-text'
          }`}
        />
      </div>

      {/* 1 · Purge an area */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-2 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-danger" />
          <p className="text-sm font-semibold text-text">Purge an area</p>
        </div>
        <p className="mb-3 text-sm text-muted">Deletes demo content within a radius of a point — for clearing one town once it’s gone real.</p>
        <LocationAutocomplete
          value={areaName}
          placeholder="Search a city or town…"
          onPick={(p) => {
            setAreaName(p.label.split(',')[0])
            setLat(+p.lat.toFixed(5))
            setLng(+p.lng.toFixed(5))
          }}
        />
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Radius: <b className="text-text">{radius} mi</b>
            <input
              type="range"
              min={1}
              max={50}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-40 accent-danger"
            />
          </label>
          <button
            type="button"
            disabled={!armed || pending}
            onClick={() => run(async () => { await purgeArea(lat, lng, radius) }, `Purged demo content within ${radius} mi of ${areaName}.`)}
            className={dangerBtn}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Purge {areaName}
          </button>
        </div>
      </div>

      {/* 2 · Delete specific circles */}
      {circles.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-text">Delete specific circles</p>
            <button
              type="button"
              disabled={!armed || pending || selected.size === 0}
              onClick={() => run(() => deleteDemoCircles([...selected]).then(() => setSelected(new Set())), 'Deleted the selected circles.')}
              className={dangerBtn}
            >
              <Trash2 className="h-4 w-4" />
              Delete selected ({selected.size})
            </button>
          </div>
          <p className="mt-0.5 text-sm text-muted">Removes each circle and its posts, events, memberships, and RSVPs.</p>
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

      {/* 3 · Decay pass (preview is always safe; Run is armed) */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <Wind className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold text-text">Decay pass</p>
              <p className="text-sm text-muted">Runs nightly. Purges demo circles real ones have taken over, prunes old demo posts, and sheds demo neighbors as circles gain real members.</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(async () => setDecay(await runDemoDecay(true)))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-text hover:border-primary disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Preview
            </button>
            <button
              type="button"
              disabled={!armed || pending}
              onClick={() => run(async () => { setDecay(await runDemoDecay(false)) })}
              className={dangerBtn}
            >
              <Wind className="h-4 w-4" />
              Run now
            </button>
          </div>
        </div>
        {decay && (
          <p className="mt-3 rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-muted">
            {decay.dryRun ? 'Would' : 'Did'}: purge <b className="text-text">{decay.purgedCircles}</b> circles, prune{' '}
            <b className="text-text">{decay.prunedPosts}</b> posts in <b className="text-text">{decay.prunedCircles}</b> circles, shed{' '}
            <b className="text-text">{decay.trimmedNeighbours}</b> demo neighbors, remove <b className="text-text">{decay.orphansRemoved}</b> orphans. ({decay.realCircles} real / {decay.demoCircles} demo circles.)
          </p>
        )}
      </div>

      {/* 4 · Purge everything */}
      <div className="rounded-xl border border-danger/50 bg-danger-bg/20 p-4">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-text">Purge ALL demo content</p>
              <button
                type="button"
                disabled={!armed || pending || total === 0}
                onClick={() => run(() => purgeDemoContent().then(() => setConfirm('')), 'All demo content purged.')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Purge everything
              </button>
            </div>
            <p className="mt-0.5 text-sm text-muted">
              Permanently deletes all {total.toLocaleString()} demo {total === 1 ? 'row' : 'rows'} (and their reactions, memberships, and RSVPs). Use once real content has taken over.
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
              {counts.map((c) => (
                <li key={c.label}>
                  <span className="font-semibold tabular-nums text-text">{c.count}</span> {c.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
