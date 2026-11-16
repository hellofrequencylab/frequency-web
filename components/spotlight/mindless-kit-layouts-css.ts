// The Mindless Kit Spotlight layouts' stylesheet (components/spotlight/mindless-kit-layouts.tsx), drawn to the Mindless design system's
// Spotlight surface (ui_kits/spotlight): a phone page on warm ink, the drip wordmark in the accent, a round portrait ringed in the accent,
// paint-sticker buttons (accent fill, ink outline, offset ink shadow), one card style (a raised surface and a 1px hairline) and a small
// offset paint on the icons and the tag. The 60 / 30 / 10 rule holds: ink grounds, bone type, the accent on the main button, the featured
// item and the key phrase. Every colour, shadow and face is a --ml-* token from lib/theme/mindless.ts, so an accent change re-points the
// whole page and this file holds no literal colour. Class prefix `mls-`. Tokens are scoped to [data-house-theme="mindless"], which only
// the stand-alone render and the Spotlight page carry; nothing here styles a member, Space console or admin area. Night only here.

const LABEL = 'font-family:var(--ml-font-body);font-weight:800;letter-spacing:var(--ml-ls-label);text-transform:uppercase'

export const MINDLESS_KIT_LAYOUTS_CSS = `
.mls{position:relative;box-sizing:border-box;min-height:100%;padding-bottom:34px;background:var(--ml-ground);color:var(--ml-body);font-family:var(--ml-font-body);font-size:16px;line-height:1.45;container-type:inline-size;overflow:hidden;isolation:isolate}
.mls>*{position:relative;z-index:1}
.mls *,.mls *::before{box-sizing:border-box}
:where(.mls) a{color:inherit;text-decoration:none}
.mls h1,.mls p,.mls blockquote{margin:0}
.mls-d{font-family:var(--ml-font-display);font-weight:400;text-transform:uppercase;letter-spacing:0;line-height:.98;color:var(--ml-head);text-shadow:var(--ml-depth-ink-xl);text-wrap:balance}
.mls-d em{font-style:normal;color:var(--ml-accent-text)}
.mls-label{${LABEL};font-size:11px;color:var(--ml-muted)}
.mls-scrawl{display:inline-flex;align-items:center;padding:5px 12px;border-radius:var(--ml-radius-pill);background:var(--ml-noise-1);color:var(--ml-ink);border:2px solid var(--ml-pit);box-shadow:2px 3px 0 0 var(--ml-pit);${LABEL};font-size:11px;line-height:1;transform:rotate(-3deg)}
.mls-glyph{display:inline-grid;place-items:center;flex:none;width:44px;height:44px;border-radius:var(--ml-corner-sm);background:var(--ml-accent);color:var(--ml-on-accent);border:3px solid var(--ml-pit);box-shadow:var(--ml-shadow-sticker);transform:rotate(-4deg)}
.mls-glyph svg{width:22px;height:22px;stroke-width:2}
.mls-col{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;padding:18px}
.mls-body{font-size:15px;line-height:var(--ml-lh-body);color:var(--ml-body)}
.mls-foot{display:flex;flex-direction:column;align-items:center;gap:12px;padding:14px 20px 8px}
.mls-foot i{display:block;width:60%;height:1px;background:var(--ml-line)}
/* The wordmark: the name in the drip display in the accent, an ink extrusion behind it, the descriptor in tracked caps. */
.mls-logo{display:inline-flex;flex-direction:column;align-items:center;gap:6px;max-width:100%}
.mls-logo-name{display:block;font-family:var(--ml-font-display);font-weight:400;line-height:1;white-space:nowrap;text-transform:uppercase;color:var(--ml-accent);text-shadow:var(--ml-depth-ink)}
.mls-logo-desc{display:flex;align-items:center;align-self:stretch;justify-content:center;gap:10px;${LABEL};font-size:11px;letter-spacing:.16em;color:var(--ml-muted);white-space:nowrap}
.mls-logo-desc i{display:none}
/* The round portrait, ringed in the accent. */
.mls-arch{position:relative;display:block;flex:none;aspect-ratio:1;border-radius:50%;overflow:hidden;background:var(--ml-raised-2);box-shadow:0 0 0 3px var(--ml-accent),3px 4px 0 3px var(--ml-pit)}
.mls-top{display:grid;gap:12px;justify-items:center;padding:40px 22px 14px;text-align:center}
.mls-top--big{padding-top:48px;padding-bottom:20px}
.mls-pain{font-size:17px;line-height:1.4;color:var(--ml-secondary);max-width:30ch}
/* The paint sticker: accent fill, ink outline, offset ink shadow; lifts on hover, presses on click. */
.mls-sticker{display:inline-flex;max-width:100%}
.mls-sticker span{display:inline-flex;min-width:0;align-items:center;justify-content:center;gap:10px;width:100%;min-height:54px;padding:0 26px;border-radius:var(--ml-radius-pill);border:var(--ml-outline);background:var(--ml-accent);color:var(--ml-on-accent);box-shadow:var(--ml-shadow-sticker);${LABEL};font-size:15px;white-space:nowrap;transition:transform var(--ml-dur-fast) var(--ml-ease-out),box-shadow var(--ml-dur-fast) var(--ml-ease-out)}
.mls-sticker:hover span{transform:translate(-1px,-1px);box-shadow:var(--ml-shadow-sticker-lift);background:var(--ml-accent-hover)}
.mls-sticker:active span{transform:translate(2px,3px);box-shadow:none}
/* The second button: a bone outline with a small offset shadow in the offset paint. */
.mls-placard{display:inline-flex;align-items:center;justify-content:center;min-height:50px;padding:0 24px;border-radius:var(--ml-radius-pill);border:2px solid color-mix(in oklab,var(--ml-head) 55%,transparent);box-shadow:2px 3px 0 0 var(--ml-noise-1);${LABEL};font-size:14px;color:var(--ml-head)}
.mls-placard:hover{background:var(--ml-accent-tint);border-color:var(--ml-head)}
.mls-full{display:flex;width:100%}
.mls-sticker:focus-visible,.mls-placard:focus-visible,.mls-plate:focus-visible,.mls-prod:focus-visible{outline:3px solid var(--ml-accent);outline-offset:3px}
/* One card style: a raised surface and a 1px hairline. */
.mls-plate{position:relative;border-radius:var(--ml-corner);background:var(--ml-raised);box-shadow:inset 0 0 0 1px var(--ml-line);transition:box-shadow var(--ml-dur-fast)}
.mls-plate:hover{box-shadow:inset 0 0 0 1px var(--ml-line-strong)}
.mls-door{display:flex;align-items:center;gap:14px;padding:15px 16px;color:var(--ml-head)}
.mls-door--compact{padding:12px 14px}
.mls-door>span:nth-child(2){flex:1;min-width:0}
.mls-door b{display:block;${LABEL};font-size:13px;letter-spacing:.06em;color:var(--ml-head)}
.mls-door small{display:block;margin-top:2px;font-size:13px;color:var(--ml-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mls-door>svg{color:var(--ml-muted)}
/* Card wall: the first tile is featured with an accent rule, the rest stay raised. */
.mls-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;padding:16px}
.mls-span{grid-column:1/-1}
.mls-sq{display:flex;flex-direction:column;justify-content:space-between;aspect-ratio:1;padding:14px;color:var(--ml-head)}
.mls-sq b{font-family:var(--ml-font-display);font-weight:400;font-size:19px;line-height:1;text-transform:uppercase}
.mls-grid>.mls-sq:nth-child(2){box-shadow:inset 0 0 0 2px var(--ml-accent)}
.mls-grid>.mls-sq:nth-child(3n+2) .mls-glyph{background:var(--ml-noise-1);color:var(--ml-ink)}
.mls-grid>.mls-sq:nth-child(3n) .mls-glyph{background:var(--ml-noise-2);color:var(--ml-ink)}
/* Story: the paint photo, an ink fade at the foot, the headline over it. */
.mls-story-photo{position:relative;height:380px;display:flex;flex-direction:column;justify-content:space-between;padding:44px 22px 22px;overflow:hidden;background:var(--ml-band-pit)}
.mls-story-photo::after{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(0deg,var(--ml-ground) 4%,color-mix(in oklab,var(--ml-ground) 55%,transparent) 42%,transparent 70%)}
.mls-story-photo>*:not(img){position:relative;z-index:2}
.mls-story-name{align-self:flex-start}
.mls-story-name .mls-logo-name{color:var(--ml-head)}
.mls-story-photo h1{font-size:44px}
/* Calendar first: the next date is the accent sticker, the rest bone. */
.mls-date{display:flex;align-items:center;gap:14px;padding:12px}
.mls-day{display:grid;justify-items:center;align-content:center;width:52px;height:56px;border-radius:var(--ml-corner-sm);background:var(--ml-bone);color:var(--ml-ink);border:2px solid var(--ml-pit);box-shadow:2px 3px 0 0 var(--ml-pit)}
.mls-day .mls-label{color:var(--ml-ink);font-size:10px}
.mls-day b{font-family:var(--ml-font-display);font-weight:400;font-size:24px;line-height:.9}
.mls-col>.mls-date:nth-child(2) .mls-day{background:var(--ml-accent);color:var(--ml-on-accent)}
.mls-date-t{flex:1;min-width:0}
.mls-date-t b{display:block;font-weight:700;font-size:15px;line-height:1.15;color:var(--ml-head)}
.mls-date-t small{display:block;margin-top:4px;font-size:12px;color:var(--ml-muted)}
.mls-badge{display:inline-flex;align-items:center;min-height:24px;padding:0 10px;border-radius:var(--ml-radius-pill);background:var(--ml-raised-2);color:var(--ml-body);box-shadow:inset 0 0 0 1px var(--ml-line);${LABEL};font-size:10px;white-space:nowrap}
/* Shop front: raised squares with the offset glyph. */
.mls-shop{gap:16px 12px}
.mls-prod{display:grid;gap:6px;align-content:start}
.mls-taped{position:relative;display:grid;place-items:center;aspect-ratio:1;border-radius:var(--ml-corner);background:var(--ml-raised-2);box-shadow:inset 0 0 0 1px var(--ml-line)}
.mls-prod b{font-family:var(--ml-font-display);font-weight:400;font-size:17px;line-height:1.05;text-transform:uppercase;color:var(--ml-head)}
.mls-price{${LABEL};font-size:11px;color:var(--ml-accent-text)}
/* Profile. */
.mls-profile{display:grid;gap:16px;padding:46px 22px 4px}
.mls-profile-head{display:flex;gap:14px;align-items:center}
.mls-profile-name{display:block;font-family:var(--ml-font-display);font-weight:400;font-size:28px;line-height:1;text-transform:uppercase;color:var(--ml-head);text-shadow:var(--ml-depth-ink)}
.mls-profile-role{display:block;margin-top:6px;font-size:14px;color:var(--ml-muted)}
.mls-quote{font-weight:500;font-size:21px;line-height:1.3;color:var(--ml-head)}
.mls-profile .mls-scrawl{justify-self:end}
@media (prefers-reduced-motion:reduce){.mls *{transition:none!important}}
`
