import type { ComponentConfig } from '@/lib/page-editor/types'
import { arr, area, block, cls, hrefOf, image, img, str, text, type Props } from './temple-kit-inner'

// ── The Temple Theme Kit inner-page blocks, group C (Programs) ─────────────────────────────────────────────
// Same family as groups A and B: tki-* classes, tokens only, scoped to the site render. The programs are cards the
// Space types in the editor (name, length, host, price, when it runs next). No enrolment, rating or seat count is
// seeded: those are the Space's own facts. The programs page itself (lessons, player) is the app's, not the kit's.

function ProgramsBlock({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) {
  const cards = arr(p.items)
    .map((x, i) => ({
      key: `program-${i}`, eyebrow: str(x.eyebrow), title: str(x.title), host: str(x.host), summary: str(x.summary), price: str(x.price), badge: str(x.badge),
      cover: img(x.image) ?? img(p.fallback), href: str(x.href) ? hrefOf(str(x.href), metadata) : null,
    }))
    .filter((c) => c.title)
  if (cards.length === 0) return null
  return (
    <section data-tki="programs" className={cls('tki-section tki-programs', pad, vis)}>
      <div className="tki-eyebrow tki-gatherings-count">{cards.length} {str(p.countLabel) || 'programs'}</div>
      <ul className="tki-cards tki-cards--three">
        {cards.map((c) => (
          <li key={c.key} className="tki-card">
            <div className={cls('tki-card-media', !c.cover && 'tki-card-media--bare')} style={c.cover ? { backgroundImage: `url(${JSON.stringify(c.cover)})` } : undefined} aria-hidden="true" />
            <div className="tki-card-body">
              {c.eyebrow && <div className="tki-eyebrow">{c.eyebrow}</div>}
              <h3 className="tki-card-title">{c.href ? <a href={c.href}>{c.title}</a> : c.title}</h3>
              {c.host && <div className="tki-card-place">{c.host}</div>}
              {c.summary && <p className="tki-card-summary">{c.summary}</p>}
              {(c.price || c.badge) && (
                <div className="tki-card-foot">
                  <span>{c.price}</span>
                  {c.badge && <span className="tki-badge tki-badge--soft">{c.badge}</span>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export const templeKitInnerCComponents: Record<string, ComponentConfig> = {
  TempleKitInnerPrograms: block('Temple programs', {
    countLabel: text('Word after the count'), fallback: image,
    items: {
      type: 'array', label: 'Programs',
      arrayFields: { eyebrow: text('Line above', 'Like: Breath, 6 weeks, 12 lessons.'), title: text('Name'), host: text('Taught by'), summary: area('What you leave with'), price: text('Price'), badge: text('Badge', 'Like: Next run starts 3 Feb.'), image, href: text('Link') },
    },
  }, { countLabel: 'programs', fallback: '', items: [] }, ProgramsBlock),
}
