'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { Toggle } from '@/components/admin/toggle'
import { getProfileRailData } from '@/app/(main)/settings/rail-getters'
import { setMySpotlightEnabled, setSpotlightPublished } from '@/app/(main)/settings/profile/actions'

// Personal "You" module (ADR-515 Phase 2): a CONDENSED Spotlight section for the admin rail. The big
// Spotlight block (theme, classic builder) stays on /settings/profile; here the rail carries only the
// essentials — a microtoggle to turn it on, a publish microtoggle, and a jump to the block editor. A THIN
// wrapper: it self-fetches read-gated getProfileRailData and reuses the EXISTING setMySpotlightEnabled /
// setSpotlightPublished actions (each re-checks auth + ownership server-side). The rail supplies the title.
// Fail-safe: getProfileRailData returns null when signed out; a member who cannot enable Spotlight sees
// nothing, so the section never nudges a member who lacks it.

type Data = NonNullable<Awaited<ReturnType<typeof getProfileRailData>>>

export function PersonalSpotlightModule() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [published, setPublished] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
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

  async function toggleEnable(next: boolean) {
    setPending(true)
    setSaveState('saving')
    setError('')
    try {
      await setMySpotlightEnabled(next)
      setEnabled(next)
      if (!next) setPublished(false) // disabling also unpublishes (the server does the same)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 1500)
    } catch (err) {
      setSaveState('idle')
      setError(err instanceof Error ? err.message : 'Could not update your Spotlight.')
    } finally {
      setPending(false)
    }
  }

  async function togglePublish(next: boolean) {
    setPending(true)
    setSaveState('saving')
    setError('')
    try {
      await setSpotlightPublished(next)
      setPublished(next)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 1500)
    } catch (err) {
      setSaveState('idle')
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
      <div className="space-y-3 rounded-2xl border border-border bg-surface-elevated/40 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 text-sm text-text">Show your Spotlight page</span>
          <Toggle
            checked={enabled}
            onChange={toggleEnable}
            ariaLabel="Show your Spotlight page"
            saveState={enabled === data.initial.spotlightEnabled ? 'idle' : saveState}
            disabled={pending}
          />
        </div>

        {enabled && (
          <>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="min-w-0 text-sm text-text">
                Published <span className="text-subtle">{published ? '' : '(draft only)'}</span>
              </span>
              <Toggle
                checked={published}
                onChange={togglePublish}
                ariaLabel="Publish your Spotlight page"
                saveState={saveState}
                disabled={pending}
              />
            </div>

            {handle && (
              <Link
                href={`/people/${handle}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover motion-reduce:transition-none"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> Build your page
              </Link>
            )}
          </>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
    </section>
  )
}
