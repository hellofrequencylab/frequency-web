'use client'

import { FormSection } from '@/components/admin/form-section'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { saveVera, refreshFeatured, vetoFeatured } from './actions'
import type { VeraConfig, FeaturedRow } from './load-vera'

// Presentational "Manage Vera" suite shared by the /admin/vera Settings page and the
// in-place Platform·Vera module (ADR-149). The config form is a native
// `<form action={saveVera}>` of uncontrolled fields — saveVera rewrites the whole config
// from this FormData, so the form MUST carry every field. The declarative fields
// explicit-save (one "Save Vera" button); the splash-feed section keeps its own
// imperative refresh/veto controls. Grouped with the kit's annotated FormSection.

// The label look this form already wore. Handed to `Field`, which owns the association, the
// spacing and the focus/invalid chrome that the hand-rolled FIELD string used to restate.
const LABEL = 'font-semibold uppercase tracking-wide text-subtle'

export function VeraConfigForm({ cfg, featured }: { cfg: VeraConfig; featured: FeaturedRow[] }) {
  return (
    <div>
      <form action={saveVera}>
        {/* Style + responses */}
        <FormSection
          title="Voice and responses"
          description="How Vera sounds in live conversation: her style note, register, model, reply length, and opening greeting."
        >
          <div className="space-y-4">
            <Field label="Style note (appended to her prompt)" labelClassName={LABEL}>
              <Textarea name="styleNote" rows={2} defaultValue={cfg.styleNote} placeholder="e.g. Lean warmer this week; mention the Thursday gathering when relevant." />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Default register" labelClassName={LABEL}>
                <Select name="register" defaultValue={cfg.register}>
                  <option value="cool">Cool (default)</option>
                  <option value="hot">Hot (conviction)</option>
                </Select>
              </Field>
              <Field label="Model" labelClassName={LABEL}>
                <Select name="tier" defaultValue={cfg.tier}>
                  <option value="haiku">Haiku (fast/cheap)</option>
                  <option value="sonnet">Sonnet (sharper)</option>
                  <option value="opus">Opus (richest)</option>
                </Select>
              </Field>
              <Field label="Max reply (chars)" labelClassName={LABEL}>
                <Input name="maxReplyChars" type="number" min={80} max={2000} defaultValue={cfg.maxReplyChars} />
              </Field>
            </div>
            <Field label="Opening greeting" labelClassName={LABEL}>
              <Textarea name="greeting" rows={2} defaultValue={cfg.greeting} />
            </Field>
          </div>
        </FormSection>

        {/* Induction / funnel copy */}
        <FormSection
          title="Founder induction copy"
          description="The welcome copy new members read during induction, plus the 'how did you hear about us' options."
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Welcome heading" labelClassName={LABEL}>
                <Input name="introHeading" defaultValue={cfg.induction.introHeading} />
              </Field>
              <Field label="Welcome body" labelClassName={LABEL}>
                <Textarea name="introBody" rows={3} defaultValue={cfg.induction.introBody} />
              </Field>
            </div>
            <Field label={<>&ldquo;How did you hear about us?&rdquo; options (one per line)</>} labelClassName={LABEL}>
              <Textarea name="heardAbout" rows={5} defaultValue={cfg.induction.heardAbout.join('\n')} />
            </Field>
          </div>
        </FormSection>

        <div className="flex items-center gap-3 pt-6">
          <Button type="submit" className="lift-1">Save Vera</Button>
          <span className="text-meta text-subtle">Changes apply to new conversations immediately.</span>
        </div>
      </form>

      {/* Featured splash feed — Vera auto-curates, janitor can veto */}
      <FormSection
        title="Splash feed"
        description="Vera picks the warmest recent posts for the public home page. Refresh to re-curate; veto any pick to drop it (re-curating can bring it back)."
      >
        <div className="space-y-4">
          <form action={refreshFeatured}>
            <Button type="submit" variant="secondary" className="lift-1">Refresh featured posts</Button>
          </form>

          {featured.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-meta text-subtle">
              Nothing featured yet. The home page falls back to the latest public posts until Vera curates a set.
            </p>
          ) : (
            <ul className="space-y-2">
              {featured.map((post) => (
                <li key={post.id} className="flex items-start gap-3 rounded-lg border border-border bg-surface-elevated px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-meta font-semibold text-text">
                      {post.author_display_name ?? 'Community member'}
                      {post.author_handle && <span className="font-normal text-subtle"> @{post.author_handle}</span>}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-body-sm text-muted">{post.body}</p>
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
