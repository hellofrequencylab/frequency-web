import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { getJanitor } from '@/lib/page-editor/guard'
import { listAllSequences } from '@/lib/onboarding/resolve-sequence'
import { SectionHeader } from '@/components/ui/section-header'

// Pages-workspace layout module for the SPLASH FUNNELS (the onboarding front door). Self-fetching,
// zero-prop RSC bound in lib/widgets/registry.tsx. Janitor-only: it returns null for a non-janitor
// admin. One card into the library, a live custom-funnel count, and a shortcut to the template
// every funnel is built from. Full lifecycle lives in the library at /pages/sequences.

export async function PagesSplashFunnels() {
  if (!(await getJanitor())) return null
  const customCount = (await listAllSequences()).filter((s) => s.source === 'custom').length

  return (
    <section>
      <SectionHeader
        title="Splash funnels"
        action={
          <Link
            href="/pages/sequences"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary-strong transition-colors hover:text-primary-hover"
          >
            Manage all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
      <Link
        href="/pages/sequences"
        className="group flex max-w-3xl items-center gap-4 rounded-2xl border border-primary/40 bg-primary-bg/60 p-5 shadow-sm transition-colors hover:border-primary"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-text">Splash Funnels</span>
          <span className="block text-sm leading-relaxed text-muted">
            The induction every new member walks through. Start from the template, tune a
            funnel for a specific audience, and watch the real flow update live.
          </span>
          <span className="mt-1.5 block text-xs font-medium text-subtle">
            {customCount === 0
              ? 'Just the template so far'
              : `${customCount} custom ${customCount === 1 ? 'funnel' : 'funnels'} plus the template`}
          </span>
        </span>
        <ArrowRight
          className="h-4 w-4 shrink-0 text-primary-strong transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
      <p className="mt-2 max-w-3xl text-xs text-subtle">
        Editing the{' '}
        <Link href="/pages/splash" className="font-semibold text-primary-strong hover:underline">
          Splash Funnel template
        </Link>{' '}
        updates the default flow and every new funnel built from it.
      </p>
    </section>
  )
}
