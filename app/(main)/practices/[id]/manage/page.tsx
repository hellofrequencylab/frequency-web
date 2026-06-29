import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPracticeCapabilities } from '@/lib/core/load-capabilities'
import { surfacesFor } from '@/lib/admin/entities/registry'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { PracticeManageConsole } from './console'

// The practice OWNER CONSOLE (ADR-441 EM1-3). The unified `/{entity}/[id]/manage`
// surface, rolled onto practice from the circle template: the practice's owner (its
// creator), staff, or whoever manages its parent space manages it here. Pass 1 composes
// Basics from the existing settings module, which embeds its own DangerDelete (so the
// Danger surface is header-only, like circle).
//
// SECURITY: a Server Component gated server-side on `practice.editSettings` via the one
// resolver (getPracticeCapabilities → resolveCapabilities). A viewer who cannot manage
// this practice gets notFound(); every surface's mutation re-checks the SAME capability
// in its server action (the admin client bypasses RLS, so these gates are the authority).

export const metadata: Metadata = {
  title: 'Manage practice',
  description: 'Manage your practice: its basics and the danger zone.',
}

export default async function PracticeManagePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: practice } = await admin
    .from('practices')
    .select('id, title, category, duration_min')
    .eq('id', id)
    .maybeSingle()
  if (!practice) notFound()

  const caps = await getPracticeCapabilities(practice.id)
  const surfaces = surfacesFor('practice', caps)
  if (surfaces.length === 0) notFound()

  return (
    <DashboardTemplate
      eyebrow="Manage practice"
      title={practice.title}
      description="Your practice's settings in one place. Changes save as you make them and show up on the practice page."
      back={{ href: `/practices/${practice.id}`, label: 'Back to practice' }}
      width="default"
      stats={
        <>
          <StatCard label="Category" value={practice.category || 'Uncategorized'} />
          <StatCard
            label="Duration"
            value={practice.duration_min ? `${practice.duration_min} min` : '—'}
          />
        </>
      }
    >
      <PracticeManageConsole surfaces={surfaces} />
    </DashboardTemplate>
  )
}
