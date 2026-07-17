'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { History, ShieldAlert, ShieldCheck } from 'lucide-react'
import { FormSection } from '@/components/admin/form-section'
import { Banner, StatusChip } from '@/components/admin/status'
import { Toggle } from '@/components/admin/toggle'
import type { AutonomyControlsData } from './load-autonomy'
import type { AutonomyCategory } from '@/lib/ai/vera/autonomy-config'
import {
  setVeraAutonomyEnabled,
  setVeraAutonomyCategory,
  saveVeraAutonomyTuning,
  rearmVeraBreaker,
} from './actions'

// Owner controls for Vera autonomous sending (ADR — Vera autonomous-send graduation). SAFETY-CRITICAL,
// DISABLED-BY-DEFAULT: the master switch is the graduation gate AND the global kill; per-category
// toggles opt each send-capable tool in; the rate caps + anomaly thresholds tune the circuit breaker;
// a live breaker status + manual re-arm sits up top; and the decision audit log is at the bottom. All
// mutations go through the platform-gated server actions (janitor OR platform-domain staff).

const fmtWhen = (s: string | null) =>
  s ? new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
  disabled,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (n: number) => void
  disabled?: boolean
}) {
  return (
    <label className="block text-xs text-muted">
      <span className="mb-1 block">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-24 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm tabular-nums text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50"
        />
        {suffix && <span className="text-subtle">{suffix}</span>}
      </span>
    </label>
  )
}

