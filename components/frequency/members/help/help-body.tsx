import Link from 'next/link'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { MembersBody } from '@/components/frequency/members/shared/members-body'
import type { HelpCategory, HelpSearchEntry } from '@/lib/help/content'
import { helpHref } from '@/lib/help/content'
import { HelpSearchPill } from './help-search-pill'
import { SupportButton } from './support-button'

// THE MEMBER HELP PANEL under Frequency (design_handoff/frequency/templates/members/Help.html): "How
// can we help?", a search pill, the topics as panels, common questions, the member's own reports, and a
// door to a person. Mounted at /support, inside the member shell: /help is the PUBLIC help centre (the
// site kit's FrequencyHelp, with the marketing chrome), so a signed-in member asking for help no longer
// has to leave the app to get it, and their report history (the real feature /support always was) sits
// under the same roof. Everything is the help centre's own content (content/help/, read by
// lib/help/content): the topics are its categories, the questions are each topic's lead article with
// its own summary, and every link goes into the existing article pages. No answer is written here.

interface HelpReport {
  id: string
  ref: string | number
  subject: string
  status: string
  statusLabel: string
  typeLabel: string
  updated: string
}

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

export function HelpBody({
  categories,
  index,
  reports,
}: {
  categories: HelpCategory[]
  index: HelpSearchEntry[]
  /** The member's own support reports, newest activity first. */
  reports: HelpReport[]
}) {
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

      {reports.length > 0 && (
        <div className="sec" id="reports">
          <div className="sec-h">
            <span className="h2">Your reports</span>
            <span className="meta">
              {reports.length} sent
            </span>
          </div>
          <div className="list">
            {reports.map((r) => (
              <Link key={r.id} href={`/support/${r.id}`}>
                <span className="ic">
                  <FqIcon name={r.status === 'resolved' || r.status === 'closed' ? 'check' : 'message'} />
                </span>
                <span className="grow">
                  <span className="t1 mc-block">{r.subject}</span>
                  <span className="t2">
                    {r.typeLabel} · #{r.ref} · Updated {r.updated}
                  </span>
                </span>
                <span className={r.status === 'waiting' ? 'tag live' : 'tag'}>{r.statusLabel}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="soft row wrap sec mc-between">
        <span className="stack mc-gap-6">
          <span className="h3">Still stuck?</span>
          <span className="t2">Send us a note. A person reads every one, and the reply lands here.</span>
        </span>
        <span className="row wrap mc-gap-8">
          <SupportButton type="bug" label="Report a bug" icon="flag" className="btn" />
          <SupportButton />
        </span>
      </div>
    </MembersBody>
  )
}
