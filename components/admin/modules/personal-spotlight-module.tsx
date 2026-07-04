'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Sparkles } from 'lucide-react'
import { moduleById } from '@/lib/admin/modules/registry'
import { getProfileRailData } from '@/app/(main)/settings/rail-getters'
import { setMySpotlightEnabled, setSpotlightPublished } from '@/app/(main)/settings/profile/actions'

// Personal "You" module (ADR-515 Phase 2): a CONDENSED Spotlight section for the admin rail. The big
// Spotlight block (theme, classic builder) stays on /settings/profile; here the rail carries only the
// essentials — turn it on, jump to the block editor, and publish/unpublish. A THIN wrapper: it self-fetches
// the read-gated getProfileRailData (which already carries the spotlight flags + the handle) and reuses the
// EXISTING setMySpotlightEnabled / setSpotlightPublished actions (each re-checks auth + ownership server-
// side). Fail-safe: getProfileRailData returns null when signed out, and a member who cannot enable
// Spotlight (canEnableSpotlight === false) sees nothing, so the section never nudges a member who lacks it.

type Data = NonNullable<Awaited<ReturnType<typeof getProfileRailData>>>

export function PersonalSpotlightModule() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [published, setPublished] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    getProfileRailData().then((d) => {
      if (!active) return
      setData(d)
      if (d) {
        setEnabled(d.initial.spotlightEnabled)
        setPublished(d.initial.spotlightPublished)
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const mod = moduleById('account.spotlight')
  const Icon = mod?.Icon ?? Sparkles

  async function toggleEnable(next: boolean) {
    setPending(true)
    setError('')
    try {
      await setMySpotlightEnabled(next)
      setEnabled(next)
      if (!next) setPublished(false) // disabling also unpublishes (the server does the same)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your Spotlight.')
    } finally {
      setPending(false)
    }
  }

  async function togglePublish() {
    const next = !published
    setPending(true)
    setError('')
    try {
      await setSpotlightPublished(next)
      setPublished(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your Spotlight.')
    } finally {
      setPending(false)
    }
  }

  if (loading) {
    return <div className="h-24 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  // Signed out / no profile, or the member cannot enable Spotlight yet → no chrome (fail-safe).
  if (!data || !data.initial.canEnableSpotlight) return null

  const handle = data.initial.handle

  return (
    <section className="min-w-0 space-y-3">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text">
          <Icon className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
          {mod?.label ?? 'Spotlight'}
        </h3>
      </header>

      {!enabled ? (
        <div className="space-y-3 rounded-2xl border border-border bg-surface-elevated/40 p-4">
          <p className="text-sm text-muted">
            A shareable page that is all yours. Nothing goes public until you publish it.
          </p>
          <button
            type="button"
            onClick={() => toggleEnable(true)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50 motion-reduce:transition-none"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Turn on your Spotlight
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-border bg-surface-elevated/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                published ? 'bg-success-bg text-success' : 'bg-surface-elevated text-muted'
              }`}
            >
              {published ? 'Published' : 'Draft'}
            </span>
            <button
              type="button"
              onClick={togglePublish}
              disabled={pending}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 motion-reduce:transition-none ${
                published
                  ? 'border border-border-strong text-text hover:bg-surface-elevated'
                  : 'bg-primary text-on-primary hover:bg-primary-hover'
              }`}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {published ? 'Unpublish' : 'Publish'}
            </button>
          </div>

          {handle && (
            <Link
              href={`/people/${handle}/profile-preview/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover motion-reduce:transition-none"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Build your page
            </Link>
          )}
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </section>
  )
}
