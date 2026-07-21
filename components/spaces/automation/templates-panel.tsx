'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Plus, UserPlus, Hand } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { SPACE_AUTOMATION_TEMPLATES } from '@/lib/spaces/automation-types'
import { instantiateAutomationTemplate } from '@/lib/spaces/automation-actions'

// TEMPLATES PANEL (ADR-796). One-tap pre-built sequences that replace the retired blank-canvas Rules
// builder. Adding one creates a real drip sequence (created OFF, so the operator reviews the steps below
// before it sends) plus, for a triggered template, the rule that auto-enrolls the matching member. A
// template already added (its sequence name is present) reads "Added" and cannot be added twice. A staff
// preview is read-only. Client component over the static catalog; the mutation calls a gated server
// action then refreshes so the new sequence appears in the panel below. No em/en dashes.

export function TemplatesPanel({
  spaceId,
  slug,
  existingSequenceNames,
  readOnly = false,
}: {
  spaceId: string
  slug: string
  /** The names of sequences this Space already has, so an added template shows as "Added". */
  existingSequenceNames: string[]
  readOnly?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const added = new Set(existingSequenceNames)

  function onAdd(templateId: string) {
    if (readOnly || pending) return
    setError(null)
    setNotice(null)
    setBusyId(templateId)
    start(async () => {
      const res = await instantiateAutomationTemplate(spaceId, slug, templateId)
      setBusyId(null)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setNotice('Added. Review the steps below, then turn the sequence on to go live.')
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SPACE_AUTOMATION_TEMPLATES.map((t) => {
          const isAdded = added.has(t.name)
          const Icon = t.triggerEvent ? UserPlus : Hand
          return (
            <li
              key={t.id}
              className="flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="text-sm font-semibold text-text">{t.title}</span>
              </div>
              <p className="flex-1 text-xs text-muted">{t.description}</p>
              <span className="mt-3 inline-flex w-fit items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-medium text-subtle">
                {t.triggerEvent ? 'Sends on join' : 'Manual start'}
              </span>
              <div className="mt-3">
                {isAdded ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                    <Check className="h-3.5 w-3.5" aria-hidden /> Added
                  </span>
                ) : (
                  !readOnly && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onAdd(t.id)}
                      disabled={pending}
                    >
                      {pending && busyId === t.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="h-4 w-4" /> Add
                        </>
                      )}
                    </Button>
                  )
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {error && <p className="text-sm text-danger">{error}</p>}
      {notice && <p className="text-sm text-muted">{notice}</p>}
    </div>
  )
}
