'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Loader2,
  LogIn,
  Layout,
  ClipboardList,
  Target,
  Plus,
  Trash2,
  Zap,
  GitBranch,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusChip } from '@/components/admin/status'
import { cn } from '@/lib/utils'
import { isError } from '@/lib/action-result'
import {
  STAGE_KIND_META,
  REF_TYPE_META,
  type FunnelStageKind,
  type StageRefType,
} from '@/lib/funnels/templates'
import { messagingStatusMeta, funnelStatusToMessaging } from '@/lib/messaging/status'
import { reorderFunnelStages, renameFunnelStage } from '@/app/(main)/admin/marketing/messaging/actions'
import { addStageLink, removeStageLink } from '@/app/(main)/admin/growth/funnels/actions'

// The visual Funnel FLOW VIEW (EMAIL-CAMPAIGNS-FUNNELS-PLAN P4, ask #4/#5). A funnel
// renders as a clean vertical flow: a Trigger banner, the stages as minimal nodes
// (icon + label + one status line), and a Goal banner. Reorder by dragging (the native
// HTML5 DnD idiom lifted from components/spaces/crm/stage-editor.tsx, no new library)
// or the keyboard up/down arrows. Clicking a node opens its settings in a SIDE PANEL,
// never on the node, so the canvas stays quiet (the plan's research rule). Every change
// persists through a server action that re-gates marketing access; this layer is fast
// feedback only. No em dashes (voice).

export interface FlowLink {
  id: string
  refType: StageRefType
  refId: string | null
  refKey: string | null
}

export interface FlowStage {
  id: string
  kind: FunnelStageKind
  label: string
  position: number
  links: FlowLink[]
}

export interface FlowFunnel {
  id: string
  name: string
  status: string
  goalEvent: string
  persona: string | null
  stages: FlowStage[]
}

const KIND_ICON: Record<FunnelStageKind, LucideIcon> = {
  entry: LogIn,
  wedge: Layout,
  capture: ClipboardList,
  convert: Target,
}

// Presentational best-practice timing hint per position (the plan's "timing between
// steps"). The funnel object does not persist per-step delays yet, so this seeds the
// operator's mental model in the flow; real cadence lives in the drip runner (P2 seam).
const TIMING_HINTS = ['Sends right away', 'A day or so later', 'A few days later', 'Later in the journey']

const REF_TYPE_OPTIONS: StageRefType[] = ['entry_point', 'campaign', 'page', 'lead_flow', 'nurture', 'custom']

