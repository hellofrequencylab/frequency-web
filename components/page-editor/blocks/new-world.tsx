import type { ReactNode } from "react";
import {
  ArrowRight,
  Award,
  Calendar,
  Check,
  Clock,
  Eye,
  Heart,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Sparkles,
  Star,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";
import { InlineText } from "@/components/sites/inline-text";
import {
  NewWorldContactForm,
  NewWorldLetterForm,
} from "@/components/sites/new-world-forms";
import type { ComponentConfig } from "@/lib/page-editor/types";
import type { SiteLinkMap } from "@/lib/sites/house-theme";
import { readNewWorldLive, type NewWorldLiveRow, type NewWorldWallPost } from "@/lib/sites/new-world-live";
import type { SpaceCircleItem, SpaceTeamMember } from "@/lib/spaces/content-data";
import type { SpaceProfileData } from "@/lib/spaces/profile-data";
import { storedWallClock } from "@/lib/sites/site-events";
import {
  LINK_HINT,
  VOICE_HINT,
  area,
  arr,
  block,
  cls,
  hrefOf,
  image,
  img,
  rel,
  str,
  text,
  type Common,
  type Props,
} from "./midnight";
import {
  DAYS,
  MONTHS,
  clock,
  eventHref,
  spaceOf,
  upcoming,
} from "./network-kit";

// ── The New World block family (LIVE-2055) ──────────────────────────────────────────────────
// New World's own sections, drawn from its design system (docs/design-systems/new-world; the reference is the zip's Web Theme.html,
// ui_kits/site/Sections.jsx and Blocks.jsx): the split hero with the "doors open this week" card and the neighbourhood strip, the
// numbers band, the story with its outlined numbers, the groups as a times list beside a feature card, the calendar with its week
// strip and date rows, the first-visit stepper, the regulars' words, the hosts, the ways in, the plans, the open spots, the gallery,
// the posts, how a first time goes, where to find us, the contact and letter forms, the questions, the tools and the closer.
//
// Server Components. Every look is the New World sheet's (components/sites/new-world-sections-css.ts), tokens only, scoped to
// [data-house-theme="new-world"], so these only ever dress the stand-alone site render (theme fence, ADR-1906). The kit's mixed
// registers come from the design's REG map: a block's Register is "auto" by default, which keeps the site's register except where the
// design turns a section to Commons (the regulars' words, the questions) or Stage (the closer); the owner can pin either.
//
// Live where the Space has the data (LIVE-2053): the hero card, the calendar, the open spots and the book page read the Space's
// upcoming events, the regulars' words read its reviews, the questions read its own answers, the hosts read its team, the groups read
// its circles, where-to-find-us reads its business info, and the plans, the shop and the posts read its memberships, its shop and its
// library through lib/sites/new-world-live.ts; with none, each shows the rows the owner wrote. A block for a function the Space has
// switched off renders nothing at all. A list with no rows says so in its own words and never draws an empty box.

const ICONS: Record<string, LucideIcon> = {
  users: Users,
  calendar: Calendar,
  check: Check,
  award: Award,
  tag: Tag,
  heart: Heart,
  phone: Phone,
  mail: Mail,
  clock: Clock,
  pin: MapPin,
  message: MessageSquare,
  star: Star,
  sparkle: Sparkles,
  eye: Eye,
};
const ICON_NAMES = Object.keys(ICONS);

function Icon({ name, tile = false, size = 16 }: { name: string; tile?: boolean; size?: number }) {
  const Glyph = ICONS[name] ?? Sparkles;
  const glyph = <Glyph size={size} strokeWidth={1.75} aria-hidden="true" />;
  return tile ? <i className="nw-tile">{glyph}</i> : glyph;
}

type Reg = "night" | "day" | undefined;
const regOf = (v: unknown, auto: Reg): Reg =>
  v === "night" || v === "day" ? v : auto;

function Sec({
  id,
  p,
  auto,
  className,
  glow = "tl",
  pad,
  vis,
  children,
}: {
  id?: string;
  p: Props;
  auto?: Reg;
  className?: string;
  glow?: "tl" | "tr" | "bl" | "br" | "top" | "none";
  pad?: string;
  vis?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      data-th={regOf(p.register, auto)}
      className={cls("nw-sec", glow !== "none" && `nw-sec--${glow}`, className, pad, vis)}
    >
      {children}
    </section>
  );
}

function Btn({
  label,
  href,
  kind = "accent",
  metadata,
  size,
  arrow = false,
  full = false,
}: {
  label: string;
  href: string;
  kind?: "accent" | "secondary" | "ghost";
  metadata?: Props;
  size?: "sm" | "lg";
  arrow?: boolean;
  full?: boolean;
}) {
  const to = label ? hrefOf(href, metadata) : null;
  if (!to) return null;
  return (
    <a
      className={cls("nw-btn", `nw-btn--${kind}`, size && `nw-btn--${size}`, full && "nw-btn--full")}
      href={to}
      {...rel(to)}
    >
      <span>{label}</span>
      {arrow && <ArrowRight size={size === "sm" ? 14 : 16} strokeWidth={2} aria-hidden="true" />}
    </a>
  );
}

function Stars() {
  return (
    <span className="nw-stars" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
        </svg>
      ))}
    </span>
  );
}

/** The row of round faces the design draws beside a count: decoration, never a photo of anyone. */
function Faces({ n = 5 }: { n?: number }) {
  return (
    <span className="nw-faces" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

function Eyebrow({ index, label }: { index?: string; label: string }) {
  if (!label) return null;
  return (
    <span className="nw-eyebrow">
      {index && (
        <>
          <b>{index}</b>
          <i aria-hidden="true" />
        </>
      )}
      {label}
    </span>
  );
}

/** The section head: index and label, the title with its italic, a lede, and an optional action beside it. */
function Head({ p, action, size }: { p: Props; action?: ReactNode; size?: "md" }) {
  if (!str(p.eyebrow) && !str(p.title) && !str(p.lede)) return null;
  return (
    <div className={cls("nw-head", size && `nw-head--${size}`)}>
      <div className="nw-head-copy">
        <Eyebrow index={str(p.index)} label={str(p.eyebrow)} />
        {str(p.title) && (
          <h2 className="nw-display">
            <InlineText text={str(p.title)} />
          </h2>
        )}
        {str(p.lede) && <p className="nw-lede">{str(p.lede)}</p>}
      </div>
      {action}
    </div>
  );
}

function Photo({ src, alt, label, className, children }: { src: string | null; alt: string; label?: string; className?: string; children?: ReactNode }) {
  return (
    <figure className={cls("nw-photo", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
        <img src={src} alt={alt} loading="lazy" />
      ) : (
        <>
          <i className="nw-dotgrid" aria-hidden="true" />
          {label && (
            <figcaption>
              <Eye size={15} strokeWidth={1.75} aria-hidden="true" />
              {label}
            </figcaption>
          )}
        </>
      )}
      {children}
    </figure>
  );
}

function Empty({ what }: { what: string }) {
  return <div className="nw-empty">No {what} yet. Add the first one and it appears here.</div>;
}

const two = (n: number) => String(n + 1).padStart(2, "0");

// ── The Space's own rows (LIVE-2053) ───────────────────────────────────────────────────────────
// Each reader returns the live rows shaped as the owner's rows, or [] when the bag has none, so every block keeps one render path.
// `appHref` turns an app-relative link into one that leaves the site for the app, the way eventHref does.
type LiveBag = { team?: SpaceTeamMember[]; community?: SpaceCircleItem[]; profile?: SpaceProfileData; booking?: { enabled: boolean; href: string | null } };
const bagOf = (metadata: Props | undefined) => (metadata?.space ?? undefined) as LiveBag | undefined;
const appHref = (path: string | null, metadata: Props | undefined): string | null => {
  if (!path) return null;
  const origin = (metadata?.links as SiteLinkMap | undefined)?.origin;
  return origin ? `${origin}${path}` : path;
};
const liveTeam = (metadata: Props | undefined): Props[] =>
  (bagOf(metadata)?.team ?? []).filter((m) => m.name?.trim()).map((m) => ({ name: m.name, role: m.role === "admin" ? "Host" : m.role === "moderator" ? "Moderator" : m.role === "editor" ? "Editor" : "", image: m.avatarUrl ?? "", alt: m.name, href: appHref(m.handle ? `/people/${m.handle}` : null, metadata) ?? "" }));
const liveGroups = (metadata: Props | undefined): Props[] =>
  (bagOf(metadata)?.community ?? [])
    .filter((c) => c.name?.trim())
    .map((c) => ({
      day: c.type === "online" ? "Online" : c.neighborhood ?? "",
      time: c.memberCap > 0 ? `${c.memberCount}/${c.memberCap}` : String(c.memberCount),
      name: c.name,
      body: c.about ?? "",
      people: c.memberCount > 0 ? `${c.memberCount} ${c.memberCount === 1 ? "member" : "members"}` : "",
      open: c.access !== "closed" && (c.memberCap <= 0 || c.memberCount < c.memberCap),
      href: `/circles/${c.slug}`,
    }));
/** Business info lines, one per line, as "Days: hours" rows; a line with no colon is a day with no hours written. */
const hoursRows = (hours: string | undefined): Props[] =>
  (hours ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const at = l.indexOf(":");
      return at > 0 ? { day: l.slice(0, at).trim(), time: l.slice(at + 1).trim() } : { day: l, time: "" };
    });
// App-relative links stay relative here: hrefOf prefixes the site origin for /spaces, /circles, /events and /market paths.
const liveRows = (rows: NewWorldLiveRow[]): Props[] =>
  rows.map((r) => ({ icon: "", meta: r.meta, name: r.name, title: r.name, kind: r.meta, body: r.body, price: r.price, image: r.image ?? "", alt: r.name, href: r.href ?? "", featured: r.featured, buttonLabel: "" }));
/** The live list for a function, or null when the render attached none (the owner's rows then draw). */
function liveList(metadata: Props | undefined, fn: "plans" | "shop" | "posts") {
  const live = readNewWorldLive(metadata?.space);
  return live ? live[fn] : null;
}
const lines = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(str).filter(Boolean) : []);

