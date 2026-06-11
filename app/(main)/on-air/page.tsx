// On Air — the practice timer mini-app (ADR-229, docs/ON-AIR.md). A Focus
// surface (page-chrome 'none'): pick a practice, go on air, breathe, then the
// reveal pays out through the existing economy. The page only assembles the
// member's adopted practices + remembered setup; everything live is client.

import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMemberPractices } from '@/lib/practices'
import { DEFAULT_PREFS, type OnAirPrefs } from '@/lib/on-air'
import { FocusTemplate } from '@/components/templates'
import { OnAirSession, type OnAirPractice } from '@/components/on-air/session'

export const metadata: Metadata = {
  title: 'On Air',
  description: 'Your daily practice timer: breathe, log, and collect the day.',
}

export default async function OnAirPage({
  searchParams,
}: {
  searchParams: Promise<{ practice?: string }>
}) {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')
  const { practice: requested } = await searchParams

  const admin = createAdminClient()
  const [mine, { data: prof }, { data: todayLogs }] = await Promise.all([
    getMemberPractices(profileId),
    admin.from('profiles').select('meta').eq('id', profileId).maybeSingle(),
    admin
      .from('practice_logs')
      .select('practice_id')
      .eq('profile_id', profileId)
      .eq('logged_for', new Date().toISOString().slice(0, 10)),
  ])

  const loggedToday = new Set(
    ((todayLogs ?? []) as { practice_id: string | null }[])
      .map((l) => l.practice_id)
      .filter(Boolean) as string[],
  )
  const practices: OnAirPractice[] = mine.map((p) => ({
    id: p.id,
    title: p.title,
    loggedToday: loggedToday.has(p.id),
  }))

  const meta = (prof?.meta ?? {}) as Record<string, unknown>
  const stored = (meta.onAir ?? {}) as Partial<OnAirPrefs>
  const prefs: OnAirPrefs = {
    mode: stored.mode ?? DEFAULT_PREFS.mode,
    pattern: stored.pattern ?? DEFAULT_PREFS.pattern,
    minutes: stored.minutes ?? DEFAULT_PREFS.minutes,
  }

  const defaultPracticeId =
    requested && practices.some((p) => p.id === requested)
      ? requested
      : practices.find((p) => !p.loggedToday)?.id ?? null

  return (
    <FocusTemplate
      eyebrow="The Quest"
      title="On Air"
      description="The world can wait a few minutes. Breathe, log, collect the day."
      width="narrow"
      divider={false}
    >
      {practices.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-sm font-medium text-text">Nothing on your list yet.</p>
          <p className="mt-1 text-sm text-muted">
            Adopt a practice first; then this is where you do it.
          </p>
          <Link
            href="/practices"
            className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
          >
            Browse practices
          </Link>
        </div>
      ) : (
        <OnAirSession
          practices={practices}
          defaultPracticeId={defaultPracticeId}
          prefs={prefs}
        />
      )}
    </FocusTemplate>
  )
}
