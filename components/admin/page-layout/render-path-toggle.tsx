'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Switch } from '@/components/ui/switch'
import { setRenderPath } from '@/app/(main)/admin/page-layout/render-path-actions'

// One surface's node render path switch. Off is the old path; every flip is audited.
export function RenderPathToggle({ surface, label, enabled }: { surface: string; label: string; enabled: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-3">
      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-medium text-text">{label}</p>
        <p className="text-meta text-muted">{enabled ? 'On. Renders from the node tree.' : 'Off. Renders the saved layout as before.'}</p>
      </div>
      <Switch
        checked={enabled}
        pending={pending}
        aria-label={label}
        onCheckedChange={() => start(async () => { await setRenderPath(surface, !enabled); router.refresh() })}
      />
    </div>
  )
}
