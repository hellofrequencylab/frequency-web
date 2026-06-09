'use client'

import { useState, useTransition } from 'react'
import { Plus, Pencil, Trash2, X, Loader2, Check } from 'lucide-react'
import { createQuestChain, updateQuestChain, deleteQuestChain, toggleJourneyOfficial } from './actions'

// ── Shared field layout for create / edit forms ───────────────────────────────

interface QuestChainFormProps {
  chain?: {
    id: string
    name: string
    description: string
    icon: string
    season: number | null
    zaps_reward: number
    sort_order: number
  }
  onSubmit: (fd: FormData) => void
  onCancel: () => void
  pending: boolean
}

function QuestChainForm({ chain, onSubmit, onCancel, pending }: QuestChainFormProps) {
  return (
    <form action={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
            Name
          </label>
          <input
            name="name"
            defaultValue={chain?.name ?? ''}
            required
            placeholder="Mind: Open Circle"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
            Description
          </label>
          <textarea
            name="description"
            defaultValue={chain?.description ?? ''}
            rows={2}
            placeholder="A short description of the quest chain."
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
            Icon (emoji or slug)
          </label>
          <input
            name="icon"
            defaultValue={chain?.icon ?? 'map'}
            placeholder="🗺️"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
            Season (blank = evergreen)
          </label>
          <input
            name="season"
            type="number"
            min={1}
            defaultValue={chain?.season ?? ''}
            placeholder="1"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
            Zaps reward
          </label>
          <input
            name="zaps_reward"
            type="number"
            min={0}
            defaultValue={chain?.zaps_reward ?? 100}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
            Sort order
          </label>
          <input
            name="sort_order"
            type="number"
            defaultValue={chain?.sort_order ?? 0}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50 transition-colors"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {chain ? 'Save changes' : 'Create chain'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:bg-surface-elevated transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── New Quest Chain ───────────────────────────────────────────────────────────

export function NewQuestChainButton() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)

  function handleSubmit(fd: FormData) {
    startTransition(async () => {
      try {
        await createQuestChain(fd)
        setDone(true)
        setTimeout(() => {
          setOpen(false)
          setDone(false)
        }, 800)
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to create quest chain.')
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors whitespace-nowrap"
      >
        <Plus className="w-4 h-4" />
        New chain
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-text">New quest chain</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-subtle hover:text-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              {done ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Check className="w-8 h-8 text-success" />
                  <p className="text-sm font-medium text-text">Quest chain created</p>
                </div>
              ) : (
                <QuestChainForm
                  onSubmit={handleSubmit}
                  onCancel={() => setOpen(false)}
                  pending={pending}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Edit Quest Chain ──────────────────────────────────────────────────────────

interface EditQuestChainButtonProps {
  chain: {
    id: string
    name: string
    description: string
    icon: string
    season: number | null
    zaps_reward: number
    sort_order: number
  }
}

export function EditQuestChainButton({ chain }: EditQuestChainButtonProps) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleSubmit(fd: FormData) {
    startTransition(async () => {
      try {
        await updateQuestChain(chain.id, fd)
        setOpen(false)
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to update quest chain.')
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Edit chain"
        className="rounded p-1.5 text-subtle hover:text-muted hover:bg-surface-elevated transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-text">Edit — {chain.name}</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-subtle hover:text-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              <QuestChainForm
                chain={chain}
                onSubmit={handleSubmit}
                onCancel={() => setOpen(false)}
                pending={pending}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Delete Quest Chain ────────────────────────────────────────────────────────

export function DeleteQuestChainButton({ id, name }: { id: string; name: string }) {
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteQuestChain(id)
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to delete quest chain.')
        setConfirming(false)
      }
    })
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={handleDelete}
          disabled={pending}
          className="rounded px-2 py-1 text-xs font-semibold text-danger bg-danger-bg hover:bg-danger-bg/80 disabled:opacity-50 transition-colors"
        >
          {pending ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Delete'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded px-2 py-1 text-xs text-subtle hover:text-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      title={`Delete ${name}`}
      className="rounded p-1.5 text-subtle hover:text-danger hover:bg-danger-bg transition-colors"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  )
}

// ── Official toggle for journey plans ─────────────────────────────────────────

export function OfficialToggle({ id, isOfficial }: { id: string; isOfficial: boolean }) {
  const [pending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useState(isOfficial)

  function handleToggle() {
    const next = !optimistic
    setOptimistic(next)
    startTransition(async () => {
      try {
        await toggleJourneyOfficial(id, next)
      } catch {
        setOptimistic(!next) // revert on error
      }
    })
  }

  return (
    <button
      onClick={handleToggle}
      disabled={pending}
      title={optimistic ? 'Official — click to remove' : 'Not official — click to mark official'}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60 ${
        optimistic ? 'bg-success' : 'bg-border-strong'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          optimistic ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
