import type { ReactNode } from "react";

// THE SHARED MEMBER SECTION HEADER (LIVE-935, design_handoff header survey 2026-10-14): a small kicker, the
// title with its serif accent, an optional one-line meta, and the area's own buttons on the right. Every
// member section body draws this one component instead of its own `.head` markup, so the header cannot
// drift page by page. The kit owns the look (`.head`, `.k`, `.h1`, `.meta`, `.row`); this only fixes the
// structure. Server-safe: no state, no hooks. Entity pages with their own image (a Circle, an event, a
// profile, a Space) keep their photo header and do not use this.
//
// `actions` is rendered as given, so a caller keeps its own `<div className="row wrap">` around several
// buttons. `as` is the title's element: h1 on a page of its own, h2 on a section inside another page.

export function MemberHead({
  kicker,
  title,
  meta,
  actions,
  as: Title = "h1",
}: {
  kicker: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  as?: "h1" | "h2";
}) {
  return (
    <div className="head">
      <div>
        <span className="k">{kicker}</span>
        <Title className="h1">{title}</Title>
        {meta ? <span className="meta">{meta}</span> : null}
      </div>
      {actions}
    </div>
  );
}
