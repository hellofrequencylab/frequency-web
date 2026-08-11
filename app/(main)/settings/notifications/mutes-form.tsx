'use client'

import { useState, useTransition } from 'react'
import { BellOff } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { EmptyState } from '@/components/ui/empty-state'
import { Switch } from '@/components/ui/switch'
import type { PreferenceSubjectType } from '@/lib/notification-preferences'
import { setSubjectMute } from './mute-actions'

// "Mute a Circle or Space" — one switch per Space/Circle the member belongs to.
//
// WHY ONE SWITCH AND NOT THE GRID. The store underneath is per (subject, topic, channel),
// which is 7 × 3 = 21 switches for every Space a member is in. Nobody tunes that, and a
// control nobody can hold in their head is a control nobody trusts, so the card offers the
// decision a member actually has: quiet this one place, or don't. Muting writes the whole
// topic × channel set for the subject; unmuting clears it.
//
// PARTIAL state is rendered honestly. A subject with SOME of its rows muted (only reachable
// via a finer-grained control we have not built, or a write that half-failed) reads as muted
// with secondary copy that says so, rather than being rounded to on or off.
//
// The member's global grid is untouched by any of this, which the intro copy says out loud.

/** One Space/Circle row, resolved server-side by ./mute-subjects.ts. */
export interface MuteSubjectRow {
  subjectType: PreferenceSubjectType
  subjectId: string
  /** Display name (a Space's brand name when it has one). */
  name: string
  /** At least one topic × channel pair is muted for this subject. */
  muted: boolean
  /** Some, but not all, of the pairs are muted. Only meaningful when `muted`. */
  partial: boolean
}

const KIND_LABEL: Record<PreferenceSubjectType, string> = { space: 'Space', circle: 'Circle' }

const rowKey = (r: MuteSubjectRow) => `${r.subjectType}:${r.subjectId}`

export function SubjectMutesForm({ initial }: { initial: MuteSubjectRow[] }) {
  const [rows, setRows] = useState(initial)
  const [pendingKeys, setPendingKeys] = useState<string[]>([])
  // The live region is ALWAYS mounted (see the render): a region that appears with its first
  // message is announced by nothing, because assistive tech has to be watching it already.
  const [status, setStatus] = useState('')
  const [, startTransition] = useTransition()

  function onToggle(row: MuteSubjectRow, next: boolean) {
    const key = rowKey(row)
    const previous = rows
    // Optimistic: flip locally, then reconcile. A full mute/unmute clears `partial` either way.
    setRows(rows.map((r) => (rowKey(r) === key ? { ...r, muted: next, partial: false } : r)))
    setPendingKeys((keys) => [...keys, key])
    setStatus('')

    startTransition(async () => {
      const result = await setSubjectMute(row.subjectType, row.subjectId, next)
      setPendingKeys((keys) => keys.filter((k) => k !== key))
      if (isError(result)) {
        setRows(previous)
        setStatus(result.error)
        return
      }
      setStatus(
        next
          ? `${row.name} is muted.`
          : `Notifications from ${row.name} are on again.`,
      )
    })
  }

  return (
    <div className="mt-6 rounded-card border border-border bg-surface lift-1 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface-elevated">
        <BellOff className="w-4 h-4 text-muted" />
        <span className="text-body-sm font-semibold text-text">Mute a Circle or Space</span>
      </div>

      <div className="px-4 py-4 space-y-3">
        <p className="text-body-sm text-muted">
          Quiet one Circle or Space without leaving it. You stay a member and everything is still
          there when you open the app. Muting one place leaves your topic switches above exactly as
          they are.
        </p>

        {rows.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title="Nothing to mute yet"
            description="Join a Circle or a Space and it shows up here with its own switch."
          />
        ) : (
          <div className="divide-y divide-border rounded-card border border-border">
            {rows.map((row) => {
              const key = rowKey(row)
              const pending = pendingKeys.includes(key)
              return (
                <div key={key} className="flex items-center justify-between gap-4 px-3 py-3">
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium text-text truncate">{row.name}</p>
                    <p className="text-meta text-muted mt-0.5">
                      {row.muted && row.partial
                        ? `${KIND_LABEL[row.subjectType]}. Some notifications from it are silenced.`
                        : row.muted
                          ? `${KIND_LABEL[row.subjectType]}. Muted.`
                          : KIND_LABEL[row.subjectType]}
                    </p>
                  </div>
                  <Switch
                    checked={row.muted}
                    pending={pending}
                    onCheckedChange={(next) => onToggle(row, next)}
                    aria-label={`Mute ${row.name}`}
                  />
                </div>
              )
            })}
          </div>
        )}

        {/* Always mounted, never conditional: the first result has to land in a region the
            screen reader was already watching. */}
        <p role="status" aria-live="polite" className="text-meta text-muted min-h-4">
          {status}
        </p>
      </div>
    </div>
  )
}
