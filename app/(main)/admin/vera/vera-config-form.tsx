'use client'

import { FormSection } from '@/components/admin/form-section'
import { Button } from '@/components/ui/button'
import { saveVera, refreshFeatured, vetoFeatured } from './actions'
import type { VeraConfig, FeaturedRow } from './load-vera'

// Presentational "Manage Vera" suite shared by the /admin/vera Settings page and the
// in-place Platform·Vera module (ADR-149). The config form is a native
// `<form action={saveVera}>` of uncontrolled fields — saveVera rewrites the whole config
// from this FormData, so the form MUST carry every field. The declarative fields
// explicit-save (one "Save Vera" button); the splash-feed section keeps its own
// imperative refresh/veto controls. Grouped with the kit's annotated FormSection.

const FIELD = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-border-strong focus:outline-none'
const LABEL = 'block text-xs font-semibold uppercase tracking-wide text-subtle'

export function VeraConfigForm({ cfg, featured }: { cfg: VeraConfig; featured: FeaturedRow[] }) {
  const oaths = [0, 1, 2].map((i) => cfg.induction.oathLabels[i] ?? '')

  return (
    <div>
      <form action={saveVera}>
        {/* Style + responses */}
        <FormSection
          title="Voice and responses"
          description="How Vera sounds in live conversation: her style note, register, model, reply length, and opening greeting."
        >
          <div className="space-y-4">
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
          </div>
        </FormSection>

        {/* Induction / funnel copy */}
        <FormSection
          title="Founder induction copy"
          description="The Beta Promise and welcome copy new founders read during induction, plus the 'how did you hear about us' options."
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor="oathHeading">Beta Promise heading</label>
                <input id="oathHeading" name="oathHeading" defaultValue={cfg.induction.oathHeading} className={`mt-1 ${FIELD}`} />
              </div>
              <div>
                <label className={LABEL} htmlFor="introHeading">Welcome heading</label>
                <input id="introHeading" name="introHeading" defaultValue={cfg.induction.introHeading} className={`mt-1 ${FIELD}`} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor="oathBody">Beta Promise body</label>
                <textarea id="oathBody" name="oathBody" rows={3} defaultValue={cfg.induction.oathBody} className={`mt-1 ${FIELD}`} />
              </div>
              <div>
                <label className={LABEL} htmlFor="introBody">Welcome body</label>
                <textarea id="introBody" name="introBody" rows={3} defaultValue={cfg.induction.introBody} className={`mt-1 ${FIELD}`} />
              </div>
            </div>
            <div>
              <label className={LABEL}>The three promises</label>
              <div className="mt-1 space-y-2">
                {oaths.map((v, i) => (
                  <input key={i} name={`oath${i}`} defaultValue={v} className={FIELD} aria-label={`Promise ${i + 1}`} />
                ))}
              </div>
            </div>
            <div>
              <label className={LABEL} htmlFor="heardAbout">&ldquo;How did you hear about us?&rdquo; options (one per line)</label>
              <textarea id="heardAbout" name="heardAbout" rows={5} defaultValue={cfg.induction.heardAbout.join('\n')} className={`mt-1 ${FIELD}`} />
            </div>
          </div>
        </FormSection>

        <div className="flex items-center gap-3 pt-6">
          <Button type="submit" className="shadow-sm">Save Vera</Button>
          <span className="text-xs text-subtle">Changes apply to new conversations immediately.</span>
        </div>
      </form>

      {/* Featured splash feed — Vera auto-curates, janitor can veto */}
      <FormSection
        title="Splash feed"
        description="Vera picks the warmest recent posts for the public home page. Refresh to re-curate; veto any pick to drop it (re-curating can bring it back)."
      >
        <div className="space-y-4">
          <form action={refreshFeatured}>
            <Button type="submit" variant="secondary" className="shadow-sm">Refresh featured posts</Button>
          </form>

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
                    <Button type="submit" variant="secondary" size="sm" className="hover:bg-danger-bg hover:text-danger">
                      Veto
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </FormSection>
    </div>
  )
}
