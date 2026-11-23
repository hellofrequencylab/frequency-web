// THE HOUSE KIT LAYOUT SHEET (LIVE-2357): one structure for Bold, Wildheart and Nocturne, read from the --hk-* colours the root
// carries (houseKitVars, from each theme's flat token set) and a per-theme presentation block below. No colour literal lives here:
// every colour is a --hk-* name or a mix of them. Faces read the variables the app already sets (Bold's on <html>; Wildheart's and
// Nocturne's from their font classes on the Spotlight route), each ending in a system stack.

export const HOUSE_KIT_LAYOUTS_CSS = `
.hks{--hk-display:Georgia,serif;--hk-body:system-ui,sans-serif;--hk-label:system-ui,sans-serif;--hk-case:none;--hk-weight:600;--hk-track:0;--hk-r:14px;--hk-r-btn:999px;--hk-frame:inset(0 round 18px);--hk-portrait:50%;
  background:var(--hk-canvas);color:var(--hk-text);font-family:var(--hk-body);min-height:100%;padding:40px 20px 28px;display:flex;flex-direction:column;gap:22px;box-sizing:border-box}
.hks *,.hks *::before,.hks *::after{box-sizing:border-box}
.hks a{color:inherit;text-decoration:none}
.hks-top{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px}
.hks-portrait{position:relative;display:block;overflow:hidden;border-radius:var(--hk-portrait);background:var(--hk-elev);border:1px solid var(--hk-line);flex:none}
.hks-name{margin:6px 0 0;font:var(--hk-weight) clamp(30px,8vw,40px)/1.02 var(--hk-display);text-transform:var(--hk-case);letter-spacing:var(--hk-track)}
.hks-label{margin:0;font:600 11px/1.3 var(--hk-label);letter-spacing:.16em;text-transform:uppercase;color:var(--hk-muted)}
.hks-pain{margin:4px 0 0;max-width:34ch;font-size:16px;line-height:1.5;color:var(--hk-muted)}
.hks-col{display:flex;flex-direction:column;gap:10px}
.hks-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.hks-span{grid-column:1/-1}
.hks-btn{display:flex;align-items:center;justify-content:center;min-height:52px;padding:14px 22px;border-radius:var(--hk-r-btn);background:var(--hk-accent);color:var(--hk-on-accent)!important;font:700 14px/1 var(--hk-label);letter-spacing:.08em;text-transform:uppercase;clip-path:var(--hk-btn-clip,none)}
.hks-btn:focus-visible,.hks-card:focus-visible{outline:2px solid var(--hk-accent);outline-offset:3px}
.hks-btn--ghost{background:transparent;color:var(--hk-text)!important;border:1px solid var(--hk-line)}
.hks-card{display:flex;align-items:center;gap:14px;padding:16px;background:var(--hk-raised);border:1px solid var(--hk-line);border-radius:var(--hk-r);clip-path:var(--hk-card-clip,none);transition:background .15s}
.hks-card:hover{background:var(--hk-elev)}
.hks-door>span:not(.hks-glyph){flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.hks-card b{font:var(--hk-weight) 17px/1.2 var(--hk-display);text-transform:var(--hk-case)}
.hks-card small{font-size:13px;line-height:1.4;color:var(--hk-muted)}
.hks-glyph{display:inline-flex;color:var(--hk-accent-text)}
.hks-sq{flex-direction:column;align-items:flex-start;justify-content:space-between;aspect-ratio:1;padding:18px}
.hks-prod{flex-direction:column;align-items:flex-start;gap:10px;padding:18px}
.hks-prod:last-child:nth-child(odd){grid-column:1/-1}
.hks-date>span:nth-child(2){flex:1;display:flex;flex-direction:column;gap:3px}
.hks-day{display:flex;flex-direction:column;align-items:center;min-width:44px}
.hks-day b{font:var(--hk-weight) 28px/1 var(--hk-display);color:var(--hk-accent-text)}
.hks-day small{font:600 10px/1 var(--hk-label);letter-spacing:.14em;text-transform:uppercase}
.hks-badge{font:600 11px/1 var(--hk-label);letter-spacing:.08em;text-transform:uppercase;color:var(--hk-accent-text);white-space:nowrap}
.hks-photo{position:relative;aspect-ratio:4/5;margin:-40px -20px 0;overflow:hidden;background:var(--hk-elev);clip-path:var(--hk-frame)}
.hks-display{margin:0;font:var(--hk-weight) clamp(36px,10vw,52px)/1 var(--hk-display);text-transform:var(--hk-case);letter-spacing:var(--hk-track)}
.hks-display em{font-style:var(--hk-em,italic);color:var(--hk-accent-text)}
.hks-body{margin:0;font-size:16px;line-height:1.6;color:var(--hk-muted)}
.hks-profile{display:flex;align-items:center;gap:16px;padding-top:12px}
.hks-profile .hks-name{margin:0;font-size:28px}
.hks-quote{margin:0;padding:18px 20px;border-left:3px solid var(--hk-accent);background:var(--hk-raised);font:400 20px/1.4 var(--hk-display);font-style:italic;border-radius:0 var(--hk-r) var(--hk-r) 0}
.hks-foot{display:flex;flex-direction:column;gap:14px;align-items:stretch;text-align:center;margin-top:auto;padding-top:8px}
@media (min-width:640px){.hks{padding:56px 32px 32px}.hks-photo{margin:-56px -32px 0;aspect-ratio:16/11}}
@media (prefers-reduced-motion:reduce){.hks-card{transition:none}}

/* Bold: condensed caps, square corners, angled cuts (its --frame, lib/theme/block-contract-map.json). */
.hks[data-kit-theme="bold"]{--hk-display:var(--font-sofia-xc,'Arial Narrow'),'Arial Narrow',Impact,sans-serif;--hk-body:var(--font-barlow,'Helvetica Neue'),'Helvetica Neue',Arial,sans-serif;--hk-label:var(--font-plex-mono,ui-monospace),ui-monospace,monospace;--hk-case:uppercase;--hk-weight:800;--hk-track:.01em;--hk-r:0;--hk-r-btn:0;--hk-portrait:0;--hk-em:normal;
  --hk-frame:polygon(0 0,100% 0,100% calc(100% - 28px),calc(100% - 48px) 100%,0 100%);--hk-card-clip:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,0 100%);--hk-btn-clip:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,0 100%)}
.hks[data-kit-theme="bold"] .hks-card b{font-size:20px}
/* Wildheart: Fell and Garamond, petal corners, an arched portrait. */
.hks[data-kit-theme="wildheart"]{--hk-display:var(--font-wh-fell,'IM Fell English'),'IM Fell English',Georgia,serif;--hk-body:var(--font-wh-garamond,'EB Garamond'),'EB Garamond',Georgia,serif;--hk-label:var(--font-wh-hanken,'Hanken Grotesk'),'Hanken Grotesk',system-ui,sans-serif;--hk-weight:400;--hk-r:22px 22px 4px 22px;--hk-portrait:50% 50% 12px 12px / 38% 38% 12px 12px;
  --hk-frame:inset(0 round 0 0 48% 48% / 0 0 12% 12%)}
.hks[data-kit-theme="wildheart"] .hks-pain,.hks[data-kit-theme="wildheart"] .hks-body{font-size:18px}
/* Nocturne: Bodoni over Geist, square frames, hairlines, no lift. */
.hks[data-kit-theme="midnight"]{--hk-display:var(--font-mn-bodoni,'Bodoni Moda'),'Bodoni Moda',Didot,Georgia,serif;--hk-body:var(--font-mn-geist,Geist),Geist,system-ui,sans-serif;--hk-label:var(--font-mn-geist,Geist),Geist,system-ui,sans-serif;--hk-weight:400;--hk-r:2px;--hk-r-btn:2px;--hk-portrait:2px;--hk-frame:none}
.hks[data-kit-theme="midnight"] .hks-photo img{filter:grayscale(1) contrast(1.05)}
/* Aiden Tyack (private, LIVE-2515): Grenze Gotisch in Title Case over Archivo, nearly square corners, and the 1.5px dashed stitch
   inside every card (7px), photo (9px) and button (4px), as on its website (components/sites/aiden-tyack-css.ts). */
.hks[data-kit-theme="aiden-tyack"]{--hk-display:var(--font-at-display,'Grenze Gotisch'),'Grenze Gotisch',Georgia,serif;--hk-body:var(--font-at-body,Archivo),Archivo,system-ui,sans-serif;--hk-label:var(--font-at-body,Archivo),Archivo,system-ui,sans-serif;--hk-weight:700;--hk-track:0;--hk-em:normal;--hk-r:3px;--hk-r-btn:3px;--hk-portrait:3px;--hk-frame:none;--hk-stitch:color-mix(in oklab,var(--hk-text) 38%,var(--hk-canvas))}
.hks[data-kit-theme="aiden-tyack"] .hks-card{outline:1.5px dashed var(--hk-stitch);outline-offset:-7px;box-shadow:0 1px 2px color-mix(in oklab,var(--hk-text) 12%,transparent)}
.hks[data-kit-theme="aiden-tyack"] .hks-btn{outline:1.5px dashed color-mix(in oklab,var(--hk-on-accent) 55%,var(--hk-accent));outline-offset:-4px}
.hks[data-kit-theme="aiden-tyack"] .hks-btn--ghost{outline-color:var(--hk-stitch)}
.hks[data-kit-theme="aiden-tyack"] .hks-photo{outline:1.5px dashed color-mix(in oklab,var(--hk-raised) 70%,transparent);outline-offset:-9px}
.hks[data-kit-theme="aiden-tyack"] .hks-portrait{outline:1.5px dashed var(--hk-stitch);outline-offset:-5px}
.hks[data-kit-theme="aiden-tyack"] .hks-quote{border-left:0;outline:1.5px dashed var(--hk-stitch);outline-offset:-7px;font-family:var(--font-at-voice,'Cormorant Garamond'),'Cormorant Garamond',Georgia,serif;font-size:22px}
.hks[data-kit-theme="aiden-tyack"] .hks-label,.hks[data-kit-theme="aiden-tyack"] .hks-badge{letter-spacing:.18em}
.hks[data-kit-theme="aiden-tyack"] .hks-btn:focus-visible,.hks[data-kit-theme="aiden-tyack"] .hks-card:focus-visible{outline:2px solid var(--hk-accent);outline-offset:3px}
`
