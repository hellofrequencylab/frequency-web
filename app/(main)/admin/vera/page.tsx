import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage } from '@/components/admin/admin-page'
import { getVeraConfig } from '@/lib/ai/vera/config'
import { createAdminClient } from '@/lib/supabase/admin'
import { saveVera, refreshFeatured, vetoFeatured } from './actions'

type FeaturedRow = {
  id: string
  body: string
  featured_at: string
  author_display_name: string | null
  author_handle: string | null
  author_avatar_url: string | null
}

async function getFeatured(): Promise<FeaturedRow[]> {
  const { data } = await createAdminClient().rpc('public_featured_posts', { _limit: 12 })
  return (data ?? []) as FeaturedRow[]
}

// Janitor-only: tune Vera — her style + live responses + the induction/funnel copy,
// no deploy needed (AI-VERA.md). Writes vera_config; read live by the loop + induction.
export const dynamic = 'force-dynamic'

const FIELD = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none'
const LABEL = 'block text-xs font-semibold uppercase tracking-wide text-subtle'

export default async function VeraAdminPage() {
  await requireAdmin('janitor')

  const [cfg, featured] = await Promise.all([getVeraConfig(), getFeatured()])
  const oaths = [0, 1, 2].map((i) => cfg.induction.oathLabels[i] ?? '')

  return (
    <AdminPage
      title="Manage Vera"
      eyebrow="Vera"
      description="Tune Vera’s voice, her live responses, and the founder-induction copy — saved instantly, no deploy."
      width="narrow"
    >
      <form action={saveVera} className="space-y-6">
      {/* Style + responses */}
      <section className="space-y-4 rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-bold text-text">Voice & responses</h2>
        <div>
          <label className={LABEL} htmlFor="styleNote">Style note (appended to her prompt)</label>
          <textarea id="styleNote" name="styleNote" rows={2} defaultValue={cfg.styleNote} className={`mt-1 ${FIELD}`} placeholder="e.g. Lean warmer this week; mention the Thursday gathering when relevant." />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={LABEL} htmlFor="register">Default register</label>
            <select id="register" name="register" defaultValue={cfg.register} className={`mt-1 ${FIELD}`}>
              <option value="cool">Cool (default)</option>
              <option value="hot">Hot (conviction)</option>
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="tier">Model</label>
            <select id="tier" name="tier" defaultValue={cfg.tier} className={`mt-1 ${FIELD}`}>
              <option value="haiku">Haiku (fast/cheap)</option>
              <option value="sonnet">Sonnet (sharper)</option>
              <option value="opus">Opus (richest)</option>
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="maxReplyChars">Max reply (chars)</label>
            <input id="maxReplyChars" name="maxReplyChars" type="number" min={80} max={2000} defaultValue={cfg.maxReplyChars} className={`mt-1 ${FIELD}`} />
          </div>
        </div>
        <div>
          <label className={LABEL} htmlFor="greeting">Opening greeting</label>
          <textarea id="greeting" name="greeting" rows={2} defaultValue={cfg.greeting} className={`mt-1 ${FIELD}`} />
        </div>
      </section>

      {/* Induction / funnel copy */}
      <section className="mt-6 space-y-4 rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-bold text-text">Founder induction copy</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="oathHeading">Oath heading</label>
            <input id="oathHeading" name="oathHeading" defaultValue={cfg.induction.oathHeading} className={`mt-1 ${FIELD}`} />
          </div>
          <div>
            <label className={LABEL} htmlFor="introHeading">Welcome heading</label>
            <input id="introHeading" name="introHeading" defaultValue={cfg.induction.introHeading} className={`mt-1 ${FIELD}`} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="oathBody">Oath body</label>
            <textarea id="oathBody" name="oathBody" rows={3} defaultValue={cfg.induction.oathBody} className={`mt-1 ${FIELD}`} />
          </div>
          <div>
            <label className={LABEL} htmlFor="introBody">Welcome body</label>
            <textarea id="introBody" name="introBody" rows={3} defaultValue={cfg.induction.introBody} className={`mt-1 ${FIELD}`} />
          </div>
        </div>
        <div>
          <label className={LABEL}>The three oaths</label>
          <div className="mt-1 space-y-2">
            {oaths.map((v, i) => (
              <input key={i} name={`oath${i}`} defaultValue={v} className={FIELD} />
            ))}
          </div>
        </div>
        <div>
          <label className={LABEL} htmlFor="heardAbout">&ldquo;How did you hear about us?&rdquo; options (one per line)</label>
          <textarea id="heardAbout" name="heardAbout" rows={5} defaultValue={cfg.induction.heardAbout.join('\n')} className={`mt-1 ${FIELD}`} />
        </div>
      </section>

      <div className="mt-6 flex items-center gap-3">
        <button type="submit" className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover">
          Save Vera
        </button>
        <span className="text-xs text-subtle">Changes apply to new conversations immediately.</span>
      </div>
      </form>

      {/* Featured splash feed — Vera auto-curates, janitor can veto */}
      <section className="mt-6 space-y-4 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-text">Splash feed: people showing up for each other</h2>
            <p className="mt-0.5 text-xs text-muted">
              Vera picks the warmest recent posts for the public home page. Refresh to re-curate; veto any pick to drop it.
            </p>
          </div>
          <form action={refreshFeatured}>
            <button type="submit" className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text shadow-sm transition-colors hover:bg-surface-elevated">
              Refresh featured posts
            </button>
          </form>
        </div>

        {featured.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs text-subtle">
            Nothing featured yet. The home page falls back to the latest public posts until Vera curates a set.
          </p>
        ) : (
          <ul className="space-y-2">
            {featured.map((post) => (
              <li key={post.id} className="flex items-start gap-3 rounded-lg border border-border bg-surface-elevated px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-text">
                    {post.author_display_name ?? 'Community member'}
                    {post.author_handle && <span className="font-normal text-subtle"> @{post.author_handle}</span>}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted">{post.body}</p>
                </div>
                <form action={vetoFeatured} className="shrink-0">
                  <input type="hidden" name="postId" value={post.id} />
                  <button type="submit" className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-danger-bg hover:text-danger">
                    Veto
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminPage>
  )
}
