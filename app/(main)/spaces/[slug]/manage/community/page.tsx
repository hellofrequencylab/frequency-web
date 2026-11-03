import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Eye } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { consoleBackFor } from '@/lib/spaces/console-back'
import { readWallSettings } from '@/lib/spaces/community-wall'
import { ConsoleFocusTemplate } from '@/components/templates/console-templates'
import { buttonClasses } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { WallSettingsForm } from './wall-settings-form'
import { WallModerationRow } from './wall-moderation-controls'

// THE OWNER'S COMMUNITY WALL CONSOLE (ADR-1938, LIVE-2077). Two jobs: the wall's three settings
// (who reads, who posts, whether followers join in) and moderation of recent posts (pin, hide,
// bring back). Lives under /manage like every Space console, outside the (profile) group, so it
// never wears the profile chrome.
//
// GATE: notFound() for a missing or hidden Space and for a viewer who cannot edit it (no existence
// leak, the same owner-only pattern the other consoles use). Moderation writes run on the session
// client, so the posts policy decides; this page only lists what the viewer can already read.

export const metadata = { title: 'Community wall' }
export const dynamic = 'force-dynamic'

const RECENT = 25

type WallRow = {
  id: string
  body: string | null
  created_at: string
  is_pinned: boolean | null
  hidden_at: string | null
  author: { display_name: string | null } | null
}

export default async function ManageCommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.canEditProfile) notFound()

  const supabase = await createClient()
  const [settings, recent] = await Promise.all([
    readWallSettings(space.id),
    supabase
      .from('posts')
      .select('id, body, created_at, is_pinned, hidden_at, author:profiles!author_id ( display_name )')
      .eq('scope_space_id', space.id)
      .is('parent_id', null)
      .order('created_at', { ascending: false })
      .limit(RECENT),
  ])
  const posts = (recent.data ?? []) as unknown as WallRow[]

  return (
    <ConsoleFocusTemplate
      back={consoleBackFor(space, 'programs')}
      eyebrow={space.brandName ?? space.name}
      title="Community wall"
      description="Choose who reads and posts on your wall, and keep it the way you want it."
      actions={
        <Link href={`/spaces/${space.slug}/community`} className={buttonClasses('secondary', 'sm')}>
          <Eye className="h-4 w-4" aria-hidden />
          View the wall
        </Link>
      }
    >
      <div className="max-w-3xl space-y-8">
        <section aria-labelledby="wall-settings" className="rounded-card border border-border bg-surface p-5">
          <h2 id="wall-settings" className="mb-4 font-section text-lead font-bold text-text">
            Settings
          </h2>
          <WallSettingsForm slug={space.slug} initial={settings} />
        </section>

        <section aria-labelledby="wall-posts" className="space-y-3">
          <h2 id="wall-posts" className="font-section text-lead font-bold text-text">
            Recent posts
          </h2>
          {posts.length === 0 ? (
            <EmptyState
              title="Nothing posted yet"
              description="When your team or members post, each one shows up here so you can pin it or hide it."
            />
          ) : (
            <ul className="divide-y divide-border rounded-card border border-border bg-surface">
              {posts.map((p) => (
                <li key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-body-sm font-semibold text-text">
                      {p.author?.display_name ?? 'A member'}
                      {p.is_pinned ? <span className="ml-2 text-meta text-muted">Pinned</span> : null}
                      {p.hidden_at ? <span className="ml-2 text-meta text-muted">Hidden</span> : null}
                    </p>
                    <p className="line-clamp-2 text-body-sm text-muted">{p.body ?? ''}</p>
                  </div>
                  <WallModerationRow slug={space.slug} postId={p.id} pinned={!!p.is_pinned} hidden={!!p.hidden_at} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </ConsoleFocusTemplate>
  )
}
