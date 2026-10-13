import Link from 'next/link'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { MembersBody } from '@/components/frequency/members/shared/members-body'
import type { HelpCategory, HelpSearchEntry } from '@/lib/help/content'
import { helpHref } from '@/lib/help/content'
import { HelpSearchPill } from './help-search-pill'

// THE HELP ENTRY under Frequency (design_handoff/frequency/templates/members/Help.html): "How can we
// help?", a search pill, the topics as panels, common questions, and a door to a person. Everything
// is the help centre's own content (content/help/, read by lib/help/content): the topics are its
// categories, the questions are each topic's lead article with its own summary, and every link goes
// into the existing article pages. No answer is written here.

const TOPIC_ICON: Record<string, FqIconName> = {
  'getting-started': 'home',
  'find-your-people': 'compass',
  connecting: 'contacts',
  groups: 'circle',
  spaces: 'space',
  'the-quest': 'standing',
  sharing: 'share',
  leading: 'host',
  membership: 'membership',
  safety: 'shield',
}

export function HelpBody({ categories, index }: { categories: HelpCategory[]; index: HelpSearchEntry[] }) {
  const questions = categories
    .map((c) => ({ category: c, article: c.articles[0] }))
    .filter((q) => !!q.article)
    .slice(0, 6)

  return (
    <MembersBody className="mc-narrow">
      <div className="stack mc-gap-16 mc-center mc-text-center">
        <span className="k">Help</span>
        <h1 className="h1">
          How can we <span className="serif">help?</span>
        </h1>
        <HelpSearchPill index={index} />
      </div>

      {categories.length === 0 ? (
        <div className="empty sec">
          <p className="why">Help articles are coming soon.</p>
        </div>
      ) : (
        <div className="g3 sec">
          {categories.map((c) => (
            <Link key={c.slug} className="panel stack mc-gap-10" href={`/help/${c.slug}`}>
              <span className="ic">
                <FqIcon name={TOPIC_ICON[c.slug] ?? 'help'} />
              </span>
              <span className="t1">{c.title}</span>
              {c.description && <span className="t2">{c.description}</span>}
            </Link>
          ))}
        </div>
      )}

      {questions.length > 0 && (
        <div className="sec" id="faq">
          <span className="h2">Common questions</span>
          <div className="mc-top-12">
            {questions.map(({ category, article }) => (
              <details key={`${category.slug}/${article.slug}`} className="mc-faq">
                <summary className="t1">
                  {article.title}
                  <span className="t2" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="body mc-faq-body">{article.description}</p>
                <Link className="btn sm mc-top-12" href={helpHref(category.slug, article.slug)}>
                  Read the guide
                </Link>
              </details>
            ))}
          </div>
        </div>
      )}

      <div className="soft row wrap sec mc-between">
        <span className="stack mc-gap-6">
          <span className="h3">Still stuck?</span>
          <span className="t2">Send us a note. A person reads every one.</span>
        </span>
        <Link className="btn pa" href="/support">
          Message support
        </Link>
      </div>
    </MembersBody>
  )
}
