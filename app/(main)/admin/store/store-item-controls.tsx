'use client'

import { useState, useTransition } from 'react'
import { Pencil, Trash2, X, Loader2, Check, Plus } from 'lucide-react'
import {
  createStoreItem,
  updateStoreItem,
  deleteStoreItem,
  toggleStoreItemActive,
} from './actions'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import type { Database } from '@/lib/database.types'

type StoreCategory = Database['public']['Enums']['store_category']
type StoreItem = Database['public']['Tables']['store_items']['Row']

const CATEGORIES: { value: StoreCategory; label: string }[] = [
  { value: 'cosmetic', label: 'Cosmetic' },
  { value: 'membership', label: 'Membership' },
  { value: 'feature', label: 'Feature' },
  { value: 'title', label: 'Title' },
  { value: 'collectible', label: 'Collectible' },
]

// The label look these forms already wore: an uppercase eyebrow over each control. Passed to
// `Field` so the association (and the focus/invalid chrome under it) comes from the primitive.
const LABEL_CLASS = 'uppercase tracking-wider font-semibold'

// ── Active toggle ──────────────────────────────────────────────────────────────

export function ActiveToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useState(isActive)

  function handleToggle() {
    const next = !optimistic
    setOptimistic(next)
    startTransition(async () => {
      try {
        await toggleStoreItemActive(id, next)
      } catch {
        setOptimistic(!next) // revert on error
      }
    })
  }

  return (
    <button
      onClick={handleToggle}
      disabled={pending}
      title={optimistic ? 'Active. Click to deactivate' : 'Inactive. Click to activate'}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-pill border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60 ${
        optimistic ? 'bg-success' : 'bg-border-strong'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-pill bg-surface shadow transition-transform ${
          optimistic ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ── Item form (shared between new + edit) ─────────────────────────────────────

function ItemForm({
  item,
  onSubmit,
  onCancel,
  pending,
}: {
  item?: StoreItem
  onSubmit: (fd: FormData) => void
  onCancel: () => void
  pending: boolean
}) {
  return (
    <form action={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" labelClassName={LABEL_CLASS}>
          <Input name="name" defaultValue={item?.name ?? ''} required placeholder="Neon Halo" />
        </Field>
        <Field label="Slug" labelClassName={LABEL_CLASS}>
          <Input name="slug" defaultValue={item?.slug ?? ''} required placeholder="neon-halo" />
        </Field>
      </div>

      <Field label="Description" labelClassName={LABEL_CLASS}>
        <Textarea
          name="description"
          defaultValue={item?.description ?? ''}
          required
          rows={2}
          placeholder="A brief description shown in the store."
          className="resize-none"
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Category" labelClassName={LABEL_CLASS}>
          <Select name="category" defaultValue={item?.category ?? 'cosmetic'} options={CATEGORIES} />
        </Field>
        <Field label="Gem cost" labelClassName={LABEL_CLASS}>
          <Input name="gem_cost" type="number" min={0} defaultValue={item?.gem_cost ?? 0} required />
        </Field>
        <Field label="Stock (blank = ∞)" labelClassName={LABEL_CLASS}>
          <Input name="stock" type="number" min={0} defaultValue={item?.stock ?? ''} placeholder="∞" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Icon (emoji or slug)" labelClassName={LABEL_CLASS}>
          <Input name="icon" defaultValue={item?.icon ?? ''} placeholder="💎" />
        </Field>
        <Field label="Sort order" labelClassName={LABEL_CLASS}>
          <Input name="sort_order" type="number" defaultValue={item?.sort_order ?? 0} />
        </Field>
      </div>

      <Field label="Preview URL (optional)" labelClassName={LABEL_CLASS}>
        <Input name="preview" type="url" defaultValue={item?.preview ?? ''} placeholder="https://..." />
      </Field>

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {item ? 'Save changes' : 'Create item'}
        </Button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2 text-body-sm font-medium text-muted hover:bg-surface-elevated transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── New Item button + dialog ───────────────────────────────────────────────────

export function NewItemButton() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)

  function handleSubmit(fd: FormData) {
    startTransition(async () => {
      try {
        await createStoreItem(fd)
        setDone(true)
        setTimeout(() => {
          setOpen(false)
          setDone(false)
        }, 800)
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to create item.')
      }
    })
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="whitespace-nowrap">
        <Plus className="w-4 h-4" />
        New item
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} ariaLabel="New store item" className="max-w-lg">
          <div className="w-full rounded-2xl border border-border bg-surface lift-3">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-body-sm font-semibold text-text">New store item</h2>
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
                  <p className="text-body-sm text-text font-medium">Item created</p>
                </div>
              ) : (
                <ItemForm
                  onSubmit={handleSubmit}
                  onCancel={() => setOpen(false)}
                  pending={pending}
                />
              )}
            </div>
          </div>
      </Dialog>
    </>
  )
}

// ── Edit button + dialog ───────────────────────────────────────────────────────

export function EditItemButton({ item }: { item: StoreItem }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleSubmit(fd: FormData) {
    startTransition(async () => {
      try {
        await updateStoreItem(item.id, fd)
        setOpen(false)
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to update item.')
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Edit item"
        className="rounded p-1.5 text-subtle hover:text-muted hover:bg-surface-elevated transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} ariaLabel={`Edit ${item.name}`} className="max-w-lg">
          <div className="w-full rounded-2xl border border-border bg-surface lift-3">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-body-sm font-semibold text-text">Edit {item.name}</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-subtle hover:text-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              <ItemForm
                item={item}
                onSubmit={handleSubmit}
                onCancel={() => setOpen(false)}
                pending={pending}
              />
            </div>
          </div>
      </Dialog>
    </>
  )
}

// ── Delete button (confirm-in-place) ──────────────────────────────────────────

export function DeleteItemButton({ id, name }: { id: string; name: string }) {
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteStoreItem(id)
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to delete item.')
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
          className="rounded px-2 py-1 text-meta font-semibold text-danger bg-danger-bg hover:bg-danger-bg/80 disabled:opacity-50 transition-colors"
        >
          {pending ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Delete'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded px-2 py-1 text-meta text-subtle hover:text-muted transition-colors"
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