function Tap({ to, className, children, label }: { to: string | null; className: string; children: ReactNode; label?: string }) {
  return to ? (
    <a className={className} href={to} {...rel(to)} aria-label={label}>
      {children}
    </a>
  ) : (
    <div className={className}>{children}</div>
  );
}

/** Upcoming dated rows: the Space's own events when it has any, else the rows the owner wrote. */
interface Dated {
  mon: string;
  day: string;
  dow: string;
  title: string;
  body: string;
  time: string;
  where: string;
  spots: string;
  kind: string;
  href: string | null;
}
function dated(p: Props, metadata: Props | undefined, now: Date, count: number): Dated[] {
  const live = p.useEvents === false ? [] : upcoming(metadata, now).slice(0, count);
  if (live.length)
    return live.map((e) => {
      const d = storedWallClock(e.startsAt);
      return {
        mon: d ? MONTHS[d.getUTCMonth()] : "",
        day: d ? String(d.getUTCDate()).padStart(2, "0") : "",
        dow: d ? DAYS[d.getUTCDay()] : "",
        title: e.title,
        body: e.location ?? "",
        time: d ? clock(d) : "",
        where: e.priceLabel ?? "",
        spots: "",
        kind: "event",
        href: eventHref(e, metadata),
      };
    });
  return arr(p.rows)
    .slice(0, count)
    .map((r) => ({
      mon: str(r.mon),
      day: str(r.day),
      dow: str(r.weekday),
      title: str(r.title),
      body: str(r.body),
      time: str(r.time),
      where: str(r.where),
      spots: str(r.spots),
      kind: str(r.kind),
      href: hrefOf(str(r.href), metadata),
    }))
    .filter((r) => r.title);
}

// ── Home ─────────────────────────────────────────────────────────────────────────────────

