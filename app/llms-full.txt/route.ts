import { getAllCategories, helpHref } from '@/lib/help/content'
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION, SITE_TAGLINE, CONTACT_EMAIL, FOUNDING_PLACE } from '@/lib/site'

// /llms-full.txt — the comprehensive, self-maintaining companion to the curated /llms.txt route
// (AIO, docs/CONTENT-VOICE §8). Where llms.txt is a hand-written brand summary, this dumps the
// full help-center content (every published article's title, URL, description, and body) so AI
// answer engines can ingest the real product documentation. Generated from the live help content
// at request time (ISR), so it never goes stale. Public, non-sensitive, server-rendered text.

export const revalidate = 3600

export async function GET() {
  const cats = await getAllCategories()

  const out: string[] = [
    `# ${SITE_NAME} — full content for language models`,
    '',
    `> ${SITE_DESCRIPTION} ${SITE_TAGLINE}. Taking root in ${FOUNDING_PLACE}. Contact: ${CONTACT_EMAIL}.`,
    '',
    `Curated short version: ${SITE_URL}/llms.txt`,
    '',
    '## Help center',
  ]

  for (const cat of cats) {
    out.push('', `### ${cat.title}`)
    if (cat.description) out.push(cat.description)
    for (const a of cat.articles) {
      out.push(
        '',
        `#### ${a.title}`,
        `${SITE_URL}${helpHref(cat.slug, a.slug)}`,
      )
      if (a.description) out.push(a.description)
      out.push('', a.body.trim())
    }
  }

  return new Response(out.join('\n') + '\n', {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
