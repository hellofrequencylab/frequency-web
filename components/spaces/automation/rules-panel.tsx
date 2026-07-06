'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input, Label, Textarea, fieldClasses } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/empty-state'
import { isError } from '@/lib/action-result'
import type { AudienceFilter } from '@/lib/spaces/audiences'
import {
  SPACE_AUTOMATION_TRIGGERS,
  type SpaceAutomationRule,
  type SpaceAutomationTrigger,
} from '@/lib/spaces/automation'
import {
  createSpaceRule,
  setSpaceRuleEnabled,
  deleteSpaceRule,
} from '@/lib/spaces/automation-actions'
import { AudienceSelect, audienceLabel } from './audience-select'

// RULES PANEL (R5). Create trigger -> action (email an audience) rules and toggle / delete them. Client
// component: it renders the server-fetched rules, and its create form / toggles / delete call the
// server actions (all gated on canEditProfile server-side) then refresh. A staff preview is read-only.
// Copy passes CONTENT-VOICE: plain labels, no narrated feelings, no em/en dashes.

const TRIGGER_LABEL: Record<SpaceAutomationTrigger, string> = {
  'contact.created': 'A new contact is added',
  'contact.tagged': 'A contact gets a tag',
  'deal.stage_changed': 'A contact moves pipeline stage',
  'member.joined': 'Someone joins a membership',
}

export function RulesPanel({
  spaceId,
  slug,
  rules,
  tags,
  segments,
  readOnly = false,
}: {
  spaceId: string
  slug: string
  rules: SpaceAutomationRule[]
  tags: string[]
  segments: { id: string; name: string }[]
  readOnly?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create-form state.
  const [name, setName] = useState('')
  const [trigger, setTrigger] = useState<SpaceAutomationTrigger>('contact.created')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<AudienceFilter>({})

  function resetForm() {
    setName('')
    setTrigger('contact.created')
    setSubject('')
    setBody('')
    setAudience({})
    setShowForm(false)
  }

  function onCreate() {
    if (readOnly || pending) return
    setError(null)
    start(async () => {
      const res = await createSpaceRule(spaceId, slug, {
        name,
        trigger,
        action: 'email_audience',
        config: { audience, subject, body },
      })
      if (isError(res)) {
        setError(res.error)
        return
      }
      resetForm()
      router.refresh()
    })
  }

  function onToggle(id: string, enabled: boolean) {
    if (readOnly || pending) return
    start(async () => {
      const res = await setSpaceRuleEnabled(spaceId, slug, id, enabled)
      if (isError(res)) setError(res.error)
      else router.refresh()
    })
  }

  function onDelete(id: string) {
    if (readOnly || pending) return
    start(async () => {
      const res = await deleteSpaceRule(spaceId, slug, id)
      if (isError(res)) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {rules.length === 0 && !showForm ? (
        <EmptyState
          icon={Workflow}
          title="No rules yet."
          description="Add a rule to send an email automatically when something happens in this space."
        />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text">{r.name}</p>
                <p className="truncate text-xs text-muted">
                  {TRIGGER_LABEL[r.triggerEvent]} → email {audienceLabel(r.config.audience, segments)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Switch
                  checked={r.enabled}
                  onCheckedChange={(v) => onToggle(r.id, v)}
                  disabled={readOnly || pending}
                  aria-label={r.enabled ? 'Turn rule off' : 'Turn rule on'}
                />
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => onDelete(r.id)}
                    disabled={pending}
                    className="text-muted transition-colors hover:text-danger disabled:opacity-50"
                    aria-label="Delete rule"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {!readOnly &&
        (showForm ? (
          <div className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="space-y-1">
              <Label htmlFor="rule-name">Name</Label>
              <Input
                id="rule-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Welcome new contacts"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="rule-trigger">When</Label>
              <select
                id="rule-trigger"
                className={fieldClasses}
                value={trigger}
                onChange={(e) => setTrigger(e.target.value as SpaceAutomationTrigger)}
              >
                {SPACE_AUTOMATION_TRIGGERS.map((t) => (
                  <option key={t} value={t}>
                    {TRIGGER_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>

            <AudienceSelect
              id="rule-audience"
              label="Send to"
              filter={audience}
              tags={tags}
              segments={segments}
              onChange={setAudience}
              disabled={pending}
            />

            <div className="space-y-1">
              <Label htmlFor="rule-subject">Email subject</Label>
              <Input
                id="rule-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Welcome to our community"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="rule-body">Email message</Label>
              <Textarea
                id="rule-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                placeholder="Write the email this rule sends. Blank lines become paragraphs."
              />
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={onCreate} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save rule'}
              </Button>
              <Button variant="ghost" onClick={resetForm} disabled={pending}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Add a rule
          </Button>
        ))}
    </div>
  )
}
