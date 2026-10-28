// THE NETWORK KIT'S EXTRA BLOCK SHEET (components/page-editor/blocks/network-kit-more.tsx). Scoped under
// [data-house-theme="network-kit"] and added to the kit skin (components/sites/network-kit-css.ts), so it only ever
// reaches a stand-alone site render. Tokens only: every colour is a --color-* / --nk-* variable, never a literal.
// The shapes are the design's NetworkBlocks.jsx: the accent card with the leaf photo, the fact tiles, the date cards,
// the ink bands for chapters and the podcast, the figure tiles with their soft circle, the inverted middle room card
// and the coffee-and-contact pair. It builds on the base sheet's pieces (nk-card, nk-photo, nk-split, nk-grid-cards).

const N = '[data-house-theme="network-kit"]'

export const NETWORK_KIT_MORE_CSS = `
/* Ink bands: chapters and the podcast. The ground reaches the edges; the words turn to the on-ink tokens. */
${N} .nk-band--ink{background:var(--color-ink);color:var(--color-on-ink)}
${N} .nk-band--ink::before{display:none}
${N} .nk-band--ink .nk-eyebrow,${N} .nk-band--ink .nk-lead{color:var(--color-on-ink-muted)}
${N} .nk-band--ink .nk-display{color:var(--color-on-ink)}
${N} .nk-band--ink .nk-btn--secondary{color:var(--color-on-ink);box-shadow:inset 0 0 0 1px var(--color-ink-border)}
${N} .nk-band--ink .nk-btn--secondary:hover{background:var(--color-ink-elevated);color:var(--color-on-ink)}

/* Featured event: the accent card, words on the left, the leaf photo on the right. */
${N} .nk-featured{position:relative;overflow:hidden;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:center;gap:clamp(24px,4vw,64px);box-sizing:border-box;padding:clamp(28px,4vw,56px);border-radius:var(--nk-radius-cover);background:var(--color-accent);color:var(--color-text-on-accent);box-shadow:var(--nk-depth-md)}
${N} .nk-featured>*{position:relative;z-index:2}
${N} .nk-featured .nk-eyebrow{color:var(--color-text-on-accent)}
${N} .nk-featured .nk-eyebrow::before{background:currentColor}
${N} .nk-featured .nk-display{margin-top:18px;color:var(--color-text-on-accent)}
${N} .nk-featured-lead{margin:20px 0 0;max-width:34em;font-size:var(--nk-text-lead);line-height:1.5;color:var(--color-text-on-accent);opacity:.88}
${N} .nk-featured-when{display:flex;align-items:center;gap:14px;box-sizing:border-box;max-width:460px;margin-top:28px;padding:12px 16px 12px 12px;border-radius:var(--nk-radius-card);background:color-mix(in srgb,var(--color-surface) 32%,transparent);color:var(--color-text-on-accent);text-decoration:none}
${N} .nk-featured-when .nk-date{width:52px;height:52px}
${N} .nk-featured-when-text{min-width:0;font-size:16px;font-weight:var(--nk-weight-medium);line-height:1.35}
${N} .nk-featured .nk-actions{margin-top:32px}
${N} .nk-featured .nk-btn--secondary{color:var(--color-text-on-accent);box-shadow:inset 0 0 0 1.5px currentColor}
${N} .nk-featured .nk-btn--secondary:hover{background:color-mix(in srgb,var(--color-surface) 24%,transparent);color:var(--color-text-on-accent)}
${N} .nk-featured-media{aspect-ratio:4/3;border-radius:var(--nk-radius-leaf);box-shadow:var(--nk-depth-lg)}
${N} .nk-featured-media img{position:absolute;inset:0}
${N} .nk-featured[data-flip] .nk-featured-copy{order:2}
${N} .nk-featured[data-flip] .nk-featured-media{order:1;border-radius:160px 28px 28px 28px}

/* Where and when: the photo, the headline and four fact tiles. */
${N} .nk-venue-media{min-height:360px;border-radius:var(--nk-radius-cover);box-shadow:var(--nk-depth-md)}
${N} .nk-venue-media img{position:absolute;inset:0}
${N} .nk-venue[data-flip] .nk-venue-media{order:2}
${N} .nk-venue-copy{display:flex;flex-direction:column;justify-content:center}
${N} .nk-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:28px}
${N} .nk-fact{display:flex;flex-direction:column;gap:2px;box-sizing:border-box;padding:18px 20px;border-radius:22px;background:var(--color-surface-elevated)}
${N} .nk-fact-label{display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:15px;color:var(--color-text-muted)}
${N} .nk-fact-label .nk-glyph{color:var(--color-accent-strong)}
${N} .nk-fact b{font-size:18px;font-weight:var(--nk-weight-medium)}
${N} .nk-fact>span:last-child:not(.nk-fact-label){font-size:15px;color:var(--color-text-muted)}
${N} .nk-venue .nk-actions{margin-top:28px}

/* Events calendar: date cards. */
${N} .nk-cal-card{display:flex;flex-direction:column;gap:14px;color:inherit;text-align:left;text-decoration:none}
${N} .nk-cal-card .nk-date{width:58px;height:58px;border-radius:18px}
${N} .nk-cal-card-text{display:flex;flex-direction:column;gap:4px}
${N} .nk-cal-card-text b{font-size:18px;font-weight:var(--nk-weight-semibold)}
${N} .nk-cal-card-time{display:flex;align-items:center;gap:6px;font-size:15px;color:var(--color-text-muted)}

/* Chapters: photo cards on the ink band. */
${N} .nk-chapter{display:flex;flex-direction:column;overflow:hidden;padding:0;color:var(--color-text);text-decoration:none}
${N} .nk-chapter-cover{aspect-ratio:4/3}
${N} .nk-chapter-cover img{position:absolute;inset:0}
${N} .nk-chapter-body{display:flex;flex-direction:column;gap:4px;padding:18px 20px 22px}
${N} .nk-chapter-when{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:var(--nk-weight-medium);color:var(--color-accent-strong)}
${N} .nk-chapter-name{font-size:24px;line-height:1.1;color:var(--color-text)}
${N} .nk-band--ink .nk-chapter .nk-display{color:var(--color-text)}
${N} .nk-chapter .nk-row-body{margin-top:0}

/* Circles. */
${N} .nk-circle{display:flex;flex-direction:column;gap:10px;box-sizing:border-box;padding:26px 24px;border-radius:28px;color:inherit;text-align:left;text-decoration:none}
${N} .nk-circle-mark{display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;margin-bottom:6px;border-radius:16px;background:var(--color-accent-bg);color:var(--color-accent-strong)}
${N} .nk-circle b{font-size:19px;font-weight:var(--nk-weight-semibold)}
${N} .nk-circle-blurb{font-size:16px;color:var(--color-text-muted)}

/* Figures: tiles with a soft accent circle in the corner. */
${N} .nk-section--stats{padding-block:var(--nk-space-8);padding-inline:max(var(--nk-space-gutter),calc((100% - var(--nk-column)) / 2))}
${N} .nk-stat-tile{position:relative;overflow:hidden;padding:28px 30px;border-radius:28px}
${N} .nk-stat-tile::before{content:"";position:absolute;right:-40px;top:-50px;width:150px;height:150px;border-radius:50%;background:color-mix(in srgb,var(--color-accent) 22%,transparent)}
${N} .nk-stat-tile[data-i="1"]::before{background:color-mix(in srgb,var(--color-accent) 16%,transparent)}
${N} .nk-stat-tile[data-i="2"]::before,${N} .nk-stat-tile[data-i="3"]::before{background:color-mix(in srgb,var(--color-accent) 12%,transparent)}
${N} .nk-stat-tile>*{position:relative}
${N} .nk-stat-mark{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;margin-bottom:18px;border-radius:14px;background:var(--color-surface-elevated);color:var(--color-accent-strong)}
${N} .nk-stat-big{display:block;font-size:var(--nk-text-stat);line-height:1;font-variant-numeric:lining-nums}
${N} .nk-stat-caption{display:block;margin-top:8px;color:var(--color-text-muted)}

/* Organizer note. */
${N} .nk-note-media{aspect-ratio:4/3;border-radius:var(--nk-radius-leaf);box-shadow:var(--nk-depth-md)}
${N} .nk-note-media img{position:absolute;inset:0}
${N} .nk-note[data-flip] .nk-note-media{order:2;border-radius:160px 28px 28px 28px}
${N} .nk-note-quote{margin:18px 0 0;font-size:clamp(1.75rem,1.2rem + 1.6vw,2.6rem);line-height:1.12}
${N} .nk-note-lead{margin:20px 0 0;max-width:34em}
${N} .nk-hosts{display:flex;flex-wrap:wrap;gap:20px;margin-top:24px}
${N} .nk-host{display:flex;align-items:center;gap:10px}
${N} .nk-host b{display:block;font-size:16px;font-weight:var(--nk-weight-semibold)}
${N} .nk-host span span{font-size:14px;color:var(--color-text-muted)}
${N} .nk-avatar{flex:none;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;width:44px;height:44px;border-radius:50%;background:var(--color-accent-bg);color:var(--color-accent-strong);font-size:15px;font-weight:var(--nk-weight-semibold)}
${N} .nk-avatar img{width:100%;height:100%;object-fit:cover}

/* What we stand for. */
${N} .nk-pillars-media{aspect-ratio:4/3;border-radius:var(--nk-radius-cover);box-shadow:var(--nk-depth-md)}
${N} .nk-pillars-media img{position:absolute;inset:0}
${N} .nk-pillar{padding:24px 26px;border-radius:26px}
${N} .nk-pillar b{display:block;font-size:26px}
${N} .nk-pillar p{margin:8px 0 0;font-size:16px;color:var(--color-text-muted)}
${N} .nk-pillars-closing{max-width:26em;margin:56px auto 0;text-align:center;font-family:var(--nk-accent-face);font-style:italic;font-size:clamp(1.6rem,1.2rem + 1.4vw,2.4rem);line-height:1.2;text-wrap:balance}

/* Host here: three rooms, the middle one inverted. */
${N} .nk-room{display:flex;flex-direction:column;gap:10px;padding:28px;border-radius:28px}
${N} .nk-room[data-ink]{background:var(--color-ink);color:var(--color-on-ink);box-shadow:var(--nk-depth-lg)}
${N} .nk-room-name{font-size:15px;font-weight:var(--nk-weight-medium);color:var(--color-text-muted)}
${N} .nk-room[data-ink] .nk-room-name{color:var(--color-on-ink-muted)}
${N} .nk-room-price{font-size:44px}
${N} .nk-room-unit{font-size:16px;opacity:.75}
${N} .nk-room p{margin:0;font-size:16px;opacity:.85}
${N} .nk-room-foot{margin-top:auto;padding-top:10px}
${N} .nk-room-foot .nk-btn{width:100%}

/* Podcast: episode cards on the ink band. */
${N} .nk-episode{display:block;overflow:hidden;border-radius:24px;background:var(--color-ink-elevated);color:var(--color-on-ink);text-align:left;text-decoration:none;transition:transform var(--nk-motion-base) var(--nk-ease-out),box-shadow var(--nk-motion-base) var(--nk-ease-out)}
${N} .nk-episode:hover{transform:translateY(-3px);box-shadow:var(--nk-depth-md)}
${N} .nk-episode-cover{display:block;aspect-ratio:16/10}
${N} .nk-episode-cover img{position:absolute;inset:0}
${N} .nk-play{position:absolute;z-index:2;left:14px;bottom:14px;display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;background:var(--color-accent);color:var(--color-text-on-accent)}
${N} .nk-episode-body{display:block;padding:16px 18px 20px}
${N} .nk-episode-body b{display:block;font-size:17px;font-weight:var(--nk-weight-semibold)}
${N} .nk-episode-body span{font-size:14px;color:var(--color-on-ink-muted)}

/* Instagram: four square photos. */
${N} .nk-social-tile{aspect-ratio:1/1;border-radius:24px}
${N} .nk-social-tile img{position:absolute;inset:0}

/* Shop strip. */
${N} .nk-merch{display:flex;flex-direction:column;overflow:hidden;padding:0;border-radius:26px}
${N} .nk-merch-cover{display:flex;align-items:center;justify-content:center;aspect-ratio:1/1;color:var(--color-accent-strong);text-decoration:none}
${N} .nk-merch-cover img{position:absolute;inset:0}
${N} .nk-merch-body{display:flex;flex-direction:column;flex:1;gap:4px;padding:16px 16px 18px}
${N} .nk-merch-body b{font-size:16px;font-weight:var(--nk-weight-semibold)}
${N} .nk-merch-body .nk-row-body{margin-top:0;font-size:14px}
${N} .nk-merch-price{font-size:22px;margin:8px 0 4px}
${N} .nk-merch-body .nk-push{padding-top:8px}

/* Coffee and contact: the golden-rule card beside the contact card. */
${N} .nk-contact{--nk-split-gap:20px;column-gap:20px}
${N} .nk-contact-coffee{display:flex;flex-direction:column;gap:16px;box-sizing:border-box;padding:clamp(24px,3vw,36px);border-radius:28px;box-shadow:inset 0 0 0 1px var(--color-border-strong)}
${N} .nk-contact-photo{aspect-ratio:4/3;border-radius:20px}
${N} .nk-contact-photo img{position:absolute;inset:0}
${N} .nk-hand{font-family:var(--nk-hand);font-size:30px;line-height:1.1;color:var(--color-accent-strong)}
${N} .nk-contact-coffee p,${N} .nk-contact-card p{margin:0;font-size:16px;color:var(--color-text-muted)}
${N} .nk-contact-card{display:flex;flex-direction:column;gap:14px;box-sizing:border-box;padding:clamp(24px,3vw,36px);border-radius:28px;background:var(--color-surface);box-shadow:var(--nk-depth-md)}
${N} .nk-contact-row{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:18px;background:var(--color-canvas);box-shadow:inset 0 0 0 1px var(--color-border);font-size:16px}
${N} .nk-contact-row>span:first-child{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:10px;background:var(--color-accent-bg);color:var(--color-accent-strong)}
${N} .nk-contact-row a{color:inherit;text-decoration:none;overflow-wrap:anywhere}
${N} .nk-contact-form{display:flex;flex-direction:column;gap:14px;margin-top:6px}
${N} .nk-field{display:flex;flex-direction:column;gap:6px;font-size:var(--nk-text-body-sm);font-weight:var(--nk-weight-medium);color:var(--color-text)}
${N} .nk-textarea{min-height:120px;padding-block:14px;resize:vertical}
${N} .nk-check{display:flex;align-items:center;gap:10px;font-size:15px;color:var(--color-text-muted)}
${N} .nk-check input{width:20px;height:20px;accent-color:var(--color-accent)}

@media (max-width:900px){
${N} .nk-featured{grid-template-columns:minmax(0,1fr)}
${N} .nk-featured[data-flip] .nk-featured-copy,${N} .nk-featured[data-flip] .nk-featured-media,${N} .nk-venue[data-flip] .nk-venue-media,${N} .nk-note[data-flip] .nk-note-media{order:initial}
${N} .nk-featured[data-flip] .nk-featured-media,${N} .nk-note[data-flip] .nk-note-media{border-radius:28px 28px 28px 160px}
${N} .nk-venue-media{min-height:280px}
}
@media (max-width:640px){
${N} .nk-facts{grid-template-columns:minmax(0,1fr)}
${N} .nk-featured-media,${N} .nk-note-media{border-radius:28px 100px 28px 28px}
${N} .nk-featured[data-flip] .nk-featured-media,${N} .nk-note[data-flip] .nk-note-media{border-radius:28px 28px 28px 100px}
}
`
