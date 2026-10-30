// THE WEBSITE MONTH'S SHEET (calendar suite pass 10). The suite's month look (day cells, event chips, the today
// marker, the Unavailable hatch, Agenda on a phone) drawn for a stand-alone Space website. The suite's own styles
// are the console theme's (app/themes/frequency/admin-pages.css) and a hosted site loads none of them, so this
// sheet is the website's own. It is scoped under [data-site-month], so it can only dress this component inside the
// stand-alone site render (guarded by app/(main)/no-site-theme-in-member-area.test.ts: nothing in app/(main) or
// components/spaces imports it).
//
// Tokens only. Colours come from the aliases the site render defines (--color-*, set by the website theme or the
// house theme), type from the DAWN type scale (--text-*, which the Frequency design re-points at its own steps;
// the Frequency design's own type names are scoped to that design and inert on a site, which wears DAWN). The accent is the site's
// own --color-primary, so a chip reads in the owner's colour on every theme. Nothing here is a literal colour.

const N = '[data-site-month]'

export const SITE_MONTH_CSS = `
${N}{--sm-line:var(--color-border);--sm-wash:color-mix(in oklab,var(--color-primary) 11%,var(--color-surface));--sm-wash-line:color-mix(in oklab,var(--color-primary) 22%,transparent);--sm-ring:var(--color-primary);min-width:0;color:var(--color-text);font-family:var(--font-body)}
${N} *{box-sizing:border-box}
${N} .sm-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;margin-bottom:12px}
${N} .sm-title{margin:0;font-family:var(--font-display);font-size:var(--text-lead);font-weight:700;line-height:1.2;letter-spacing:-.01em;color:var(--color-text)}
${N} .sm-title span{font-weight:500;color:var(--color-text-muted)}
${N} .sm-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
${N} .sm-step{display:inline-flex;align-items:center;gap:4px}
${N} .sm-today{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:0 14px;border:1px solid var(--sm-line);border-radius:var(--radius-pill);background:transparent;color:var(--color-text);font-size:var(--text-body-sm);font-weight:500;cursor:pointer}
${N} .sm-today:hover:not(:disabled){background:var(--color-surface-elevated)}
${N} .sm-today:disabled{opacity:.5;cursor:default}
${N} [data-segmented]{display:inline-flex;gap:2px;padding:2px;border:1px solid var(--sm-line);border-radius:var(--radius-pill);background:var(--color-surface)}
${N} [data-segmented] button{min-height:28px;padding:0 14px;border:0;border-radius:var(--radius-pill);background:transparent;color:var(--color-text-muted);font-size:var(--text-body-sm);font-weight:500;cursor:pointer}
${N} [data-segmented] button[aria-pressed="true"]{background:var(--color-primary);color:var(--color-text-on-primary)}
${N} button:focus-visible{outline:2px solid var(--sm-ring);outline-offset:2px}

${N} .sm-card{border:1px solid var(--sm-line);border-radius:var(--radius-card);background:var(--color-surface);overflow:hidden}
${N} .sm-weekdays{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));padding:10px 0 8px;text-align:center;font-size:var(--text-2xs);font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--color-text-subtle)}
${N} .sm-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));min-height:118px;border-top:1px solid var(--sm-line)}
${N} .sm-day{display:flex;flex-direction:column;gap:3px;min-width:0;padding:4px 3px 5px;background:var(--color-surface)}
${N} .sm-day+.sm-day{border-left:1px solid var(--sm-line)}
${N} .sm-day[data-out]{background:color-mix(in oklab,var(--color-canvas) 60%,var(--color-surface))}
${N} .sm-day[data-today]{box-shadow:inset 0 0 0 1.5px var(--sm-ring)}
${N} .sm-num{flex:none;display:grid;place-items:center;width:24px;height:24px;margin:0 0 1px 2px;border-radius:8px;font-size:var(--text-meta);font-weight:500;line-height:1;font-variant-numeric:tabular-nums;color:var(--color-text)}
${N} .sm-day[data-past] .sm-num{color:var(--color-text-subtle)}
${N} .sm-day[data-today] .sm-num{background:var(--color-primary);color:var(--color-text-on-primary)}

${N} .sm-chip{position:relative;display:flex;flex-direction:column;width:100%;min-width:0;min-height:24px;margin:0;padding:3px 7px;border:1px solid var(--sm-wash-line);border-radius:10px;background:var(--sm-wash);color:var(--color-text);text-align:left;font:inherit;cursor:pointer;transition:transform .12s ease-out}
${N} .sm-chip:hover{transform:translateY(-1px)}
${N} .sm-chip-t{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--text-meta);font-weight:600;line-height:1.25}
${N} .sm-chip-m{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--text-2xs);font-weight:500;letter-spacing:.04em;text-transform:uppercase;color:var(--color-text-muted)}
${N} .sm-chip[data-kind="cancelled"]{background:transparent;border-color:var(--sm-line);color:var(--color-text-subtle)}
${N} .sm-chip[data-kind="cancelled"] .sm-chip-t{text-decoration:line-through}
${N} .sm-chip[data-kind="unavailable"]{border-color:transparent;background:repeating-linear-gradient(135deg,color-mix(in oklab,var(--color-text) 9%,transparent) 0 6px,transparent 6px 12px),color-mix(in oklab,var(--color-canvas) 70%,var(--color-surface));color:var(--color-text-muted);cursor:default}
${N} .sm-chip[data-kind="unavailable"]:hover{transform:none}
${N} .sm-more{align-self:flex-start;margin:0;padding:2px 6px;border:0;border-radius:8px;background:none;color:var(--color-text-muted);font-size:var(--text-meta);font-weight:500;cursor:pointer}
${N} .sm-more:hover{background:var(--color-surface-elevated);color:var(--color-text)}
${N} .sm-note{margin:10px 2px 0;font-size:var(--text-meta);color:var(--color-text-muted)}

${N} .sm-agenda{list-style:none;margin:0;padding:0;border:1px solid var(--sm-line);border-radius:var(--radius-card);background:var(--color-surface);overflow:hidden}
${N} .sm-agenda>li{display:grid;grid-template-columns:48px minmax(0,1fr);gap:4px 12px;padding:10px 12px}
${N} .sm-agenda>li+li{border-top:1px solid var(--sm-line)}
${N} .sm-adate{display:flex;flex-direction:column;align-items:center;align-self:start;line-height:1;padding-top:4px}
${N} .sm-adate span:first-child{font-size:var(--text-2xs);font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--color-primary-strong)}
${N} .sm-adate span:last-child{margin-top:3px;font-size:var(--text-lead);font-weight:700;font-variant-numeric:tabular-nums;color:var(--color-text)}
${N} .sm-adate[data-today] span:last-child{display:grid;place-items:center;width:30px;height:30px;margin-top:1px;border-radius:50%;background:var(--color-primary);color:var(--color-text-on-primary);font-size:var(--text-body-sm)}
${N} .sm-arows{display:flex;flex-direction:column;gap:6px;min-width:0}
${N} .sm-arow{margin:0}
${N} .sm-arow .sm-chip{padding:7px 10px}
${N} .sm-arow .sm-chip-t{font-size:var(--text-body-sm);white-space:normal}
${N} .sm-arow .sm-chip-m{white-space:normal}

/* WHICH PANEL SHOWS. "auto" is the page before anyone chooses: the month on a wide screen, the Agenda under
   720px (the suite's phone rule). Pressing Month or Agenda pins the choice. Both panels are always in the markup,
   so the first paint is right with no script. */
${N}[data-view="month"] .sm-agenda-panel,${N}[data-view="agenda"] .sm-month-panel{display:none}
${N}[data-view="auto"] .sm-agenda-panel{display:none}
@media (max-width:719.98px){
  ${N}[data-view="auto"] .sm-month-panel{display:none}
  ${N}[data-view="auto"] .sm-agenda-panel{display:block}
  /* A month pinned on a phone: seven narrow columns, so a day's items shrink to bars you can still tap. */
  ${N} .sm-week{min-height:64px}
  ${N} .sm-day{padding:3px 2px 4px}
  ${N} .sm-chip{min-height:8px;height:8px;padding:0;border-radius:99px}
  ${N} .sm-chip-t,${N} .sm-chip-m{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
  ${N} .sm-arow .sm-chip{height:auto;min-height:24px;padding:7px 10px;border-radius:10px}
  ${N} .sm-arow .sm-chip-t,${N} .sm-arow .sm-chip-m{position:static;width:auto;height:auto;overflow:hidden;clip:auto}
  ${N} .sm-more{padding:0 2px;font-size:var(--text-2xs)}
  ${N} .sm-weekdays{letter-spacing:.04em}
}
@media (prefers-reduced-motion:reduce){${N} .sm-chip{transition:none}${N} .sm-chip:hover{transform:none}}
`
