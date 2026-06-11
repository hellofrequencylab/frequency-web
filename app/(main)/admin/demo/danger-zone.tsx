'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2, Eye, Wind, MapPin } from 'lucide-react'
import { LocationAutocomplete } from '@/components/admin/location-autocomplete'
import { Button, buttonClasses } from '@/components/ui/button'
import { DangerModal } from '@/components/admin/danger-modal'
import { Banner } from '@/components/admin/status'
import { purgeArea, runDemoDecay } from './studio/actions'
import { deleteDemoCircles, purgeDemoContent } from './actions'

type DemoCircle = { id: string; name: string; memberCount: number; channel: string | null }

// Every destructive action in one place, at the bottom of the page. Each gates through
// the kit's DangerModal (ADR-233 §5 destructive tiering): irreversible/bulk purges
// require typing DELETE; recoverable deletes confirm with a named button (safe default).
// Non-destructive previews (the decay dry-run) stay available without a modal. Ordered
// least → most severe: purge an area · delete specific circles · decay pass · purge
// everything.
type ModalKey = 'area' | 'circles' | 'decay' | 'all' | null

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
  const [modal, setModal] = useState<ModalKey>(null)

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

  // The canonical outlined-danger tokens (ui/button); sm scale with the panel's text-sm.
  const dangerBtn = buttonClasses('dangerOutline', 'sm', 'text-sm')

  return (
    <div className="space-y-4 rounded-2xl border border-danger-bg bg-danger-bg/10 p-5">
      {error && <Banner tone="critical" title="Something went wrong">{error}</Banner>}
      {notice && <Banner tone="info" title="Done">{notice}</Banner>}

      <p className="text-sm text-muted">
        These actions can&rsquo;t be undone. Each one confirms before it runs.
      </p>

      {/* 1 · Purge an area */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-2 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-danger" />
          <p className="text-sm font-semibold text-text">Purge an area</p>
        </div>
        <p className="mb-3 text-sm text-muted">Deletes demo content within a radius of a point. For clearing one town once it&rsquo;s gone real.</p>
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
          <button type="button" disabled={pending} onClick={() => setModal('area')} className={dangerBtn}>
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
              disabled={pending || selected.size === 0}
              onClick={() => setModal('circles')}
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

      {/* 3 · Decay pass (preview is always safe; Run confirms) */}
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-text hover:border-primary disabled:opacity-50 motion-reduce:transition-none"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Preview
            </button>
            <button type="button" disabled={pending} onClick={() => setModal('decay')} className={dangerBtn}>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-text">Purge ALL demo content</p>
          <Button type="button" variant="danger" disabled={pending || total === 0} onClick={() => setModal('all')}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Purge everything
          </Button>
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

      {/* Confirms — irreversible purges require typing DELETE; recoverable ones use a
          named button with the safe default (per the kit's destructive tiering). */}
      <DangerModal
        open={modal === 'area'}
        onClose={() => setModal(null)}
        title={`Purge demo content near ${areaName}`}
        body={`Permanently deletes demo content within ${radius} mi of ${areaName}. This cannot be undone.`}
        confirmLabel={`Purge ${areaName}`}
        requireTyping="DELETE"
        onConfirm={() => run(async () => { await purgeArea(lat, lng, radius) }, `Purged demo content within ${radius} mi of ${areaName}.`)}
      />
      <DangerModal
        open={modal === 'circles'}
        onClose={() => setModal(null)}
        title={`Delete ${selected.size} ${selected.size === 1 ? 'circle' : 'circles'}`}
        body="Removes each selected circle and its posts, events, memberships, and RSVPs. This cannot be undone."
        confirmLabel="Delete circles"
        onConfirm={() => run(() => deleteDemoCircles([...selected]).then(() => setSelected(new Set())), 'Deleted the selected circles.')}
      />
      <DangerModal
        open={modal === 'decay'}
        onClose={() => setModal(null)}
        title="Run the decay pass"
        body="Purges taken-over demo circles, prunes old demo posts, and sheds demo neighbors. Preview first if you want to see what it touches."
        confirmLabel="Run decay pass"
        onConfirm={() => run(async () => { setDecay(await runDemoDecay(false)) })}
      />
      <DangerModal
        open={modal === 'all'}
        onClose={() => setModal(null)}
        title="Purge ALL demo content"
        body={`Permanently deletes all ${total.toLocaleString()} demo ${total === 1 ? 'row' : 'rows'} and their reactions, memberships, and RSVPs. This cannot be undone.`}
        confirmLabel="Purge everything"
        requireTyping="DELETE"
        onConfirm={() => run(() => purgeDemoContent(), 'All demo content purged.')}
      />
    </div>
  )
}
