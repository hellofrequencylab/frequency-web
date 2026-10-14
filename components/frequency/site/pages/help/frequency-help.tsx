// The /help front page BODY on the Frequency design (templates/website/Help.html): the search hero and
// topic tabs, the topics, plain-language policies and the contact band. The shell lane owns the kit
// root, the (help) chrome and FX.
//
// REAL CONTENT, REAL ROUTES. The topics are the content/help categories and every row links to its
// article at /help/<category>/<slug>, so the help center's articles, its search index and its routes
// are unchanged. The reference's hand-written answers are not reproduced: several described the old
// model (a free Space selling with a share taken), and the articles are the maintained answers.
import Link from 'next/link'
import '@/app/themes/active/site-pages-b'
import { CONTACT_EMAIL } from '@/lib/site'
import { HelpCenter, HelpContact, type HelpTopic } from './help-client'
import { hubLinks } from '@/components/frequency/members/shell/nav'

// The Help hub's children (the shell's HUB_LINKS). This page is statically generated, so it reads no
// viewer: only ungated children show, the way a signed-out reader would see them.
const HELP_CHILDREN = hubLinks('/help', { operatesSpaces: false, host: false })

export function FrequencyHelp({ topics }: { topics: HelpTopic[] }) {
  return (
    <>
      <HelpCenter topics={topics} />

      <section className="sec sec-next" id="policies" data-screen-label="03 Policies">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Policies</b>Plain summaries
            </div>
            <h2 className="h-l">Build circles, not walls.</h2>
          </div>
          <div className="hp-pol">
            <div className="pop" id="privacy">
              <span className="pglow" />
              <article className="pc">
                <span className="v">Privacy</span>
                <p>
                  Your contacts and your members are yours. We never sell them, and we only email you about things
                  you asked for.
                </p>
                <p>
                  <Link href="/privacy">Read the privacy policy →</Link>
                </p>
              </article>
            </div>
            <div className="pop" id="terms">
              <span className="pglow" />
              <article className="pc">
                <span className="v">Terms</span>
                <p>
                  Show up, be kind, and host honestly. Spaces set their own prices and refunds. We take a small
                  share only on people we bring you.
                </p>
                <p>
                  <Link href="/terms">Read the terms →</Link>
                </p>
              </article>
            </div>
            <div className="pop" id="accessibility">
              <span className="pglow" />
              <article className="pc">
                <span className="v">Accessibility</span>
                <p>
                  We build to WCAG 2.2 AA: keyboard navigation, readable contrast and reduced motion when you ask
                  for it. Tell us when we miss.
                </p>
                <p>
                  <a href="#contact">Tell us →</a>
                </p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="sec sec-next" id="contact" data-screen-label="04 Contact">
        <div className="wrap">
          <div className="band">
            <div>
              <span className="k">Still stuck?</span>
              <h3>Write to us.</h3>
              <p>A real person reads every message.</p>
              {HELP_CHILDREN.map((l) => (
                <p key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </p>
              ))}
            </div>
            <HelpContact email={CONTACT_EMAIL} />
          </div>
        </div>
      </section>
    </>
  )
}
