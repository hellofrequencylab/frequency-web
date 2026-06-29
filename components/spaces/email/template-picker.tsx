'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, fieldClasses } from '@/components/ui/field'
import {
  createSpaceEmailTemplate,
  deleteSpaceEmailTemplate,
} from '@/lib/spaces/email-templates-actions'
import { isError } from '@/lib/action-result'
import { cn } from '@/lib/utils'

// TEMPLATE PICKER (ADR-380). Lets the owner reuse a saved subject + body: pick a template to PREFILL
// the composer (onLoadTemplate(subject, body) sets the composer's state), save the current draft as a
// new named template, and delete a template. All writes go through canEditProfile-gated server actions.
//
// Copy passes CONTENT-VOICE: plain, concrete, no narrated feelings, no em/en dashes.

export function TemplatePicker({
  spaceId,
  slug,
  templates,
  currentSubject,
  currentBody,
  onLoadTemplate,
  disabled = false,
}: {
  spaceId: string
  slug: string
  /** The saved templates for this Space (resolved server-side). */
  templates: { id: string; name: string; subject: string; body: string }[]
  /** The composer's current subject + body (saved as a new template). */
  currentSubject: string
  currentBody: string
  /** Prefill the composer with a chosen template's subject + body. */
  onLoadTemplate: (subject: string, body: string) => void
  disabled?: boolean
}) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState('')
  const [newName, setNewName] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleLoad(id: string) {
    setSelectedId(id)
    setError(null)
    const t = templates.find((x) => x.id === id)
    if (t) onLoadTemplate(t.subject, t.body)
  }

  function handleSave() {
    const name = newName.trim()
    if (!name || disabled || pending) return
    setError(null)
    start(async () => {
      const res = await createSpaceEmailTemplate(spaceId, slug, name, currentSubject, currentBody)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setNewName('')
      router.refresh()
    })
  }

  function handleDelete() {
    if (!selectedId || disabled || pending) return
    setError(null)
    start(async () => {
      const res = await deleteSpaceEmailTemplate(spaceId, slug, selectedId)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setSelectedId('')
      router.refresh()
    })
  }

  const selected = selectedId ? templates.find((t) => t.id === selectedId) : null

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div>
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-text">
          <FileText className="h-4 w-4 text-subtle" aria-hidden /> Templates
        </p>
        <p className="mt-0.5 text-xs text-muted">
          Load a saved message into the composer, or save what you have written to reuse later.
        </p>
      </div>

      {templates.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Load a template</span>
            <select
              value={selectedId}
              disabled={disabled}
              onChange={(e) => handleLoad(e.target.value)}
              className={cn(fieldClasses, 'max-w-xs')}
            >
              <option value="">Pick a template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          {selected && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={disabled || pending}
              className="inline-flex items-center gap-1.5 pb-2 text-xs font-medium text-muted hover:text-danger disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete &ldquo;{selected.name}&rdquo;
            </button>
          )}
        </div>
      )}

      {!disabled && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Save this draft as a template</span>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name this template"
              maxLength={80}
              className="max-w-xs"
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleSave}
            disabled={!newName.trim() || pending}
          >
            <Save className="h-3.5 w-3.5" aria-hidden /> Save template
          </Button>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