export function FunnelFlow({ funnel }: { funnel: FlowFunnel }) {
  const router = useRouter()
  const [stages, setStages] = useState<FlowStage[]>(() =>
    [...funnel.stages].sort((a, b) => a.position - b.position),
  )
  const [selectedId, setSelectedId] = useState<string | null>(stages[0]?.id ?? null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const selected = useMemo(() => stages.find((s) => s.id === selectedId) ?? null, [stages, selectedId])
  const statusMeta = messagingStatusMeta(funnelStatusToMessaging(funnel.status))

  function run(fn: () => Promise<{ error: string } | { data: unknown }>, onOk?: () => void) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (isError(res)) {
        setError(res.error)
        router.refresh()
      } else {
        onOk?.()
        router.refresh()
      }
    })
  }

  function persistOrder(next: FlowStage[]) {
    setStages(next.map((s, i) => ({ ...s, position: i })))
    run(() => reorderFunnelStages(funnel.id, next.map((s) => s.id)))
  }

  function move(index: number, dir: 'up' | 'down') {
    const to = dir === 'up' ? index - 1 : index + 1
    if (to < 0 || to >= stages.length) return
    const next = [...stages]
    ;[next[index], next[to]] = [next[to], next[index]]
    persistOrder(next)
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return setDragId(null)
    const from = stages.findIndex((s) => s.id === dragId)
    const to = stages.findIndex((s) => s.id === targetId)
    setDragId(null)
    if (from === -1 || to === -1) return
    const next = [...stages]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    persistOrder(next)
  }

  function commitRename(stage: FlowStage, value: string) {
    const trimmed = value.trim()
    if (!trimmed || trimmed === stage.label) return
    setStages((cur) => cur.map((s) => (s.id === stage.id ? { ...s, label: trimmed } : s)))
    run(() => renameFunnelStage(funnel.id, stage.id, trimmed))
  }

  const triggerLabel = funnel.persona
    ? `Someone in the ${funnel.persona} audience enters`
    : 'Someone enters this funnel'

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {/* ── The flow canvas ─────────────────────────────────────────────────── */}
      <div>
        {error && (
          <p className="mb-3 rounded-lg border border-danger bg-danger-bg px-3 py-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-text">Flow</p>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-subtle" aria-hidden />}
          </div>
          <StatusChip tone={statusMeta.tone} size="sm">
            {statusMeta.glyph} {statusMeta.label}
          </StatusChip>
        </div>
        <p className="mb-4 mt-0.5 text-xs text-muted">
          Drag a step to reorder it, or use the arrows. Click a step to edit its settings on the right.
        </p>

        {/* Trigger banner */}
        <FlowBanner icon={Zap} tone="trigger" title="Trigger" line={triggerLabel} />
        <Connector />

        <ol className="space-y-0">
          {stages.map((stage, index) => {
            const Icon = KIND_ICON[stage.kind]
            const kindMeta = STAGE_KIND_META[stage.kind]
            const active = stage.id === selectedId
            return (
              <li key={stage.id}>
                <div
                  draggable
                  onDragStart={() => setDragId(stage.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(stage.id)}
                  onDragEnd={() => setDragId(null)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  onClick={() => setSelectedId(stage.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedId(stage.id)
                    }
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border bg-surface p-3 text-left transition-colors',
                    active ? 'border-primary-strong ring-1 ring-primary-strong' : 'border-border hover:border-border-strong',
                    dragId === stage.id && 'opacity-60',
                  )}
                >
                  <span className="cursor-grab text-subtle" aria-hidden>
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-text">{stage.label}</span>
                      <span className="shrink-0 rounded-full bg-surface-elevated px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-subtle">
                        {kindMeta.label}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {TIMING_HINTS[Math.min(index, TIMING_HINTS.length - 1)]}
                      {stage.links.length > 0 && ` · ${stage.links.length} link${stage.links.length === 1 ? '' : 's'}`}
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        move(index, 'up')
                      }}
                      disabled={pending || index === 0}
                      aria-label={`Move ${stage.label} up`}
                      className="rounded-md p-1 text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        move(index, 'down')
                      }}
                      disabled={pending || index === stages.length - 1}
                      aria-label={`Move ${stage.label} down`}
                      className="rounded-md p-1 text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" aria-hidden />
                    </button>
                  </span>
                </div>
                <Connector />
              </li>
            )
          })}
        </ol>

        {/* Goal banner */}
        <FlowBanner icon={Target} tone="goal" title="Goal" line={`Converts on "${funnel.goalEvent}"`} />

        {/* Add a split (branch) — a documented deferred seam (the plan keeps funnels
            linear by default; a branch needs the automation condition grammar + a new
            stage kind, P4's deep end). Present but off, so the affordance is honest. */}
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-dashed border-border p-3">
          <GitBranch className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text">Add a split</p>
            <p className="text-xs text-muted">Send people down a yes or no path. Coming next.</p>
          </div>
          <Button type="button" variant="secondary" size="sm" disabled>
            Soon
          </Button>
        </div>
      </div>

      {/* ── The side panel ──────────────────────────────────────────────────── */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        {selected ? (
          <StagePanel
            key={selected.id}
            stage={selected}
            pending={pending}
            onRename={commitRename}
            onAddLink={(input) => run(() => addStageLink(input))}
            onRemoveLink={(linkId) => run(() => removeStageLink(linkId))}
          />
        ) : (
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
            Add a step to start editing.
          </div>
        )}
      </aside>
    </div>
  )
}

