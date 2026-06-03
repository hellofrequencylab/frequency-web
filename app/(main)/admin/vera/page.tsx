import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage } from '@/components/admin/admin-page'
import { getVeraConfig } from '@/lib/ai/vera/config'
import { saveVera } from './actions'

// Janitor-only: tune Vera — her style + live responses + the induction/funnel copy,
// no deploy needed (AI-VERA.md). Writes vera_config; read live by the loop + induction.
export const dynamic = 'force-dynamic'

const FIELD = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none'
const LABEL = 'block text-xs font-semibold uppercase tracking-wide text-subtle'

export default async function VeraAdminPage() {
  await requireAdmin('janitor')

  const cfg = await getVeraConfig()
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
    </AdminPage>
  )
}
