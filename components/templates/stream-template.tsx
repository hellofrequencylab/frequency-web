// Stream template — the "feed" shell (PAGE-FRAMEWORK §3, Template A).
//
// One grammar for chronological/ranked streams (the home Feed, Broadcast, a
// Circle's discussion, a profile timeline): a title + description, an optional
// composer slot at the top, an optional sort/filter control, over the stream body.
//
// The header is the shared <PageHeading>, so streams read like every other page — or, when the
// stream opens on media rather than on a sentence, the `hero` band (see the union below).
//
// Presentational + server-friendly (no hooks).

import { PageHeading } from './page-heading'
import { PageAdminBar } from '@/components/layout/page-admin-bar'

/** Everything both header modes share. */
type StreamTemplateBase = {
  /** Composer / create-post slot rendered above the stream. */
  composer?: React.ReactNode
  /** One short line for the LEFT of the header's divider row, opposite the Settings control.
   *  Around You seats its at-a-glance counts there. */
  headingLead?: React.ReactNode
  children: React.ReactNode
}

/** THE TWO HEADER MODES, as a union rather than as a pile of optional props, so the compiler says
 *  what a comment otherwise has to: in `hero` mode the band owns the heading, and passing a title
 *  alongside it is a mistake (it would render nowhere) rather than a redundancy. */
type StreamTemplateProps = StreamTemplateBase &
  (
    | {
        /** A HEADER BAND that replaces the plain PageHeading: a PageHero (cover or live media,
         *  eyebrow + H1 + subtitle on the scrim). Around You opens on the map of what is around
         *  you (ADR-1034).
         *
         *  The band OWNS the page's `<h1>` and its own eyebrow / subtitle / actions, which is why
         *  those props are forbidden here — two h1s with the same text is the exact defect
         *  IndexTemplate's `heroOverlay` branch avoids the same way. Everything else is unchanged:
         *  the divider row still carries `headingLead` opposite the operator Settings control, so
         *  the counts line and the admin affordance survive the swap. */
        hero: React.ReactNode
        eyebrow?: never
        title?: never
        description?: never
        action?: never
        back?: never
        sort?: never
        inlineAction?: never
      }
    | {
        hero?: undefined
        /** Small contextual line above the title (e.g. today's date). Adds weight to thin headers. */
        eyebrow?: React.ReactNode
        title: React.ReactNode
        description?: React.ReactNode
        /** Header-right action, e.g. a create menu. */
        action?: React.ReactNode
        /** Back-link for a nested stream (e.g. a sub-page under a dashboard). */
        back?: { href: string; label: string }
        /** Sort/filter control shown on the header row (right side). Use when there's no `action`. */
        sort?: React.ReactNode
        /** Keep a COMPACT action beside the title on mobile (PageHeading.inlineActions). */
        inlineAction?: boolean
      }
  )

export function StreamTemplate({
  eyebrow,
  title,
  description,
  action,
  back,
  composer,
  sort,
  inlineAction = false,
  headingLead,
  hero,
  children,
}: StreamTemplateProps) {
  if (hero) {
    return (
      <div>
        <div className="mb-4 sm:mb-[calc(1.25rem*var(--structure-rhythm,1))]">{hero}</div>
        <PageAdminBar asDivider lead={headingLead} />
        {composer && <div className="mb-6">{composer}</div>}
        {children}
      </div>
    )
  }

  return (
    <div>
      <PageHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={action ?? sort}
        back={back}
        inlineActions={inlineAction}
        // A Stream opens on its heading, so the heading gets the hero role and the divider
        // comes off. DAWN's feed (ui_kits/app/index.html) puts the greeting straight above the
        // stream with no rule: the rule is what made the page read as a template with a header
        // bolted on rather than a page that starts with a sentence. The register belongs to the
        // template, so every Stream gets it — not just the feed.
        size="hero"
        divider={false}
        headingLead={headingLead}
      />
      {composer && <div className="mb-6">{composer}</div>}
      {children}
    </div>
  )
}
