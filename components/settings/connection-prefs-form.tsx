'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Ghost, Check, MapPin, ShieldAlert } from 'lucide-react'
import {
  LOCATION_BAND_OPTIONS,
  DISCOVERABLE_OPTIONS,
  type LocationBand,
  type DiscoverableBy,
} from '@/lib/connections/location'
import { saveMyConnectionPrefs } from '@/lib/connections/connection-settings-actions'
import { isError } from '@/lib/action-result'

const METRES_PER_MILE = 1609

function metresToMiles(m: number): number {
  return m / METRES_PER_MILE
}

/** Round a radius (m) to a clean ~mile-aligned step for the slider thumb display. */
function formatMiles(m: number): string {
  const mi = metresToMiles(m)
  if (mi >= 10) return Math.round(mi).toString()
  // one decimal under 10 mi reads better (e.g. "2.5 mi")
  return (Math.round(mi * 10) / 10).toString()
}

export interface ConnectionPrefsInitial {
  directoryVisible: boolean
  discoverableBy: DiscoverableBy
  locationBand: LocationBand
  discoveryRadiusM: number
  ghostMode: boolean
  hasHome: boolean
  minDiscoveryRadiusM: number
  maxDiscoveryRadiusM: number
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function ConnectionPrefsForm({ initial }: { initial: ConnectionPrefsInitial }) {
  const [directoryVisible, setDirectoryVisible] = useState(initial.directoryVisible)
  const [discoverableBy, setDiscoverableBy] = useState<DiscoverableBy>(initial.discoverableBy)
  const [locationBand, setLocationBand] = useState<LocationBand>(initial.locationBand)
  const [radiusM, setRadiusM] = useState(initial.discoveryRadiusM)
  const [ghostMode, setGhostMode] = useState(initial.ghostMode)

  const [isPending, startTransition] = useTransition()
  const [state, setState] = useState<SaveState>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // The radius slider should commit on release rather than on every drag tick.
  const [radiusDraft, setRadiusDraft] = useState(initial.discoveryRadiusM)

  function persist(patch: Parameters<typeof saveMyConnectionPrefs>[0]) {
    setState('saving')
    startTransition(async () => {
      const res = await saveMyConnectionPrefs(patch)
      if (isError(res)) {
        setState('error')
        setErrorMsg(res.error)
      } else {
        setState('saved')
        setErrorMsg('')
      }
    })
  }

  // When ghost mode is on, the rest of the controls are overridden (you vanish entirely).
  const overridden = ghostMode

  return (
    <div className="space-y-6">
      {/* ── Ghost mode — the prominent master override ────────────────────── */}
      <section
        className={`rounded-2xl border shadow-sm overflow-hidden transition-colors ${
          ghostMode
            ? 'border-primary bg-primary-bg/50 dark:bg-primary-bg/30'
            : 'border-border bg-surface'
        }`}
      >
        <button
          type="button"
          onClick={() => {
            const next = !ghostMode
            setGhostMode(next)
            persist({ ghostMode: next })
          }}
          className="w-full flex items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-surface-elevated/60"
          aria-pressed={ghostMode}
        >
          <div
            className={`flex items-center justify-center w-11 h-11 rounded-xl shrink-0 ${
              ghostMode ? 'bg-primary text-on-primary' : 'bg-surface-elevated text-muted'
            }`}
          >
            <Ghost className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text">Ghost mode</p>
            <p className="text-xs text-muted mt-0.5">Vanish from proximity &amp; maps.</p>
          </div>
          <Toggle checked={ghostMode} />
        </button>
        {ghostMode && (
          <p className="px-4 pb-3.5 -mt-1 text-2xs text-primary-strong">
            You&apos;re invisible to discovery. The settings below are paused until you turn
            ghost mode off.
          </p>
        )}
      </section>

      {/* No-home note — proximity is inert without a home location. */}
      {!initial.hasHome && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-3">
          <MapPin className="w-4 h-4 text-muted shrink-0 mt-0.5" />
          <p className="text-xs text-muted">
            Proximity features need a home location.{' '}
            <Link
              href="/settings/profile"
              className="font-medium text-primary-strong underline underline-offset-2"
            >
              Set your city on your profile
            </Link>{' '}
            so people nearby can find you.
          </p>
        </div>
      )}

      {/* ── The detail controls (dimmed while ghosting) ───────────────────── */}
      <div
        className={`space-y-6 transition-opacity ${
          overridden ? 'opacity-50 pointer-events-none select-none' : ''
        }`}
        aria-hidden={overridden}
      >
        {/* Directory visibility */}
        <section className="rounded-2xl border border-border bg-surface shadow-sm">
          <button
            type="button"
            onClick={() => {
              const next = !directoryVisible
              setDirectoryVisible(next)
              persist({ directoryVisible: next })
            }}
            className="w-full flex items-center gap-4 px-4 py-3.5 text-left"
            aria-pressed={directoryVisible}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text">Show me in the Community directory</p>
              <p className="text-xs text-muted mt-0.5">
                Let members browse and find you in the directory.
              </p>
            </div>
            <Toggle checked={directoryVisible} />
          </button>
        </section>

        {/* Who can find me nearby */}
        <Fieldset
          legend="Who can find me nearby"
          hint="Controls who can surface you by location."
        >
          <div className="rounded-2xl border border-border bg-surface shadow-sm divide-y divide-border/80 dark:divide-border/50 overflow-hidden">
            {DISCOVERABLE_OPTIONS.map(({ value, label, hint }) => {
              const active = discoverableBy === value
              return (
                <OptionRow
                  key={value}
                  active={active}
                  label={label}
                  hint={hint}
                  onClick={() => {
                    setDiscoverableBy(value)
                    persist({ discoverableBy: value })
                  }}
                />
              )
            })}
          </div>
        </Fieldset>

        {/* Location precision */}
        <Fieldset
          legend="Location precision others see"
          hint="We never share your exact spot, only a coarse area."
        >
          <div className="rounded-2xl border border-border bg-surface shadow-sm divide-y divide-border/80 dark:divide-border/50 overflow-hidden">
            {LOCATION_BAND_OPTIONS.map(({ value, label, hint }) => {
              const active = locationBand === value
              return (
                <OptionRow
                  key={value}
                  active={active}
                  label={label}
                  hint={hint}
                  onClick={() => {
                    setLocationBand(value)
                    persist({ locationBand: value })
                  }}
                />
              )
            })}
          </div>
        </Fieldset>

        {/* Discoverability radius */}
        <Fieldset
          legend="Discoverability radius"
          hint="How far away people can be and still discover you."
        >
          <div className="rounded-2xl border border-border bg-surface shadow-sm px-4 py-4">
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-sm font-medium text-text">
                Be findable within ~{formatMiles(radiusDraft)} mi
              </p>
              <span className="text-2xs text-subtle">
                {formatMiles(initial.minDiscoveryRadiusM)}–{formatMiles(initial.maxDiscoveryRadiusM)} mi
              </span>
            </div>
            <input
              type="range"
              min={initial.minDiscoveryRadiusM}
              max={initial.maxDiscoveryRadiusM}
              step={1000}
              value={radiusDraft}
              onChange={(e) => setRadiusDraft(Number(e.target.value))}
              onPointerUp={() => {
                if (radiusDraft !== radiusM) {
                  setRadiusM(radiusDraft)
                  persist({ discoveryRadiusM: radiusDraft })
                }
              }}
              onKeyUp={() => {
                if (radiusDraft !== radiusM) {
                  setRadiusM(radiusDraft)
                  persist({ discoveryRadiusM: radiusDraft })
                }
              }}
              aria-label="Discoverability radius in miles"
              className="w-full accent-primary"
            />
          </div>
        </Fieldset>
      </div>

      {/* ── Reassurance + save status ─────────────────────────────────────── */}
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-elevated px-4 py-3">
        <ShieldAlert className="w-4 h-4 text-muted shrink-0 mt-0.5" />
        <p className="text-xs text-muted">
          Frequency never shares your exact location. Others only see a fuzzed area or your city.
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs px-1 min-h-5">
        {isPending || state === 'saving' ? (
          <span className="text-muted">Saving…</span>
        ) : state === 'saved' ? (
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <Check className="w-3 h-3" /> Saved
          </span>
        ) : state === 'error' ? (
          <span className="text-red-600 dark:text-red-400">
            Couldn&apos;t save{errorMsg ? ` (${errorMsg})` : ''}.
          </span>
        ) : (
          <span className="text-muted">Changes save instantly.</span>
        )}
      </div>
    </div>
  )
}

/* ── Small presentational helpers ───────────────────────────────────────── */

function Toggle({ checked }: { checked: boolean }) {
  return (
    <span
      className={`relative inline-flex items-center w-10 h-6 rounded-full transition-colors shrink-0 ${
        checked ? 'bg-primary' : 'bg-border'
      }`}
    >
      <span
        className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </span>
  )
}

function Fieldset({
  legend,
  hint,
  children,
}: {
  legend: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-2 px-1">
        <p className="text-sm font-semibold text-text">{legend}</p>
        {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function OptionRow({
  active,
  label,
  hint,
  onClick,
}: {
  active: boolean
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
        active ? 'bg-primary-bg/60 dark:bg-primary-bg/40' : 'hover:bg-surface-elevated'
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${active ? 'text-primary-strong' : 'text-text'}`}>
          {label}
        </p>
        <p className="text-xs text-muted mt-0.5">{hint}</p>
      </div>
      {active && <Check className="w-4 h-4 text-primary-strong shrink-0" />}
    </button>
  )
}