export function AutonomyControls({ data }: { data: AutonomyControlsData }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  // Local, editable copy of the tuning (the switches write immediately; caps save on the button).
  const [caps, setCaps] = useState(data.caps)
  const [ratePct, setRatePct] = useState(Math.round(data.anomaly.bounceComplaintRate * 100))
  const [sampleSize, setSampleSize] = useState(data.anomaly.sampleSize)
  const [saved, setSaved] = useState(false)

  const refresh = () => router.refresh()

  const toggleMaster = (next: boolean) => start(async () => { await setVeraAutonomyEnabled(next); refresh() })
  const toggleCategory = (key: AutonomyCategory, next: boolean) =>
    start(async () => { await setVeraAutonomyCategory(key, next); refresh() })
  const rearm = () => start(async () => { await rearmVeraBreaker(); refresh() })
  const saveTuning = () =>
    start(async () => {
      setSaved(false)
      await saveVeraAutonomyTuning({
        caps: { recipientPerDay: caps.recipientPerDay, platformPerHour: caps.platformPerHour, platformPerDay: caps.platformPerDay },
        anomaly: { bounceComplaintRate: Math.max(0, Math.min(100, ratePct)) / 100, sampleSize },
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      refresh()
    })

  const tripped = !data.breakerArmed

  return (
    <div>
      {/* Breaker status + re-arm */}
      <FormSection
        title="Autonomous sending"
        description={
          <>
            Lets Vera SEND email on her own, past propose-only. Every autonomous send still passes the
            circuit breaker <strong>and</strong> the send-gate (consent + suppression). Off by default;
            turning it on changes nothing until you also enable a category below.
          </>
        }
      >
        <div className="space-y-3">
          {tripped ? (
            <Banner tone="critical" title="Circuit breaker tripped">
              The breaker disarmed itself after an anomaly (an elevated bounce or complaint rate).
              Autonomous sending is paused until you re-arm it.
              <div className="mt-2">
                <button
                  type="button"
                  onClick={rearm}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden /> Re-arm breaker
                </button>
              </div>
            </Banner>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted">
              <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
              <span>Breaker armed.</span>
              {data.live && (
                <span className="text-subtle">
                  {data.live.sentLastHour} sent last hour · {data.live.sentLastDay} today ·{' '}
                  {(data.live.bounceRate * 100).toFixed(1)}% bounce/complaint ({data.live.sample} recent)
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Toggle
              checked={data.enabled}
              onChange={toggleMaster}
              ariaLabel="Vera autonomous sending"
              disabled={pending}
            />
            <span className="text-sm text-muted">
              Master switch{' '}
              <StatusChip tone={data.enabled ? 'success' : 'neutral'} size="sm">
                {data.enabled ? 'On' : 'Off'}
              </StatusChip>{' '}
              <span className="text-subtle">also the global kill switch</span>
            </span>
          </div>
        </div>
      </FormSection>

      {/* Per-category */}
      <FormSection
        title="Which sends can graduate"
        description="Each send-capable tool opts in separately. A tool stays propose-only until its toggle is on AND the master switch is on."
      >
        <div className="space-y-3">
          {data.categories.map((c) => (
            <div key={c.key} className="flex items-center gap-3">
              <Toggle
                checked={c.enabled}
                onChange={(next) => toggleCategory(c.key, next)}
                ariaLabel={`Autonomous ${c.label}`}
                disabled={pending || !data.enabled}
              />
              <span className="text-sm text-muted">{c.label}</span>
              {!data.enabled && <span className="text-xs text-subtle">(master off)</span>}
            </div>
          ))}
        </div>
      </FormSection>

      {/* Rate caps + anomaly */}
      <FormSection
        title="Rate caps & anomaly trip"
        description="Hard ceilings the breaker enforces per window, and the bounce/complaint rate that trips it off. A send at or over any cap falls back to propose."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <NumberField
              label="Per recipient / day"
              value={caps.recipientPerDay}
              min={0}
              max={50}
              suffix="sends"
              disabled={pending}
              onChange={(n) => setCaps((c) => ({ ...c, recipientPerDay: n }))}
            />
            <NumberField
              label="Platform / hour"
              value={caps.platformPerHour}
              min={0}
              max={1000}
              suffix="sends"
              disabled={pending}
              onChange={(n) => setCaps((c) => ({ ...c, platformPerHour: n }))}
            />
            <NumberField
              label="Platform / day"
              value={caps.platformPerDay}
              min={0}
              max={10000}
              suffix="sends"
              disabled={pending}
              onChange={(n) => setCaps((c) => ({ ...c, platformPerDay: n }))}
            />
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <NumberField
              label="Trip at bounce/complaint rate"
              value={ratePct}
              min={0}
              max={100}
              suffix="%"
              disabled={pending}
              onChange={setRatePct}
            />
            <NumberField
              label="Min sample before tripping"
              value={sampleSize}
              min={1}
              max={5000}
              suffix="events"
              disabled={pending}
              onChange={setSampleSize}
            />
            <button
              type="button"
              onClick={saveTuning}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <ShieldAlert className="h-4 w-4" aria-hidden />
              {saved ? 'Saved' : 'Save caps'}
            </button>
          </div>
        </div>
      </FormSection>

      {/* Audit log */}
      <FormSection
        title="Decision log"
        description="Every autonomous-send decision Vera made: what she decided, the gate outcome, and whether it sent, fell back to propose, or was blocked."
      >
        {data.decisions.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-subtle">
            <History className="h-4 w-4" aria-hidden /> No autonomous decisions yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.decisions.map((d) => (
              <li key={d.id} className="flex items-center gap-3 text-sm">
                <StatusChip
                  tone={d.outcome === 'sent' ? 'success' : d.outcome === 'proposed' ? 'warning' : 'danger'}
                  size="sm"
                >
                  {d.outcome}
                </StatusChip>
                <span className="flex-1 truncate text-muted">
                  {d.category}
                  {d.recipientEmail && <span className="text-subtle"> · {d.recipientEmail}</span>}
                  {d.breakerReason && d.breakerReason !== 'ok' && (
                    <span className="text-subtle"> · breaker: {d.breakerReason}</span>
                  )}
                  {d.gateReason && d.gateReason !== 'ok' && <span className="text-subtle"> · gate: {d.gateReason}</span>}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-subtle">{fmtWhen(d.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </FormSection>
    </div>
  )
}
