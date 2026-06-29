'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Settings, X, Check, Loader2, Sparkles, ExternalLink, UserCog,
} from 'lucide-react'
import { moderateUpdateProfile } from './actions'
import {
  toggleSpotlightEnabled,
  resetSpotlightToDefault,
  forceUnpublishSpotlight,
} from '@/app/(main)/admin/members/spotlight-actions'

// The one staff/operator control on a member's profile. Replaces the old "Edit (mod)"
// popup + "Manage account" link with a single Settings button that opens a side drawer:
// the member's editable profile fields, the Spotlight admin controls, and a deep link
// to full account management. Each server action re-checks its own capability.
export function ProfileSettingsDrawer({
  profileId,
  handle,
  initialName,
  initialBio,
  spotlightEnabled,
  spotlightPublished,
  canModerate,
  isJanitor,
}: {
  profileId: string
  handle: string
  initialName: string
  initialBio: string
  spotlightEnabled: boolean
  spotlightPublished: boolean
  canModerate: boolean
  isJanitor: boolean
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(initialName)
  const [bio, setBio] = useState(initialBio)
  const [spotOn, setSpotOn] = useState(spotlightEnabled)
  const [status, setStatus] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function flash(msg: string) {
    setStatus(msg)
    setTimeout(() => setStatus(null), 2500)
  }
  function run(fn: () => Promise<unknown>, ok: string) {
    start(async () => {
      try { await fn(); flash(ok) }
      catch (err) { flash(`Error: ${err instanceof Error ? err.message : String(err)}`) }
    })
  }

  function saveProfile() {
    start(async () => {
      const res = await moderateUpdateProfile(profileId, { displayName: name, bio })
      flash(res.ok ? 'Profile saved' : res.error ?? 'Could not save')
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
      >
        <Settings className="h-3.5 w-3.5" /> Settings
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[150] bg-black/30" onClick={() => setOpen(false)} aria-hidden />
          <aside className="fixed right-0 top-0 z-[160] flex h-full w-80 max-w-[92vw] flex-col overflow-y-auto border-l border-border bg-surface shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface px-4 py-3">
              <p className="text-sm font-bold text-text">Member settings</p>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted hover:text-text">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-6 p-4">
              {status && (
                <p className="rounded-lg bg-success-bg/40 px-3 py-2 text-xs font-medium text-success">{status}</p>
              )}

              {/* Profile (name + bio) — the old "Edit (mod)" */}
              {canModerate && (
                <section className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Profile</p>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Display name"
                    className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-border-strong focus:outline-none"
                  />
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Bio"
                    rows={3}
                    className="w-full resize-y rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-border-strong focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={saveProfile}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
                  >
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Save profile
                  </button>
                </section>
              )}

              {/* Spotlight admin controls (janitor) */}
              {isJanitor && (
                <section className="space-y-2 border-t border-border pt-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
                    <Sparkles className="h-3.5 w-3.5" /> Spotlight page
                  </p>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(async () => { await toggleSpotlightEnabled(profileId, !spotOn); setSpotOn(!spotOn) }, spotOn ? 'Spotlight turned off' : 'Spotlight turned on')}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors disabled:opacity-50 ${spotOn ? 'border-success/40 text-success hover:bg-success-bg/30' : 'border-border text-text hover:bg-surface-elevated'}`}
                  >
                    {spotOn ? 'Spotlight is on — turn off' : 'Turn on Spotlight'}
                  </button>
                  {spotOn && (
                    <>
                      {spotlightPublished && (
                        <Link href={`/spotlight/${handle}`} target="_blank" className="block text-xs font-medium text-primary-strong hover:underline">
                          View published page →
                        </Link>
                      )}
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => forceUnpublishSpotlight(profileId), 'Spotlight unpublished')}
                        className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
                      >
                        Unpublish page
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => resetSpotlightToDefault(profileId), 'Spotlight reset to default')}
                        className="w-full rounded-lg border border-warning/40 px-3 py-2 text-left text-sm font-medium text-warning transition-colors hover:bg-warning-bg/30 disabled:opacity-50"
                      >
                        Reset to default
                      </button>
                    </>
                  )}
                </section>
              )}

              {/* Full account management deep-link — the old "Manage account" */}
              <section className="space-y-2 border-t border-border pt-4">
                <Link
                  href={`/admin/members?q=${encodeURIComponent(handle)}&member=${profileId}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-strong hover:underline"
                >
                  <UserCog className="h-4 w-4" /> Full account management
                  <ExternalLink className="h-3 w-3" />
                </Link>
                <p className="text-xs text-muted">Role, activate/deactivate, delete, gems &amp; zaps.</p>
              </section>
            </div>
          </aside>
        </>
      )}
    </>
  )
}
