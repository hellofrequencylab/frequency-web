'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { Check, MapPin, Radar, ShieldCheck, Sparkles } from 'lucide-react'
import { AdminModuleCard } from '@/components/admin/admin-module-card'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { LOCATION_BAND_OPTIONS, type LocationBand } from '@/lib/connections/location'
import { saveConnectionSettings } from '@/lib/connections/connection-settings-actions'
import type { ConnectionSettings } from '@/lib/connections/connection-settings'

// The admin console for the connection-layer singleton (ADR-186). Three groups:
// Features (the platform-wide master switches that gate whole capabilities), Privacy
// defaults (what a new member starts with + the radius the user slider may roam), and
// Rewards (the gem economics later phases pay out). All writes go through the
// admin-gated saveConnectionSettings action — this form just collects the patch.

const METRES_PER_MILE = 1609.344
const toMiles = (m: number) => Math.round((m / METRES_PER_MILE) * 10) / 10
const toMetres = (mi: number) => Math.round(mi * METRES_PER_MILE)

export function ConnectionSettingsAdmin({ settings }: { settings: ConnectionSettings }) {
  const [form, setForm] = useState<ConnectionSettings>(settings)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Track the radius bounds in miles for the inputs; convert back to metres on save.
  const [minMiles, setMinMiles] = useState(String(toMiles(settings.minDiscoveryRadiusM)))
  const [maxMiles, setMaxMiles] = useState(String(toMiles(settings.maxDiscoveryRadiusM)))

  const set = <K extends keyof ConnectionSettings>(key: K, value: ConnectionSettings[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
    setError(null)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const payload: ConnectionSettings = {
      ...form,
      minDiscoveryRadiusM: toMetres(Number(minMiles) || 0),
      maxDiscoveryRadiusM: toMetres(Number(maxMiles) || 0),
    }
    startTransition(async () => {
      const res = await saveConnectionSettings(payload)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setForm(payload)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── Features ─────────────────────────────────────────────────────────── */}
      <AdminModuleCard
        title="Features"
        Icon={Radar}
        desc="Master switches that gate whole capabilities platform-wide. Turning one off hides it for everyone."
      >
        <div className="divide-y divide-border">
          <Toggle
            label="Directory"
            hint="The browsable member directory."
            checked={form.directoryEnabled}
            disabled={pending}
            onChange={(v) => set('directoryEnabled', v)}
          />
          <Toggle
            label="Proximity"
            hint="Nearby sort and the members-near discovery list."
            checked={form.proximityEnabled}
            disabled={pending}
            onChange={(v) => set('proximityEnabled', v)}
          />
          <Toggle
            label="Maps"
            hint="Venue-snapped member maps — coming in a later phase."
            checked={form.mapsEnabled}
            disabled={pending}
            onChange={(v) => set('mapsEnabled', v)}
          />
          <Toggle
            label="Resonance"
            hint="Orbits & Resonance, the relationship game — later phase."
            checked={form.resonanceEnabled}
            disabled={pending}
            onChange={(v) => set('resonanceEnabled', v)}
          />
          <Toggle
            label="Near-miss"
            hint="“You crossed paths” nudges — later phase."
            checked={form.nearMissEnabled}
            disabled={pending}
            onChange={(v) => set('nearMissEnabled', v)}
          />
        </div>
      </AdminModuleCard>

      {/* ── Privacy defaults ─────────────────────────────────────────────────── */}
      <AdminModuleCard
        title="Privacy defaults"
        Icon={ShieldCheck}
        desc="What a new member starts with, and the floor/ceiling for the radius slider they control."
      >
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className={labelClasses}>Default location precision</span>
            <select
              className={fieldClasses}
              value={form.defaultLocationBand}
              disabled={pending}
              onChange={(e) => set('defaultLocationBand', e.target.value as LocationBand)}
            >
              {LOCATION_BAND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="block text-xs text-subtle">
              {LOCATION_BAND_OPTIONS.find((o) => o.value === form.defaultLocationBand)?.hint}
            </span>
          </label>

          <div className="flex items-center gap-2 text-sm font-bold text-text">
            <MapPin className="h-4 w-4 shrink-0 text-primary-strong" />
            Discovery radius bounds
          </div>
          <p className="-mt-2 text-xs text-subtle">
            The floor and ceiling (in miles) of the radius slider a member may set.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className={labelClasses}>Minimum radius (miles)</span>
              <input
                type="number"
                min={0}
                step={0.1}
                className={fieldClasses}
                value={minMiles}
                disabled={pending}
                onChange={(e) => {
                  setMinMiles(e.target.value)
                  setSaved(false)
                  setError(null)
                }}
              />
            </label>
            <label className="block space-y-1.5">
              <span className={labelClasses}>Maximum radius (miles)</span>
              <input
                type="number"
                min={0}
                step={0.1}
                className={fieldClasses}
                value={maxMiles}
                disabled={pending}
                onChange={(e) => {
                  setMaxMiles(e.target.value)
                  setSaved(false)
                  setError(null)
                }}
              />
            </label>
          </div>
        </div>
      </AdminModuleCard>

      {/* ── Rewards ──────────────────────────────────────────────────────────── */}
      <AdminModuleCard
        title="Rewards"
        Icon={Sparkles}
        desc="Gems granted for relationship moments. Later phases pay these out."
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className={labelClasses}>Introduction (gems)</span>
            <input
              type="number"
              min={0}
              max={10000}
              className={fieldClasses}
              value={form.rewardIntroduction}
              disabled={pending}
              onChange={(e) => set('rewardIntroduction', Math.max(0, Number(e.target.value) || 0))}
            />
            <span className="block text-xs text-subtle">For an introduction that becomes a real connection.</span>
          </label>
          <label className="block space-y-1.5">
            <span className={labelClasses}>Welcome (gems)</span>
            <input
              type="number"
              min={0}
              max={10000}
              className={fieldClasses}
              value={form.rewardWelcome}
              disabled={pending}
              onChange={(e) => set('rewardWelcome', Math.max(0, Number(e.target.value) || 0))}
            />
            <span className="block text-xs text-subtle">For welcoming a newcomer to the community.</span>
          </label>
        </div>
      </AdminModuleCard>

      {/* ── Save row ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3">
        {error && <span className="text-xs font-medium text-danger">{error}</span>}
        {saved && (
          <span className="flex items-center gap-1 text-xs font-medium text-primary-strong">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

// ── A labelled master switch ───────────────────────────────────────────────────
function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint: ReactNode
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text">{label}</p>
        <p className="text-xs text-subtle">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
          checked ? 'bg-primary' : 'border border-border-strong bg-surface-elevated'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}