function Connector() {
  return <div className="ml-[1.85rem] h-4 w-px bg-border" aria-hidden />
}

function FlowBanner({
  icon: Icon,
  tone,
  title,
  line,
}: {
  icon: LucideIcon
  tone: 'trigger' | 'goal'
  title: string
  line: string
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border p-3',
        tone === 'trigger' ? 'border-info/30 bg-info-bg' : 'border-success/30 bg-success-bg',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          tone === 'trigger' ? 'bg-info/15 text-info' : 'bg-success/15 text-success',
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className={cn('text-2xs font-bold uppercase tracking-wide', tone === 'trigger' ? 'text-info' : 'text-success')}>
          {title}
        </p>
        <p className="truncate text-sm font-medium text-text">{line}</p>
      </div>
    </div>
  )
}

function StagePanel({
  stage,
  pending,
  onRename,
  onAddLink,
  onRemoveLink,
}: {
  stage: FlowStage
  pending: boolean
  onRename: (stage: FlowStage, value: string) => void
  onAddLink: (input: { stageId: string; refType: string; refId?: string | null; refKey?: string | null }) => void
  onRemoveLink: (linkId: string) => void
}) {
  const kindMeta = STAGE_KIND_META[stage.kind]
  const [refType, setRefType] = useState<StageRefType>('page')
  const [refValue, setRefValue] = useState('')
  const usesId = REF_TYPE_META[refType].pointer === 'id'

  function submitLink() {
    const value = refValue.trim()
    if (!value) return
    onAddLink({
      stageId: stage.id,
      refType,
      refId: usesId ? value : null,
      refKey: usesId ? null : value,
    })
    setRefValue('')
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-2xs font-bold uppercase tracking-wide text-subtle">{kindMeta.label} step</p>
      <p className="mt-0.5 text-xs text-muted">{kindMeta.blurb}</p>

      <label className="mt-4 block text-xs font-semibold text-text" htmlFor={`label-${stage.id}`}>
        Step name
      </label>
      <input
        id={`label-${stage.id}`}
        type="text"
        defaultValue={stage.label}
        disabled={pending}
        onBlur={(e) => onRename(stage, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        className="mt-1 w-full rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
      />

      <div className="mt-4">
        <p className="text-xs font-semibold text-text">Wired to</p>
        {stage.links.length === 0 ? (
          <p className="mt-1 text-xs text-muted">Nothing yet. Point this step at a page, campaign, or flow.</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {stage.links.map((link) => (
              <li
                key={link.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-canvas px-2.5 py-1.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-2xs font-medium uppercase tracking-wide text-subtle">
                    {REF_TYPE_META[link.refType]?.label ?? link.refType}
                  </span>
                  <span className="block truncate text-xs text-text">{link.refKey ?? link.refId ?? ''}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveLink(link.id)}
                  disabled={pending}
                  aria-label="Remove link"
                  className="rounded-md p-1 text-muted transition-colors hover:bg-danger-bg hover:text-danger disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add a link */}
      <div className="mt-3 space-y-2 rounded-xl border border-dashed border-border p-2.5">
        <label className="sr-only" htmlFor={`reftype-${stage.id}`}>
          What to wire this step to
        </label>
        <select
          id={`reftype-${stage.id}`}
          value={refType}
          disabled={pending}
          onChange={(e) => setRefType(e.target.value as StageRefType)}
          className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text outline-none focus:border-primary"
        >
          {REF_TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {REF_TYPE_META[t].label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={refValue}
          placeholder={usesId ? 'Paste the id to link' : 'Enter the key or slug'}
          aria-label="Link target"
          disabled={pending}
          onChange={(e) => setRefValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submitLink()
            }
          }}
          className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
        />
        <Button type="button" variant="secondary" size="sm" disabled={pending || !refValue.trim()} onClick={submitLink}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Wire it up
        </Button>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-2xs text-subtle">
        <X className="h-3 w-3" aria-hidden />
        Changes save as you make them.
      </p>
    </div>
  )
}
