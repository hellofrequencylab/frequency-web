import { getJanitor } from '@/lib/page-editor/guard'
import { listPages } from '@/lib/page-editor/data'
import { pageIndexSection, type PageIndexSection } from '@/lib/pages/index-catalog'
import { SectionHeader } from '@/components/ui/section-header'
import { PageIndexTable } from './page-index-table'

// The three PUBLIC lists of the Pages workspace (Site pages, Lead and SEO pages, System pages), one
// self-fetching, zero-prop RSC each, bound in lib/widgets/registry.tsx and arranged by the on-page
// Layout editor. Every operator (admin+) sees every list, so any page is findable from here; only a
// janitor gets the Edit buttons, and only on rows whose body the block editor really produces (the
// catalog's `editor`, lib/pages/index-catalog.ts). The publish status is read once per list from the
// `pages` table; a list with no block-editor row skips the read.

async function PublicList({ section }: { section: PageIndexSection }) {
  const janitor = await getJanitor()
  const hasBlocks = section.pages.some((p) => p.editor === 'blocks')
  const rows = hasBlocks ? await listPages() : {}
  return (
    <section>
      <SectionHeader title={section.title} count={section.pages.length} />
      <p className="-mt-1 mb-4 max-w-2xl text-body-sm text-muted">{section.description}</p>
      <PageIndexTable pages={section.pages} rows={rows} canEdit={janitor !== null} />
    </section>
  )
}

export async function PagesSite() {
  return <PublicList section={pageIndexSection('site')} />
}

export async function PagesLeadSeo() {
  return <PublicList section={pageIndexSection('lead')} />
}

export async function PagesSystem() {
  return <PublicList section={pageIndexSection('system')} />
}
