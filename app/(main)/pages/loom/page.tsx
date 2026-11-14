import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getJanitor } from '@/lib/page-editor/guard'
import { resolveSpaceId } from '@/lib/page-editor/data'
import { loomContext } from '@/lib/loom/functions/context'
import { LOOM_PRIMITIVES } from '@/lib/loom/functions/primitives'
import { loomFunctionsEnabled } from '@/lib/loom/functions/run'
import { validateLoomFunction } from '@/lib/loom/functions/validate'
import { listLoomFunctions } from '@/lib/loom/store'
import { AdminPage } from '@/components/admin/admin-page'
import { ComposerForm } from './composer-form'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Loom functions', robots: { index: false } }

// A known-good starting declaration: is a heading's text non-blank?
const STARTER = JSON.stringify(
  {
    id: 'heading-has-text',
    label: 'Heading has text',
    v: 1,
    input: 'block:heading',
    output: 'boolean',
    steps: [
      { id: 'clean', op: 'text.trim', args: { value: { field: 'text' } } },
      { id: 'blank', op: 'text.isEmpty', args: { value: { step: 'clean' } } },
      { id: 'shown', op: 'logic.not', args: { value: { step: 'blank' } } },
    ],
    result: 'shown',
  },
  null,
  2,
)

// THE LOOM COMPOSER (PROG-E9 part 3), dark. Off (and a 404) unless EDITOR_CANVAS is on, and then staff only. An
// operator writes a declaration as JSON data over the primitive list; the store validates it before it is kept.
// Each stored function is re-checked against today's primitives and block schemas, the same check the read side
// runs, so a function a later change broke shows as needing a fix.
export default async function LoomComposerPage({ searchParams }: { searchParams: Promise<{ space?: string | string[] }> }) {
  if (!loomFunctionsEnabled()) notFound()
  if (!(await getJanitor())) notFound()
  const { space } = await searchParams
  const spaceId = typeof space === 'string' && /^[0-9a-f-]{8,64}$/i.test(space) ? space.toLowerCase() : undefined
  const sid = await resolveSpaceId(spaceId)
  const stored = sid ? await listLoomFunctions(sid) : []
  const ctx = loomContext()

  return (
    <AdminPage
      title="Loom functions"
      eyebrow="Pages"
      description="Compose a function from the primitives below. Staff preview, switched on with EDITOR_CANVAS."
      width="wide"
    >
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-label="Compose" className="min-w-0 rounded-card border border-border bg-surface p-4">
          <h2 className="mb-3 text-lead font-semibold">Compose</h2>
          <ComposerForm spaceId={spaceId} starter={STARTER} />
        </section>
        <div className="min-w-0 space-y-6">
          <section aria-label="Saved functions" className="space-y-2">
            <h2 className="text-lead font-semibold">Saved functions</h2>
            {stored.length === 0 ? (
              <p className="text-body-sm text-muted">Nothing saved in this Space yet.</p>
            ) : (
              <ul className="space-y-2">
                {stored.map((f) => {
                  const holds = validateLoomFunction(f.declaration, ctx).ok
                  return (
                    <li key={f.id} className="rounded-card border border-border p-3">
                      <span className="block truncate text-body font-semibold">{f.slug}</span>
                      <span className="text-meta text-muted">
                        {f.surface} · version {f.version} · <span className={holds ? 'text-success' : 'text-danger'}>{holds ? 'Holds' : 'Needs a fix'}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
          <section aria-label="Primitives" className="space-y-2">
            <h2 className="text-lead font-semibold">Primitives</h2>
            <ul className="space-y-1 text-body-sm">
              {LOOM_PRIMITIVES.map((p) => (
                <li key={p.id}>
                  <code className="font-mono">{p.id}</code> <span className="text-muted">{p.label}. Takes {Object.entries(p.args).map(([n, k]) => `${n} (${k})`).join(', ')}; gives {p.returns}.</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </AdminPage>
  )
}