function Hero({ p, metadata, now = new Date(), pad, vis }: Common) {
  const src = img(p.image);
  const next = dated(p, metadata, now, 3);
  const hoods = lines(p.areas);
  return (
    <section data-th={regOf(p.register, undefined)} className={cls("nw-hero", pad, vis)}>
      <div className="nw-hero-sky" aria-hidden="true" />
      <i className="nw-orb nw-orb--a" aria-hidden="true" />
      <div className="nw-hero-in">
        <div className="nw-hero-copy">
          <Eyebrow label={str(p.eyebrow)} />
          <h1 className="nw-display nw-lit">
            <InlineText text={str(p.title)} />
          </h1>
          {str(p.lead) && <p className="nw-hero-lead">{str(p.lead)}</p>}
          <div className="nw-actions">
            <Btn label={str(p.primaryLabel)} href={str(p.primaryHref)} metadata={metadata} size="lg" arrow />
            <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} metadata={metadata} kind="ghost" size="lg" />
          </div>
          {(str(p.proof) || str(p.aside)) && (
            <div className="nw-proof">
              <Faces />
              <span>
                {str(p.proof)}
                {str(p.proof) && str(p.aside) && " · "}
                {str(p.aside) && <em>{str(p.aside)}</em>}
              </span>
            </div>
          )}
        </div>
        <div className="nw-hero-art">
          <Photo src={src} alt={str(p.alt)} label="Your photo · a real night, real people" className="nw-photo--hero">
            {str(p.badge) && (
              <span className="nw-chip">
                <i className="nw-pulse" aria-hidden="true" />
                {str(p.badge)}
              </span>
            )}
          </Photo>
          {next.length > 0 && (
            <div className="nw-hero-card">
              {next.map((n, i) => (
                <Tap key={i} to={n.href} className={cls("nw-hero-row", i === 0 && "is-first")}>
                  <span className="nw-date">
                    <small>{n.mon}</small>
                    <b>{n.day}</b>
                  </span>
                  <span className="nw-hero-row-text">
                    <b>{n.title}</b>
                    <small>{n.time || n.body}</small>
                  </span>
                  {n.spots && <em>{n.spots}</em>}
                </Tap>
              ))}
            </div>
          )}
        </div>
      </div>
      {hoods.length > 0 && (
        <div className="nw-ticker" aria-hidden="true">
          <div className="nw-ticker-track">
            {[...hoods, ...hoods].map((h, i) => (
              <span key={i}>{h}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Stats({ p, pad, vis }: Common) {
  const items = arr(p.items).filter((t) => str(t.value) || str(t.label));
  if (items.length === 0) return null;
  return (
    <section data-th={regOf(p.register, undefined)} className={cls("nw-stats", pad, vis)}>
      <div className="nw-stats-in">
        {items.map((t, i) => (
          <div key={i} className="nw-stat">
            <span className="nw-stat-icon">
              <Icon name={str(t.icon)} size={18} />
            </span>
            <span className={cls("nw-display", str(t.label) ? "nw-stat-value" : "nw-stat-word")}>{str(t.value)}</span>
            {str(t.label) && <b>{str(t.label)}</b>}
            {str(t.note) && <small>{str(t.note)}</small>}
          </div>
        ))}
      </div>
      <i className="nw-glowline" aria-hidden="true" />
    </section>
  );
}

function Story({ p, metadata, pad, vis }: Common) {
  const paras = lines(p.paragraphs);
  return (
    <Sec id="story" p={p} glow="tl" pad={pad} vis={vis}>
      <div className="nw-wrap nw-cols nw-cols--7-5">
        <div className="nw-stack nw-stack--lg">
          <Eyebrow index={str(p.index)} label={str(p.eyebrow)} />
          <h2 className="nw-display nw-display--xl nw-break">
            <InlineText text={str(p.title)} />
          </h2>
          {paras.length > 0 && (
            <ol className="nw-numbered">
              {paras.map((t, i) => (
                <li key={i}>
                  <span className="nw-display nw-outline">{two(i)}</span>
                  <p>{t}</p>
                </li>
              ))}
            </ol>
          )}
          <div className="nw-actions">
            <Btn label={str(p.buttonLabel)} href={str(p.buttonHref)} metadata={metadata} kind="secondary" arrow />
            <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} metadata={metadata} kind="ghost" />
          </div>
        </div>
        <div className="nw-stack nw-sticky">
          <Photo src={img(p.image)} alt={str(p.alt)} label="Photo · your room, your people" className="nw-photo--tall" />
          {str(p.quote) && (
            <blockquote className="nw-quote">
              <em>“{str(p.quote)}”</em>
              {str(p.quoteBy) && <span>{str(p.quoteBy)}</span>}
            </blockquote>
          )}
        </div>
      </div>
    </Sec>
  );
}

function Groups({ p, metadata, pad, vis }: Common) {
  const own = arr(p.rows).filter((r) => str(r.name));
  const live = liveGroups(metadata);
  const rows = live.length ? live : own;
  return (
    <Sec id="circles" p={p} glow="tr" pad={pad} vis={vis}>
      <div className="nw-wrap nw-cols nw-cols--5-7">
        <div className="nw-stack nw-sticky">
          <Head p={p} size="md" />
          {(str(p.featureName) || img(p.image)) && (
            <Photo src={img(p.image)} alt={str(p.alt)} className="nw-photo--feature">
              <span className="nw-feature">
                <span>
                  {str(p.featureLabel) && <small>{str(p.featureLabel)}</small>}
                  <b className="nw-display">{str(p.featureName)}</b>
                </span>
                <Btn label={str(p.featureButtonLabel)} href={str(p.featureButtonHref)} metadata={metadata} size="sm" />
              </span>
            </Photo>
          )}
        </div>
        <ol className="nw-rule-list">
          {rows.length === 0 && (
            <li>
              <Empty what="group" />
            </li>
          )}
          {rows.map((g, i) => {
            const to = hrefOf(str(g.href), metadata);
            return (
              <li key={i} className="nw-group">
                <div className="nw-group-when">
                  <small>{str(g.day)}</small>
                  <b className="nw-display">{str(g.time)}</b>
                  {g.open === true && (
                    <span className="nw-badge">
                      <i aria-hidden="true" />
                      Open
                    </span>
                  )}
                </div>
                <div className="nw-group-what">
                  <h3 className="nw-display">{str(g.name)}</h3>
                  {str(g.body) && <p>{str(g.body)}</p>}
                  {str(g.people) && (
                    <span className="nw-group-people">
                      <Faces n={3} />
                      {str(g.people)}
                    </span>
                  )}
                </div>
                {to && (
                  <a className="nw-round" href={to} {...rel(to)} aria-label={`Come once to ${str(g.name)}`}>
                    <ArrowRight size={14} aria-hidden="true" />
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </Sec>
  );
}

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function CalendarBlock({ p, metadata, now = new Date(), pad, vis }: Common) {
  const count = Math.max(1, Math.min(12, Number(p.count) || 6));
  const rows = dated(p, metadata, now, count);
  const perDay = WEEK.map((d) => rows.filter((r) => r.dow.slice(0, 3).toLowerCase() === d.toLowerCase()).length);
  return (
    <Sec id="events" p={p} glow="bl" pad={pad} vis={vis}>
      <div className="nw-wrap">
        <Head p={p} action={<Btn label={str(p.buttonLabel)} href={str(p.buttonHref)} metadata={metadata} kind="secondary" arrow />} />
        {perDay.some(Boolean) && (
          <div className="nw-week" aria-hidden="true">
            {WEEK.map((d, i) => (
              <span key={d} className={cls(perDay[i] > 0 && "is-on")}>
                <small>{d}</small>
                <span>
                  {Array.from({ length: perDay[i] }, (_, j) => (
                    <i key={j} />
                  ))}
                </span>
              </span>
            ))}
          </div>
        )}
        <ol className="nw-dates">
          {rows.length === 0 && (
            <li>
              <Empty what="event" />
            </li>
          )}
          {rows.map((e, i) => (
            <li key={i} className={cls("nw-date-row", i === 0 && "is-first")}>
              <span className="nw-date-big">
                <b className="nw-display">{e.day}</b>
                <small>{e.mon}</small>
              </span>
              <span className="nw-date-what">
                <span className="nw-date-title">
                  <h3 className="nw-display">{e.title}</h3>
                  {e.kind === "event" && rows.some((r) => r.kind && r.kind !== "event") && <span className="nw-badge nw-badge--plain">Event</span>}
                </span>
                {e.body && <p>{e.body}</p>}
              </span>
              <span className="nw-date-when">
                {e.time && <b>{e.time}</b>}
                {e.where && <span>{e.where}</span>}
                {e.spots && <small>{e.spots}</small>}
              </span>
              {e.href && (
                <a className={cls("nw-btn nw-btn--sm", i === 0 ? "nw-btn--accent" : "nw-btn--secondary")} href={e.href} {...rel(e.href)}>
                  <span>{str(p.rowLabel) || "Save a spot"}</span>
                </a>
              )}
            </li>
          ))}
        </ol>
      </div>
    </Sec>
  );
}

function FirstVisit({ p, pad, vis }: Common) {
  const rows = arr(p.rows).filter((r) => str(r.title) || str(r.body));
  return (
    <Sec id="firstnight" p={p} glow="br" pad={pad} vis={vis}>
      <div className="nw-wrap nw-cols nw-cols--5-7 nw-cols--center">
        <div className="nw-stack">
          <Head p={p} size="md" />
          {str(p.note) && <p className="nw-note">{str(p.note)}</p>}
        </div>
        <ol className="nw-stepper">
          {rows.map((r, i) => (
            <li key={i} className={cls(i === 0 && "is-first")}>
              <span className="nw-display nw-step-dot">{two(i)}</span>
              <span>
                <small>{str(r.title)}</small>
                <span>{str(r.body)}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Sec>
  );
}

function Reviews({ p, metadata, pad, vis }: Common) {
  const live = (spaceOf(metadata)?.reviews?.latest ?? []).filter((r) => r.body?.trim()).slice(0, 3);
  const rows = live.length
    ? live.map((r) => ({ quote: r.body, who: r.author?.displayName ?? "A member", what: "" }))
    : arr(p.rows).map((r) => ({ quote: str(r.quote), who: str(r.who), what: str(r.what) })).filter((r) => r.quote);
  return (
    <Sec id="reviews" p={p} auto="day" glow="tl" pad={pad} vis={vis}>
      <div className="nw-wrap">
        <Head
          p={p}
          action={
            str(p.proof) ? (
              <span className="nw-head-proof">
                <Stars />
                {str(p.proof)}
              </span>
            ) : undefined
          }
        />
        <div className="nw-reviews">
          {rows.length === 0 && <Empty what="review" />}
          {rows.map((r, i) => (
            <figure key={i} className={cls("nw-review", i === 0 && "is-first")}>
              <Stars />
              <blockquote className={cls(i === 0 && "nw-display")}>“{r.quote}”</blockquote>
              <figcaption>
                <b>{r.who}</b>
                {r.what && <small>{r.what}</small>}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </Sec>
  );
}

// ── The community wall (LIVE-2108) ─────────────────────────────────────────────────────────────
// The Space's wall, read-only: the newest posts anyone may read, and one door into the app to join in. The live render attaches
// `metadata.space.newWorld.wall` from an ANONYMOUS read of space_wall_feed (lib/sites/new-world-live-load.ts), so the site shows
// exactly what a stranger sees; a members-only wall comes back off and the block draws nothing. With no bag (the editor canvas, a
// preview) the sample posts draw so the owner can see the shape. The member wall itself is never styled by the site (theme fence).
const SAMPLE_WALL: NewWorldWallPost[] = [
  { id: "s1", name: "Maya Torres", role: "From the team", date: "Nov 2", body: "Saturday's flow moves to the courtyard because of the marine layer. Bring a layer, we start at 8.", meta: "14 high fives · 3 replies", announcement: true },
  { id: "s2", name: "Jonah Park", role: "Member", date: "Nov 1", body: "New member intro: I moved here in September and this is the first place that felt like a room I could walk into alone.", meta: "9 high fives · 5 replies", announcement: false },
  { id: "s3", name: "Priya Shah", role: "Member", date: "Oct 30", body: "Thank you to everyone who came to the sunset sit. Same time next month.", meta: "6 high fives · 1 reply", announcement: false },
];

function Wall({ p, metadata, pad, vis }: Common) {
  const wall = readNewWorldLive(bagOf(metadata))?.wall;
  if (wall && !wall.on) return null;
  const rows = wall ? wall.rows : SAMPLE_WALL;
  // App-relative: hrefOf (through Btn) sends /spaces/... links out of the site to the app, the way every New World door does.
  const href = wall ? wall.href : "~/community";
  return (
    <Sec id="wall" p={p} glow="br" pad={pad} vis={vis}>
      <div className="nw-wrap">
        <Head p={p} action={href && str(p.buttonLabel) ? <Btn label={str(p.buttonLabel)} href={href} kind="ghost" metadata={metadata} /> : undefined} />
        <div className="nw-reviews nw-wall">
          {rows.map((r, i) => (
            <article key={r.id} className={cls("nw-review", "nw-wall-post", i === 0 && "is-first")}>
              <header className="nw-wall-who">
                <span className="nw-wall-face" aria-hidden="true">
                  {r.name.trim().charAt(0).toUpperCase() || "·"}
                </span>
                <span>
                  <b>{r.name}</b>
                  <small>{[r.role, r.date].filter(Boolean).join(" · ")}</small>
                </span>
              </header>
              <p className={cls(i === 0 && "nw-display")}>{r.body}</p>
              {r.meta && (
                <footer className="nw-wall-meta">
                  <small>{r.meta}</small>
                </footer>
              )}
            </article>
          ))}
        </div>
      </div>
    </Sec>
  );
}

function Team({ p, metadata, pad, vis }: Common) {
  const own = arr(p.rows).filter((r) => str(r.name));
  const live = liveTeam(metadata);
  const rows = live.length ? live : own;
  return (
    <Sec id="team" p={p} glow="br" pad={pad} vis={vis}>
      <div className="nw-wrap nw-cols nw-cols--4-8">
        <div className="nw-stack nw-sticky">
          <Head p={p} size="md" />
          {str(p.note) && <p className="nw-note nw-note--sm">{str(p.note)}</p>}
        </div>
        <div className="nw-team">
          {rows.length === 0 && <Empty what="person" />}
          {rows.map((t, i) => (
            <figure key={i} className="nw-person">
              <Photo src={img(t.image)} alt={str(t.alt)} className="nw-photo--person" />
              <figcaption>
                {str(t.href) ? (
                  <a href={str(t.href)} {...rel(str(t.href))}>
                    <b>{str(t.name)}</b>
                  </a>
                ) : (
                  <b>{str(t.name)}</b>
                )}
                {str(t.role) && <small>{str(t.role)}</small>}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </Sec>
  );
}

function Offers({ p, metadata, pad, vis, id = "services", live }: Common & { id?: string; live?: Props[] }) {
  const own = arr(p.rows).filter((r) => str(r.name));
  const rows = live && live.length ? live : own;
  return (
    <Sec id={id} p={p} glow="tl" pad={pad} vis={vis}>
      <div className="nw-wrap">
        <Head p={p} action={<Btn label={str(p.buttonLabel)} href={str(p.buttonHref)} metadata={metadata} kind="secondary" arrow />} />
        <div className="nw-grid">
          {rows.length === 0 && <Empty what="way in" />}
          {rows.map((s, i) => (
            <Tap key={i} to={hrefOf(str(s.href), metadata)} className="nw-card nw-offer">
              {img(s.image) ? <Photo src={img(s.image)} alt={str(s.alt)} className="nw-photo--offer" /> : <Icon name={str(s.icon) || "users"} tile />}
              <span className="nw-offer-top">
                <small>{str(s.meta)}</small>
                <small>{two(i)}</small>
              </span>
              <h3 className="nw-display">{str(s.name)}</h3>
              {str(s.body) && <p>{str(s.body)}</p>}
              <span className="nw-offer-foot">
                <b>{str(s.price)}</b>
                <i className="nw-round nw-round--sm" aria-hidden="true">
                  <ArrowRight size={13} />
                </i>
              </span>
            </Tap>
          ))}
        </div>
      </div>
    </Sec>
  );
}

/** The shop: the ways-in cards wearing the Space's active products. A Space with the Sell tool off draws nothing here. */
function Shop(a: Common) {
  const live = liveList(a.metadata, "shop");
  if (live && !live.on) return null;
  return <Offers {...a} id="shop" live={live ? liveRows(live.rows) : undefined} />;
}

function Plans({ p, metadata, pad, vis }: Common) {
  const own = arr(p.rows).filter((r) => str(r.name));
  const live = liveList(metadata, "plans");
  if (live && !live.on) return null;
  const rows = live && live.rows.length ? liveRows(live.rows) : own;
  return (
    <Sec id="plans" p={p} glow="tr" pad={pad} vis={vis}>
      <div className="nw-wrap">
        <Head p={p} action={str(p.aside) ? <span className="nw-head-aside">{str(p.aside)}</span> : undefined} />
        <div className="nw-plans">
          {rows.length === 0 && <Empty what="plan" />}
          {rows.map((r, i) => (
            <article key={i} className={cls("nw-card nw-plan", r.featured === true && "is-featured")}>
              {r.featured === true && (
                <span className="nw-badge">
                  <i aria-hidden="true" />
                  {str(p.featuredLabel) || "Most chosen"}
                </span>
              )}
              <h3 className="nw-display">{str(r.name)}</h3>
              {str(r.body) && <p>{str(r.body)}</p>}
              {str(r.price) && <b className="nw-display nw-plan-price">{str(r.price)}</b>}
              <Btn
                label={str(r.buttonLabel) || (str(r.href) ? `Choose ${str(r.name)}` : "")}
                href={str(r.href)}
                metadata={metadata}
                kind={r.featured === true ? "accent" : "secondary"}
                full
              />
            </article>
          ))}
        </div>
        {str(p.note) && <p className="nw-fine">{str(p.note)}</p>}
      </div>
    </Sec>
  );
}

function Openings({ p, metadata, now = new Date(), pad, vis }: Common) {
  const rows = dated(p, metadata, now, 4);
  return (
    <Sec id="booking" p={p} glow="bl" pad={pad} vis={vis}>
      <div className="nw-wrap nw-cols nw-cols--6-6 nw-cols--center">
        <div className="nw-stack">
          <Head p={p} size="md" />
          <div className="nw-actions">
            <Btn label={str(p.buttonLabel)} href={str(p.buttonHref)} metadata={metadata} arrow />
          </div>
        </div>
        <div className="nw-card nw-slots">
          {rows.length === 0 && <Empty what="open time" />}
          {rows.map((o, i) => (
            <Tap key={i} to={o.href} className={cls("nw-slot", i === 0 && "is-first")}>
              <span className="nw-date">
                <small>{o.mon}</small>
                <b>{o.day}</b>
              </span>
              <span className="nw-slot-text">
                <b>{o.title}</b>
                <small>{[o.time, o.body].filter(Boolean).join(" · ")}</small>
              </span>
              {o.spots ? <span className={cls("nw-badge", i > 0 && "nw-badge--plain")}>{o.spots}</span> : <small className="nw-mono">{str(p.fullLabel) || "Waitlist"}</small>}
            </Tap>
          ))}
        </div>
      </div>
    </Sec>
  );
}

function Gallery({ p, pad, vis }: Common) {
  const pics = arr(p.images).map((g) => ({ src: img(g.image), alt: str(g.alt) })).filter((g) => g.src);
  return (
    <Sec id="gallery" p={p} glow="br" pad={pad} vis={vis}>
      <div className="nw-wrap">
        <Head p={p} />
        <div className="nw-gallery">
          {pics.length === 0 && <Empty what="photo" />}
          {pics.map((g, i) => (
            <Photo key={i} src={g.src} alt={g.alt} className={cls("nw-photo--tile", i === 0 && "is-first")} />
          ))}
        </div>
      </div>
    </Sec>
  );
}

function Posts({ p, metadata, pad, vis }: Common) {
  const own = arr(p.rows).filter((r) => str(r.title));
  const live = liveList(metadata, "posts");
  if (live && !live.on) return null;
  const rows = live && live.rows.length ? liveRows(live.rows) : own;
  return (
    <Sec id="posts" p={p} glow="tl" pad={pad} vis={vis}>
      <div className="nw-wrap">
        <Head p={p} action={<Btn label={str(p.buttonLabel)} href={str(p.buttonHref)} metadata={metadata} kind="secondary" arrow />} />
        <div className="nw-posts">
          {rows.length === 0 && <Empty what="post" />}
          {rows.map((r, i) => (
            <Tap key={i} to={hrefOf(str(r.href), metadata)} className="nw-post">
              <small>{str(r.kind)}</small>
              <h3>{str(r.title)}</h3>
              {str(r.meta) && <span>{str(r.meta)}</span>}
            </Tap>
          ))}
        </div>
      </div>
    </Sec>
  );
}

function Process({ p, pad, vis }: Common) {
  const rows = arr(p.rows).filter((r) => str(r.title));
  return (
    <Sec id="process" p={p} glow="none" className="nw-sec--stripes" pad={pad} vis={vis}>
      <i className="nw-orb nw-orb--b" aria-hidden="true" />
      <div className="nw-wrap">
        <Head p={p} />
        <div className="nw-track" aria-hidden="true">
          <i />
        </div>
        <ol className="nw-process">
          {rows.map((r, i) => (
            <li key={i} className={cls(i === 0 && "is-first")}>
              <i className="nw-process-dot" aria-hidden="true" />
              <span className="nw-process-top">
                <span className="nw-display nw-step-dot">{two(i)}</span>
                <Icon name={str(r.icon) || "calendar"} tile size={15} />
              </span>
              <h3 className="nw-display">{str(r.title)}</h3>
              {str(r.body) && <p>{str(r.body)}</p>}
            </li>
          ))}
        </ol>
      </div>
    </Sec>
  );
}

function Where({ p, metadata, pad, vis }: Common) {
  const info = bagOf(metadata)?.profile;
  const ownHours = arr(p.hours).filter((h) => str(h.day));
  const hours = ownHours.length ? ownHours : hoursRows(info?.hours);
  const hoods = lines(p.areas);
  const facts = [
    ["pin", str(p.address) || str(info?.address)],
    ["phone", str(p.phone) || str(info?.phone)],
    ["mail", str(p.email) || str(info?.email)],
  ].filter(([, t]) => t);
  return (
    <Sec id="locations" p={p} glow="bl" pad={pad} vis={vis}>
      <div className="nw-wrap nw-cols nw-cols--6-6 nw-cols--center">
        <div className="nw-stack">
          <Head p={p} size="md" />
          {facts.length > 0 && (
            <div className="nw-facts">
              {facts.map(([ic, t]) => (
                <span key={ic}>
                  <Icon name={ic} size={18} />
                  {t}
                </span>
              ))}
            </div>
          )}
          {hours.length > 0 && (
            <dl className="nw-hours">
              {hours.map((h, i) => (
                <div key={i}>
                  <dt>{str(h.day)}</dt>
                  <dd>{str(h.time)}</dd>
                </div>
              ))}
            </dl>
          )}
          {hoods.length > 0 && (
            <div className="nw-pills">
              {hoods.map((n) => (
                <span key={n}>{n}</span>
              ))}
            </div>
          )}
        </div>
        <Photo src={img(p.image)} alt={str(p.alt)} label={str(p.mapLabel) || "Map · where we meet"} className="nw-photo--map">
          {!img(p.image) && (
            <>
              <i className="nw-mapgrid" aria-hidden="true" />
              <i className="nw-pin nw-pulse" aria-hidden="true" />
            </>
          )}
        </Photo>
      </div>
    </Sec>
  );
}

function Ask({ p, metadata, pad, vis }: Common) {
  const slug = (metadata?.links as SiteLinkMap | undefined)?.slug ?? null;
  return (
    <Sec id="forms" p={p} glow="tr" pad={pad} vis={vis}>
      <div className="nw-wrap nw-cols nw-cols--6-6 nw-cols--end">
        <Head p={p} size="md" />
        <div className="nw-card nw-form-card">
          <NewWorldContactForm slug={slug} buttonLabel={str(p.buttonLabel)} successMessage={str(p.successMessage)} />
        </div>
      </div>
    </Sec>
  );
}

function Letter({ p, metadata, pad, vis }: Common) {
  const slug = (metadata?.links as SiteLinkMap | undefined)?.slug ?? null;
  return (
    <Sec id="letter" p={p} glow="bl" pad={pad} vis={vis}>
      <div className="nw-wrap nw-center">
        <Eyebrow label={str(p.eyebrow)} />
        {str(p.title) && (
          <h2 className="nw-display nw-display--md">
            <InlineText text={str(p.title)} />
          </h2>
        )}
        {str(p.lede) && <p className="nw-lede">{str(p.lede)}</p>}
        <NewWorldLetterForm slug={slug} placeholder={str(p.placeholder)} buttonLabel={str(p.buttonLabel)} successMessage={str(p.successMessage)} />
      </div>
    </Sec>
  );
}

function Faq({ p, pad, vis, metadata }: Common) {
  const live = spaceOf(metadata)?.faqs ?? [];
  const rows = live.length
    ? live.map((f) => ({ q: f.question, a: f.answer }))
    : arr(p.rows).map((r) => ({ q: str(r.question), a: str(r.answer) })).filter((r) => r.q);
  const facts = [
    ["phone", str(p.phone)],
    ["mail", str(p.email)],
    ["clock", str(p.hours)],
  ].filter(([, t]) => t);
  const hoods = lines(p.areas);
  return (
    <Sec id="faq" p={p} auto="day" glow="tl" pad={pad} vis={vis}>
      <div className="nw-wrap nw-cols nw-cols--6-6">
        <div className="nw-stack nw-sticky">
          <Head p={p} size="md" />
          {facts.length > 0 && (
            <div className="nw-facts">
              {facts.map(([ic, t]) => (
                <span key={ic}>
                  <Icon name={ic} size={18} />
                  {t}
                </span>
              ))}
            </div>
          )}
          {hoods.length > 0 && (
            <div className="nw-stack nw-stack--sm nw-ruled">
              {str(p.areasLabel) && <small className="nw-mono">{str(p.areasLabel)}</small>}
              <div className="nw-pills">
                {hoods.map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="nw-faq">
          {rows.length === 0 && <Empty what="question" />}
          {rows.map((r, i) => (
            <details key={i} className="nw-faq-item" open={i === 0}>
              <summary>
                <span>{r.q}</span>
                <i aria-hidden="true" />
              </summary>
              <p>{r.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Sec>
  );
}

function Tools({ p, metadata, pad, vis }: Common) {
  const rows = arr(p.rows).filter((r) => str(r.title));
  return (
    <Sec id="business" p={p} glow="bl" className="nw-sec--wash" pad={pad} vis={vis}>
      <div className="nw-wrap nw-cols nw-cols--5-7">
        <div className="nw-stack nw-sticky">
          <Head p={p} size="md" />
          <div className="nw-actions">
            <Btn label={str(p.buttonLabel)} href={str(p.buttonHref)} metadata={metadata} arrow />
            <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} metadata={metadata} kind="ghost" />
          </div>
          {str(p.note) && <p className="nw-note nw-note--sm">{str(p.note)}</p>}
        </div>
        <ol className="nw-rule-list">
          {rows.map((r, i) => (
            <li key={i} className="nw-tool">
              <Icon name={str(r.icon) || "check"} tile size={15} />
              <span>
                <b>{str(r.title)}</b>
                {str(r.body) && <small>{str(r.body)}</small>}
              </span>
              <small className="nw-mono">{two(i)}</small>
            </li>
          ))}
        </ol>
      </div>
    </Sec>
  );
}

function Closer({ p, metadata, pad, vis }: Common) {
  return (
    <section data-th={regOf(p.register, "night")} className={cls("nw-closer", pad, vis)}>
      <i className="nw-orb nw-orb--a" aria-hidden="true" />
      <i className="nw-orb nw-orb--c" aria-hidden="true" />
      <div className="nw-wrap nw-center">
        {str(p.aside) && <p className="nw-display nw-closer-aside"><em>{str(p.aside)}</em></p>}
        <h2 className="nw-display nw-lit nw-break">
          <InlineText text={str(p.title)} />
        </h2>
        <div className="nw-actions nw-actions--center">
          <Btn label={str(p.primaryLabel)} href={str(p.primaryHref)} metadata={metadata} size="lg" arrow />
          <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} metadata={metadata} kind="secondary" size="lg" />
        </div>
        {str(p.note) && <Eyebrow label={str(p.note)} />}
      </div>
    </section>
  );
}

// ── Ways in, Our story, Book ───────────────────────────────────────────────────────────────

/** A page's own head: the big title a Ways in or Book page opens with, under the site header. */
function PageHead({ p, pad, vis }: Common) {
  return (
    <section data-th={regOf(p.register, undefined)} className={cls("nw-pagehead", pad, vis)}>
      <i className="nw-orb nw-orb--a" aria-hidden="true" />
      <div className="nw-wrap nw-stack nw-stack--lg">
        <Eyebrow index={str(p.index)} label={str(p.eyebrow)} />
        <h1 className="nw-display nw-display--page nw-lit">
          <InlineText text={str(p.title)} />
        </h1>
        {str(p.lede) && <p className="nw-hero-lead">{str(p.lede)}</p>}
      </div>
    </section>
  );
}

/** The ways in, one per row, photo and words trading sides, each with its cost and when. */
function WayRows({ p, metadata, pad, vis }: Common) {
  const rows = arr(p.rows).filter((r) => str(r.name));
  return (
    <Sec id="ways-in" p={p} glow="none" className="nw-ways" pad={pad} vis={vis}>
      {rows.length === 0 && (
        <div className="nw-wrap">
          <Empty what="way in" />
        </div>
      )}
      {rows.map((r, i) => (
        <div key={i} className={cls("nw-way", i % 2 === 1 && "is-flipped")}>
          <div className="nw-wrap nw-way-in">
            <Photo src={img(r.image)} alt={str(r.alt)} label={`Photo · ${str(r.name)} · a real night`} className="nw-way-photo" />
            <div className="nw-stack nw-way-copy">
              <div className="nw-way-top">
                <Icon name={str(r.icon) || ICON_NAMES[i % 4]!} tile />
                <Eyebrow index={two(i)} label={str(r.tags)} />
              </div>
              <h2 className="nw-display nw-display--lg">{str(r.name)}</h2>
              {str(r.body) && <p className="nw-way-body">{str(r.body)}</p>}
              {(str(r.price) || str(r.when)) && (
                <dl className="nw-way-facts">
                  <div>
                    <dt>{str(p.costLabel) || "Cost"}</dt>
                    <dd className="nw-display">{str(r.price) || "Ask"}</dd>
                  </div>
                  <div>
                    <dt>{str(p.whenLabel) || "When"}</dt>
                    <dd className="nw-display">{str(r.when) || "Ask"}</dd>
                  </div>
                </dl>
              )}
              <div className="nw-actions">
                <Btn label={str(r.buttonLabel) || str(p.buttonLabel)} href={str(r.href) || str(p.buttonHref)} metadata={metadata} arrow />
                <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} metadata={metadata} kind="ghost" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </Sec>
  );
}

/** "Always true here": a short heading beside the promises every visit keeps, ticked in two columns. */
function Always({ p, pad, vis }: Common) {
  const items = lines(p.items);
  return (
    <Sec id="always" p={p} glow="top" className="nw-always" pad={pad} vis={vis}>
      <div className="nw-wrap nw-cols nw-cols--5-7">
        <div className="nw-stack">
          <Eyebrow index={str(p.index)} label={str(p.eyebrow)} />
          {str(p.title) && (
            <h2 className="nw-display nw-display--md">
              <InlineText text={str(p.title)} />
            </h2>
          )}
        </div>
        {items.length === 0 ? (
          <Empty what="promise" />
        ) : (
          <ul className="nw-ticks">
            {items.map((t, i) => (
              <li key={i}>
                <Check size={18} strokeWidth={2} aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sec>
  );
}

/** Our story's opening: the title, the first line of the story, three plain facts and the owner's portrait with their name on it. */
function AboutHero({ p, metadata, pad, vis }: Common) {
  const chips = arr(p.chips).filter((c) => str(c.text));
  return (
    <section data-th={regOf(p.register, undefined)} className={cls("nw-hero nw-about-hero", pad, vis)}>
      <div className="nw-hero-sky" aria-hidden="true" />
      <i className="nw-orb nw-orb--a" aria-hidden="true" />
      <div className="nw-hero-in">
        <div className="nw-hero-copy">
          <Eyebrow label={str(p.eyebrow)} />
          <h1 className="nw-display nw-lit nw-break">
            <InlineText text={str(p.title)} />
          </h1>
          {str(p.lead) && <p className="nw-hero-lead">{str(p.lead)}</p>}
          {chips.length > 0 && (
            <div className="nw-chips">
              {chips.map((c, i) => (
                <span key={i}>
                  <Icon name={str(c.icon) || "check"} size={14} />
                  {str(c.text)}
                </span>
              ))}
            </div>
          )}
          <div className="nw-actions">
            <Btn label={str(p.primaryLabel)} href={str(p.primaryHref)} metadata={metadata} size="lg" arrow />
            <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} metadata={metadata} kind="secondary" size="lg" />
          </div>
        </div>
        <div className="nw-hero-art">
          <div className="nw-frame-glow">
            <Photo src={img(p.image)} alt={str(p.alt)} label={`Portrait · ${str(p.name) || "you"}`} className="nw-photo--portrait">
              {str(p.name) && (
                <figcaption className="nw-glass nw-namecard">
                  <span>
                    <b>{str(p.name)}</b>
                    {str(p.role) && <small>{str(p.role)}</small>}
                  </span>
                  <Icon name="users" tile size={15} />
                </figcaption>
              )}
            </Photo>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The long story: a sticky heading beside the paragraphs. */
function LongStory({ p, pad, vis }: Common) {
  const paras = lines(p.paragraphs);
  return (
    <Sec id="story" p={p} glow="br" pad={pad} vis={vis}>
      <div className="nw-wrap nw-cols nw-cols--5-7">
        <div className="nw-stack nw-sticky">
          <Eyebrow index={str(p.index)} label={str(p.eyebrow)} />
          {str(p.title) && (
            <h2 className="nw-display nw-display--md nw-break">
              <InlineText text={str(p.title)} />
            </h2>
          )}
        </div>
        <div className="nw-prose">
          {paras.length === 0 && <Empty what="story" />}
          {paras.map((t, i) => (
            <p key={i}>{t}</p>
          ))}
        </div>
      </div>
    </Sec>
  );
}

/** One line in the owner's own words, big and centred. */
function QuoteBand({ p, pad, vis }: Common) {
  if (!str(p.quote)) return null;
  return (
    <Sec id="words" p={p} glow="top" className="nw-quoteband" pad={pad} vis={vis}>
      <div className="nw-wrap nw-center">
        {str(p.label) && (
          <span className="nw-rule-label">
            <i aria-hidden="true" />
            {str(p.label)}
            <i aria-hidden="true" />
          </span>
        )}
        <blockquote className="nw-display nw-lit">
          <InlineText text={str(p.quote)} />
        </blockquote>
        {str(p.by) && <span className="nw-mono">{str(p.by)}</span>}
      </div>
    </Sec>
  );
}

/** Three promises, each with its mark and number. */
function Promises({ p, pad, vis }: Common) {
  const rows = arr(p.rows).filter((r) => str(r.title));
  return (
    <Sec id="promises" p={p} glow="tl" pad={pad} vis={vis}>
      <div className="nw-wrap">
        <Head p={p} />
        <div className="nw-promises">
          {rows.length === 0 && <Empty what="promise" />}
          {rows.map((r, i) => (
            <article key={i}>
              <span className="nw-promise-top">
                <Icon name={str(r.icon) || "check"} tile />
                <small>{two(i)}</small>
              </span>
              <h3 className="nw-display">{str(r.title)}</h3>
              {str(r.body) && <p>{str(r.body)}</p>}
            </article>
          ))}
        </div>
      </div>
    </Sec>
  );
}

/** The Book page: what a booking holds on the left, and on the right the ways in to choose from and the next open times, each
 *  going to the Space's own booking. No pretend checkout: every row is a real link, and a list with no rows says so. */
function Book({ p, metadata, now = new Date(), pad, vis }: Common) {
  const ways = arr(p.ways).filter((w) => str(w.name));
  const facts = arr(p.facts).filter((f) => str(f.label));
  const next = dated(p, metadata, now, 4);
  // The Space has booking switched off and the owner wrote no ways in: there is nothing honest to book, so the block draws nothing.
  if (bagOf(metadata)?.booking?.enabled === false && ways.length === 0 && next.length === 0) return null;
  return (
    <Sec id="book" p={p} glow="tr" className="nw-book" pad={pad} vis={vis}>
      <div className="nw-wrap nw-cols nw-cols--5-7">
        <div className="nw-stack nw-stack--lg nw-sticky">
          <Eyebrow label={str(p.eyebrow)} />
          <h1 className="nw-display nw-display--lg nw-lit nw-break">
            <InlineText text={str(p.title)} />
          </h1>
          {str(p.lede) && <p className="nw-lede">{str(p.lede)}</p>}
          {facts.length > 0 && (
            <div className="nw-card nw-summary">
              {str(p.summaryLabel) && <small className="nw-mono">{str(p.summaryLabel)}</small>}
              <dl>
                {facts.map((f, i) => (
                  <div key={i}>
                    <dt>{str(f.label)}</dt>
                    <dd>{str(f.value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
        <div className="nw-card nw-book-card">
          <div className="nw-stack">
            {str(p.waysLabel) && <small className="nw-mono">{str(p.waysLabel)}</small>}
            {ways.length === 0 && <Empty what="way in" />}
            <div className="nw-choices">
              {ways.map((w, i) => (
                <Tap key={i} to={hrefOf(str(w.href) || str(p.buttonHref), metadata)} className={cls("nw-choice", i === 0 && "is-first")}>
                  <span className="nw-choice-text">
                    <b>{str(w.name)}</b>
                    {str(w.body) && <small>{str(w.body)}</small>}
                  </span>
                  {str(w.meta) && <span className="nw-mono">{str(w.meta)}</span>}
                  <i className="nw-round nw-round--sm" aria-hidden="true">
                    <ArrowRight size={13} />
                  </i>
                </Tap>
              ))}
            </div>
          </div>
          {str(p.timesLabel) && (
            <div className="nw-stack">
              <small className="nw-mono">{str(p.timesLabel)}</small>
              {next.length === 0 && <Empty what="open time" />}
              <div className="nw-slots nw-slots--flat">
                {next.map((o, i) => (
                  <Tap key={i} to={o.href} className="nw-slot">
                    <span className="nw-date">
                      <small>{o.mon}</small>
                      <b>{o.day}</b>
                    </span>
                    <span className="nw-slot-text">
                      <b>{o.title}</b>
                      <small>{[o.time, o.body].filter(Boolean).join(" · ")}</small>
                    </span>
                    {o.spots && <span className="nw-badge nw-badge--plain">{o.spots}</span>}
                  </Tap>
                ))}
              </div>
            </div>
          )}
          <div className="nw-book-foot">
            {str(p.note) && <span className="nw-form-note">{str(p.note)}</span>}
            <Btn label={str(p.buttonLabel)} href={str(p.buttonHref)} metadata={metadata} arrow />
          </div>
        </div>
      </div>
    </Sec>
  );
}

// ── Registry ────────────────────────────────────────────────────────────────────────────────

const register = {
  type: "select",
  label: "Register",
  options: [
    { label: "As the design sets it", value: "auto" },
    { label: "Night", value: "night" },
    { label: "Day", value: "day" },
  ],
} as const;
const icon = { type: "select", label: "Icon", options: ICON_NAMES.map((v) => ({ label: v, value: v })) } as const;
const links = (n: string, label = "Button") => ({
  [`${n}Label`]: text(label),
  [`${n}Href`]: text(`${label}: where it goes`, LINK_HINT),
});
const head = {
  index: text("Number", "Like 02. Leave empty for none."),
  eyebrow: text("Small label"),
  title: area("Heading", VOICE_HINT),
  lede: area("Line under the heading"),
};
const rows = (fields: Record<string, unknown>, label = "Rows") =>
  ({
    type: "array",
    label,
    arrayFields: fields,
    getItemSummary: (it: Props) => str(it.title) || str(it.name) || str(it.question) || str(it.who) || str(it.value) || str(it.day) || "Row",
  }) as const;
const list = (label: string) =>
  ({ type: "array", label, arrayFields: {}, getItemSummary: (it: unknown) => String(it) }) as const;
const yesNo = (label: string) =>
  ({ type: "radio", label, options: [{ label: "No", value: false }, { label: "Yes", value: true }] }) as const;
const datedRow = {
  weekday: text("Weekday", "Mon to Sun, for the week strip."),
  mon: text("Month"),
  day: text("Day"),
  title: text("Title"),
  body: area("Line"),
  time: text("Time"),
  where: text("Where"),
  spots: text("Spots", "Like 4 spots left. Empty shows the waitlist."),
  kind: { type: "select", label: "Kind", options: [{ label: "Session", value: "session" }, { label: "Event", value: "event" }] },
  href: text("Link", LINK_HINT),
};
const useEvents = yesNo("Show the Space's own events when it has any");

export const newWorldBlocks: Record<string, ComponentConfig> = {
  NewWorldHero: block(
    "New World hero",
    {
      eyebrow: text("Small label"),
      title: area("Heading", VOICE_HINT),
      lead: area("Line under the heading"),
      ...links("primary", "Main button"),
      ...links("secondary", "Second button"),
      proof: text("Line beside the faces"),
      aside: text("Italic line after it"),
      image,
      alt: text("Photo description"),
      badge: text("Label on the photo"),
      useEvents,
      rows: rows(datedRow, "Next three, when the Space has no events"),
      areas: list("Neighbourhoods for the strip"),
      register,
    },
    {
      eyebrow: "Your street · Your City",
      title: "Say what happens here *and who it is for.*",
      lead: "Two sentences: what you do, who shows up, how someone new gets started.",
      primaryLabel: "Book your first visit",
      primaryHref: "~/booking",
      secondaryLabel: "See the calendar",
      secondaryHref: "#events",
      proof: "",
      aside: "",
      image: "",
      alt: "",
      badge: "Doors open this week",
      useEvents: true,
      rows: [],
      areas: [],
      register: "auto",
    },
    Hero,
  ),
  NewWorldStats: block(
    "New World numbers band",
    { items: rows({ icon, value: text("Big words"), label: text("Line under it"), note: text("Small line") }), register },
    {
      items: [
        { icon: "users", value: "4", label: "groups a week", note: "On the calendar" },
        { icon: "calendar", value: "90", label: "minutes, about", note: "Leave when you need to" },
        { icon: "heart", value: "Free", label: "first visit", note: "Always" },
        { icon: "check", value: "Pause", label: "any time", note: "Memberships that wait" },
      ],
      register: "auto",
    },
    Stats,
  ),
  NewWorldStory: block(
    "New World story",
    {
      index: head.index,
      eyebrow: head.eyebrow,
      title: head.title,
      paragraphs: list("Numbered lines"),
      ...links("button"),
      ...links("secondary", "Second button"),
      image,
      alt: text("Photo description"),
      quote: area("Quote under the photo"),
      quoteBy: text("Who said it"),
      register,
    },
    {
      index: "01",
      eyebrow: "Our story",
      title: "Our *story.*",
      paragraphs: ["The beginning: the thing you noticed, the room you wanted to exist, the first few people who came."],
      buttonLabel: "Read the whole story",
      buttonHref: "~/about",
      secondaryLabel: "",
      secondaryHref: "",
      image: "",
      alt: "",
      quote: "",
      quoteBy: "",
      register: "auto",
    },
    Story,
  ),
  NewWorldGroups: block(
    "New World groups",
    {
      ...head,
      image,
      alt: text("Photo description"),
      featureLabel: text("Label on the photo"),
      featureName: text("Name on the photo"),
      ...links("featureButton", "Button on the photo"),
      rows: rows({ day: text("Day"), time: text("Time"), name: text("Name"), body: area("Line"), people: text("Who comes", "Like 14 members."), open: yesNo("Open to new faces"), href: text("Link", LINK_HINT) }),
      register,
    },
    {
      index: "02",
      eyebrow: "Groups",
      title: "The *groups.*",
      lede: "Regular sessions with their own members. Book a spot or drop in.",
      image: "",
      alt: "",
      featureLabel: "Open to new faces",
      featureName: "",
      featureButtonLabel: "Come once",
      featureButtonHref: "~/booking",
      rows: [],
      register: "auto",
    },
    Groups,
  ),
  NewWorldCalendar: block(
    "New World calendar (live)",
    { ...head, ...links("button"), rowLabel: text("Button on each row"), count: text("How many"), useEvents, rows: rows(datedRow), register },
    {
      index: "03",
      eyebrow: "What's Happening",
      title: "What's *happening.*",
      lede: "Everything on the calendar this month. RSVP and we remind you.",
      buttonLabel: "Full calendar",
      buttonHref: "~/events",
      rowLabel: "Save a spot",
      count: "6",
      useEvents: true,
      rows: [],
      register: "auto",
    },
    CalendarBlock,
  ),
  NewWorldFirstVisit: block(
    "New World first visit",
    { ...head, note: area("Line under it"), rows: rows({ title: text("Small label"), body: area("Line") }), register },
    {
      index: "04",
      eyebrow: "Walking in",
      title: "Your first *visit.*",
      lede: "Walking in alone is the hardest part. Here is exactly what happens.",
      note: "",
      rows: [],
      register: "auto",
    },
    FirstVisit,
  ),
  NewWorldReviews: block(
    "New World reviews (live)",
    { ...head, proof: text("Line beside the stars"), rows: rows({ quote: area("Quote"), who: text("Who"), what: text("What they come to") }), register },
    { index: "05", eyebrow: "In their words", title: "In their *words.*", lede: "", proof: "", rows: [], register: "auto" },
    Reviews,
  ),
  NewWorldSpaceWall: block(
    "New World community wall (live)",
    { ...head, buttonLabel: text("Button", "The door into the wall in the app. Empty hides it."), register },
    { index: "", eyebrow: "On the wall", title: "What people are *saying.*", lede: "The latest from the community wall. Members post, everyone reads.", buttonLabel: "Join the conversation", register: "auto" },
    Wall,
  ),
  NewWorldTeam: block(
    "New World team",
    { ...head, note: text("Small line"), rows: rows({ name: text("Name"), role: text("Role"), image, alt: text("Photo description") }), register },
    { index: "06", eyebrow: "The team", title: "The people *behind it.*", lede: "Who you will meet.", note: "", rows: [], register: "auto" },
    Team,
  ),
  NewWorldOffers: block(
    "New World ways in",
    { ...head, ...links("button"), rows: rows({ icon, meta: text("Small line"), name: text("Name"), body: area("Line"), price: text("Price"), href: text("Link", LINK_HINT) }), register },
    {
      index: "07",
      eyebrow: "Ways in",
      title: "Ways *in.*",
      lede: "Everything here is priced in plain sight.",
      buttonLabel: "",
      buttonHref: "",
      rows: [],
      register: "auto",
    },
    Offers,
  ),
  // The shop is the ways-in card set wearing the shop's words (record.js `shop`): its own block so the kit can turn it on and off by
  // the Sell tool alone (lib/sites/new-world-functions.ts) without touching the ways in.
  NewWorldShop: block(
    "New World shop",
    { ...head, ...links("button"), rows: rows({ icon, meta: text("Small line"), name: text("Name"), body: area("Line"), price: text("Price"), href: text("Link", LINK_HINT) }), register },
    {
      index: "",
      eyebrow: "Shop",
      title: "Take some *home.*",
      lede: "A few things we make. Picked up at the door or sent.",
      buttonLabel: "",
      buttonHref: "",
      rows: [],
      register: "auto",
    },
    Shop,
  ),
  NewWorldPlans: block(
    "New World plans",
    {
      ...head,
      aside: text("Small line beside the heading"),
      featuredLabel: text("Label on the highlighted plan"),
      note: text("Line under the plans"),
      rows: rows({ name: text("Name"), body: area("Line"), price: text("Price"), featured: yesNo("Highlight"), buttonLabel: text("Button"), href: text("Link", LINK_HINT) }),
      register,
    },
    {
      index: "08",
      eyebrow: "Memberships and plans",
      title: "Keep *coming back.*",
      lede: "Pick a rhythm. Pause or change it any time.",
      aside: "",
      featuredLabel: "Most chosen",
      note: "Pause, change or cancel from your account any time.",
      rows: [],
      register: "auto",
    },
    Plans,
  ),
  NewWorldOpenings: block(
    "New World open spots (live)",
    { ...head, ...links("button"), fullLabel: text("Word when a row has no spots"), useEvents, rows: rows(datedRow), register },
    {
      index: "09",
      eyebrow: "Save a spot",
      title: "Open *this week.*",
      lede: "Live spots. Pick a time, see what it costs, get a reminder.",
      buttonLabel: "Book your first visit",
      buttonHref: "~/booking",
      fullLabel: "Waitlist",
      useEvents: true,
      rows: [],
      register: "auto",
    },
    Openings,
  ),
  NewWorldGallery: block(
    "New World gallery",
    { ...head, images: rows({ image, alt: text("Photo description") }, "Photos"), register },
    { index: "10", eyebrow: "Gallery", title: "Real *nights.*", lede: "Photos from people who were there.", images: [], register: "auto" },
    Gallery,
  ),
  NewWorldPosts: block(
    "New World posts",
    { ...head, ...links("button"), rows: rows({ kind: text("Kind"), title: text("Title"), meta: text("Small line"), href: text("Link", LINK_HINT) }), register },
    { index: "11", eyebrow: "Notes", title: "Good to *read.*", lede: "Notes from the room, written by the people in it.", buttonLabel: "", buttonHref: "", rows: [], register: "auto" },
    Posts,
  ),
  NewWorldProcess: block(
    "New World how it works",
    { ...head, rows: rows({ icon, title: text("Title"), body: area("Line") }), register },
    { index: "12", eyebrow: "How it works", title: "How a first time *goes.*", lede: "", rows: [], register: "auto" },
    Process,
  ),
  NewWorldWhere: block(
    "New World where to find us",
    {
      ...head,
      address: text("Address"),
      phone: text("Phone"),
      email: text("Email"),
      hours: rows({ day: text("Days"), time: text("Hours") }, "Hours"),
      areas: list("Neighbourhoods"),
      image,
      alt: text("Map or photo description"),
      mapLabel: text("Label when there is no picture"),
      register,
    },
    {
      index: "13",
      eyebrow: "Where we meet",
      title: "Where to *find us.*",
      lede: "",
      address: "",
      phone: "",
      email: "",
      hours: [],
      areas: [],
      image: "",
      alt: "",
      mapLabel: "Map · where we meet",
      register: "auto",
    },
    Where,
  ),
  NewWorldAsk: block(
    "New World contact form",
    { ...head, buttonLabel: text("Button"), successMessage: text("Thank-you line"), register },
    { index: "14", eyebrow: "Say hello", title: "Ask us *anything.*", lede: "A person answers.", buttonLabel: "Send", successMessage: "Thanks. A person will reply soon.", register: "auto" },
    Ask,
  ),
  NewWorldLetter: block(
    "New World newsletter",
    { eyebrow: text("Small label"), title: area("Heading", VOICE_HINT), lede: area("Line under the heading"), placeholder: text("Email box hint"), buttonLabel: text("Button"), successMessage: text("Thank-you line"), register },
    {
      eyebrow: "Newsletter",
      title: "Stay in *the loop.*",
      lede: "A short note when something is coming up. Nothing else.",
      placeholder: "you@email.com",
      buttonLabel: "Join",
      successMessage: "Thanks. You are on the list.",
      register: "auto",
    },
    Letter,
  ),
  NewWorldFaq: block(
    "New World questions (live)",
    {
      ...head,
      phone: text("Phone"),
      email: text("Email"),
      hours: text("Hours"),
      areasLabel: text("Label over the neighbourhoods"),
      areas: list("Neighbourhoods"),
      rows: rows({ question: text("Question"), answer: area("Answer") }),
      register,
    },
    {
      index: "15",
      eyebrow: "Questions",
      title: "Good to *know.*",
      lede: "Anything else, ask. A real person answers.",
      phone: "",
      email: "",
      hours: "",
      areasLabel: "Where we meet",
      areas: [],
      rows: [],
      register: "auto",
    },
    Faq,
  ),
  NewWorldTools: block(
    "New World tools",
    { ...head, ...links("button"), ...links("secondary", "Second button"), note: text("Small line"), rows: rows({ icon, title: text("Title"), body: text("Line") }), register },
    {
      index: "17",
      eyebrow: "Behind the door",
      title: "The tools that *run this place.*",
      lede: "A calendar, check-in at the door, memberships, your member list and a page you edit yourself. Your people stay yours.",
      buttonLabel: "",
      buttonHref: "",
      secondaryLabel: "",
      secondaryHref: "",
      note: "",
      rows: [],
      register: "auto",
    },
    Tools,
  ),
  NewWorldCloser: block(
    "New World closer",
    { aside: text("Italic line above"), title: area("Heading", VOICE_HINT), ...links("primary", "Main button"), ...links("secondary", "Second button"), note: text("Small line under the buttons"), register },
    {
      aside: "",
      title: "Book your *first visit.*",
      primaryLabel: "Book your first visit",
      primaryHref: "~/booking",
      secondaryLabel: "Bring someone",
      secondaryHref: "~/booking",
      note: "",
      register: "auto",
    },
    Closer,
  ),
  NewWorldPageHead: block(
    "New World page title",
    { ...head, register },
    { index: "", eyebrow: "Ways in", title: "Ways *in.*", lede: "Everything here is priced in plain sight. Most of it is free to walk into.", register: "auto" },
    PageHead,
  ),
  NewWorldWayRows: block(
    "New World ways in, one per row",
    {
      costLabel: text("Word over the cost"),
      whenLabel: text("Word over when"),
      ...links("button", "Button on every row"),
      ...links("secondary", "Second button"),
      rows: rows({ icon, tags: text("Small line"), name: text("Name"), body: area("Line"), price: text("Cost"), when: text("When"), image, alt: text("Photo description"), buttonLabel: text("Button"), href: text("Link", LINK_HINT) }),
      register,
    },
    { costLabel: "Cost", whenLabel: "When", buttonLabel: "Save my spot", buttonHref: "~/booking", secondaryLabel: "Questions", secondaryHref: "~/#faq", rows: [], register: "auto" },
    WayRows,
  ),
  NewWorldAlways: block(
    "New World always true here",
    { index: head.index, eyebrow: head.eyebrow, title: head.title, items: list("Promises"), register },
    {
      index: "",
      eyebrow: "Every visit",
      title: "Always *true here.*",
      items: ["Free to join, always", "A host at the door who learns your name", "A reminder the day before, with the facts", "Bring someone: their first visit is on us"],
      register: "auto",
    },
    Always,
  ),
  NewWorldAboutHero: block(
    "New World story opening",
    {
      eyebrow: head.eyebrow,
      title: area("Heading", VOICE_HINT),
      lead: area("Line under the heading"),
      chips: rows({ icon, text: text("Fact") }, "Facts"),
      ...links("primary", "Main button"),
      ...links("secondary", "Second button"),
      image,
      alt: text("Photo description"),
      name: text("Name on the portrait"),
      role: text("Role under the name"),
      register,
    },
    {
      eyebrow: "Our story",
      title: "Our *story.*",
      lead: "The beginning: the thing you noticed, the room you wanted to exist, the first few people who came.",
      chips: [],
      primaryLabel: "Book your first visit",
      primaryHref: "~/booking",
      secondaryLabel: "",
      secondaryHref: "",
      image: "",
      alt: "",
      name: "",
      role: "",
      register: "auto",
    },
    AboutHero,
  ),
  NewWorldLongStory: block(
    "New World the whole story",
    { index: head.index, eyebrow: head.eyebrow, title: head.title, paragraphs: list("Paragraphs"), register },
    { index: "01", eyebrow: "The story", title: "How this *room works.*", paragraphs: [], register: "auto" },
    LongStory,
  ),
  NewWorldQuote: block(
    "New World quote",
    { label: text("Small line above"), quote: area("Quote", "Wrap the last word in *stars* to set it in italic."), by: text("Who said it"), register },
    { label: "In their words", quote: "", by: "", register: "auto" },
    QuoteBand,
  ),
  NewWorldPromises: block(
    "New World promises",
    { ...head, rows: rows({ icon, title: text("Title"), body: area("Line") }), register },
    {
      index: "02",
      eyebrow: "What you can count on",
      title: "Three *promises.*",
      lede: "",
      rows: [
        { icon: "check", title: "Open doors", body: "Joining is free. No velvet rope, nothing members-only." },
        { icon: "users", title: "Same faces", body: "Groups meet at the same time in the same place, so coming back is easy and someone notices when you do." },
        { icon: "heart", title: "Bring someone", body: "A first visit with a friend is celebrated. Word of mouth is how this room fills." },
      ],
      register: "auto",
    },
    Promises,
  ),
  NewWorldBook: block(
    "New World book (live)",
    {
      eyebrow: head.eyebrow,
      title: area("Heading", VOICE_HINT),
      lede: area("Line under the heading"),
      summaryLabel: text("Label over the facts"),
      facts: rows({ label: text("Label"), value: text("Value") }, "Facts"),
      waysLabel: text("Label over the ways in"),
      ways: rows({ name: text("Name"), body: text("Line"), meta: text("Cost and length"), href: text("Link", LINK_HINT) }, "Ways in"),
      timesLabel: text("Label over the open times", "Leave empty to hide the open times."),
      useEvents,
      rows: rows(datedRow, "Open times"),
      note: text("Small line at the bottom"),
      ...links("button"),
      register,
    },
    {
      eyebrow: "Save a spot",
      title: "Pick a night *and come.*",
      lede: "Live spots, what it costs (often nothing) and a reminder the day before with the facts.",
      summaryLabel: "Your booking",
      facts: [],
      waysLabel: "Choose a way in",
      ways: [],
      timesLabel: "Next open times",
      useEvents: true,
      rows: [],
      note: "Change or cancel any time. No one minds.",
      buttonLabel: "",
      buttonHref: "",
      register: "auto",
    },
    Book,
  ),
};
