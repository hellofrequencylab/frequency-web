// THE TEMPLE KIT SITE CHROME SKIN (design: ui_kits/site/Header.jsx and tokens/effects.css). The announce bar, the sticky glass
// header (and its pill variant), the bag drawer, the account menu, the footer, the buttons and the form fields, scoped under
// [data-house-theme="temple-kit"] so it can only ever dress the stand-alone site render (components/sites/site-chrome.tsx sets that
// attribute; nothing in a member, Space console or admin area does: app/(main)/no-site-theme-in-member-area.test.ts guards it).
// Every colour reads the token block (lib/theme/temple-kit.ts); the sizes are the design's own, measured in
// design-renders/measured.md. It layers after the foundation skin (temple-kit-css.ts) and the house sheets.
//
// Two fixes to the design, on purpose: its header overflowed 1280 by 183px (the full nav only fits from about 1520), so the
// tagline folds away under 1520 and the nav tightens until it fits, and under 1280 the hamburger takes over; and its announce
// bar clipped mid-word at 390, so the line is tightened and ends in an ellipsis.

const N = '[data-house-theme="temple-kit"]'
// Header rules sit under the sticky top block and the header, so they outrank the owner's header look (SITE_LOOK_CSS, which loads after).
const T = `${N} .tk-top .hs-header`
const EASE = 'var(--ease-out)'
const LABEL = 'font-family:var(--font-label);text-transform:uppercase;letter-spacing:var(--label-tracking);font-weight:var(--weight-regular)'
const GLASS = 'background:color-mix(in oklab,var(--color-surface) 88%,transparent);-webkit-backdrop-filter:var(--blur-glass);backdrop-filter:var(--blur-glass)'

export const TEMPLE_KIT_CHROME_CSS = `
${N} .hs-btn{position:relative;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;gap:10px;box-sizing:border-box;height:50px;padding:0 30px;font-family:var(--font-sans);font-size:16px;font-weight:var(--weight-medium);letter-spacing:.02em;line-height:1;text-transform:none;text-decoration:none;white-space:nowrap;border:1px solid transparent;border-radius:var(--radius-control);cursor:pointer;transition:color var(--motion-fast) ${EASE},background-color var(--motion-fast) ${EASE},border-color var(--motion-fast) ${EASE},box-shadow var(--motion-fast) ${EASE},transform var(--motion-fast) ${EASE}}
${N} .hs-btn[data-size="sm"]{height:40px;padding:0 20px;font-size:14px}
${N} .hs-btn[data-size="lg"]{height:60px;padding:0 38px;font-size:18px}
${N} .hs-btn-primary::before,${N} .hs-btn-dark::before{content:"";position:absolute;inset:0;background-image:var(--texture-grit);background-size:300px;opacity:.14;mix-blend-mode:soft-light;pointer-events:none}
${N} .hs-btn-secondary,${N} .hs-btn-soft,${N} .hs-btn-light{background:color-mix(in srgb,var(--surface-card) 50%,transparent);color:var(--tk-umber-900);border-color:var(--line-rule);box-shadow:0 1px 2px color-mix(in srgb,var(--tk-clay-700) 10%,transparent)}
${N} .hs-btn-secondary:hover,${N} .hs-btn-soft:hover,${N} .hs-btn-light:hover{background:color-mix(in srgb,var(--surface-card) 85%,transparent);color:var(--tk-umber-900);border-color:var(--line-strong);box-shadow:0 3px 8px -2px color-mix(in srgb,var(--tk-clay-700) 16%,transparent)}
${N} .hs-btn:hover{transform:translateY(-1px)}
${N} .hs-btn-primary:active,${N} .hs-btn-dark:active{background:var(--tk-clay-700);border-color:var(--tk-clay-700);box-shadow:var(--shadow-inset-deep)}
${N} .hs-btn:active{transform:scale(var(--press-scale))}
${N} .hs-btn:disabled,${N} .hs-btn[aria-disabled="true"]{opacity:.45;cursor:not-allowed;pointer-events:none}
${N} .hs-btn:focus-visible{box-shadow:var(--ring-focus)}

${N} .field{display:flex;flex-direction:column;gap:8px;min-width:0}
${N} .mu-label{display:block;font-family:var(--font-sans);font-size:11px;font-weight:var(--weight-medium);line-height:1.2;text-transform:uppercase;letter-spacing:var(--tracking-label);color:var(--color-text-subtle)}
${N} .mu-hint,${N} .mu-err{font-size:13px;font-weight:var(--weight-light);line-height:1.35}
${N} .mu-hint{color:var(--color-text-subtle)}
${N} .mu-err{color:var(--color-danger)}
${N} .input{width:100%;box-sizing:border-box;height:52px;padding:0 17px;color:var(--tk-umber-900);font-family:var(--font-sans);font-size:16px;font-weight:var(--weight-light);outline:none;background-color:var(--tk-plaster-50);background-image:var(--texture-sand);background-size:200px;background-blend-mode:multiply;border:1px solid var(--line-hairline);border-radius:var(--radius-sm);box-shadow:var(--shadow-inset);transition:border-color var(--motion-fast) ${EASE},box-shadow var(--motion-fast) ${EASE}}
${N} .input::placeholder{color:var(--color-text-subtle);opacity:1}
${N} textarea.input{height:auto;min-height:110px;padding:15px 17px;line-height:var(--leading-relaxed);resize:vertical}
${N} select.input{appearance:none;-webkit-appearance:none;padding:0 40px 0 16px;cursor:pointer}
${N} .input:focus,${N} .input:focus-visible{border-color:var(--tk-clay-400);box-shadow:var(--ring-focus)}
${N} .input[aria-invalid="true"]{border-color:var(--color-danger)}
${N} .input:disabled{opacity:.5;cursor:not-allowed}

${N} .tk-top{position:sticky;top:0;z-index:50}
${N} .tk-top .hs-header{position:relative;top:auto;z-index:auto;padding:0;background:transparent;transition:none}
${N} .tk-top .hs-header[data-hidden]{opacity:1;transform:none;pointer-events:auto}

${N} .tk-bar{height:36px;overflow:hidden;background:var(--color-surface);border-bottom:1px solid var(--color-border);transition:height var(--motion-fast) ${EASE},border-color var(--motion-fast) ${EASE}}
${N}[data-scrolled] .tk-bar{height:0;border-bottom-color:transparent}
${N} .tk-bar-row{box-sizing:border-box;height:36px;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:0 var(--space-gutter)}
${N} .tk-bar-line{margin:0;min-width:0;display:flex;align-items:center;gap:10px;${LABEL};font-size:10px;color:var(--color-text-muted)}
${N} .tk-bar-line svg{flex:none;color:var(--color-accent-strong)}
${N} .tk-bar-line span{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
${N} .tk-bar-links{display:none;gap:24px}
${N} .tk-bar-links a{${LABEL};font-size:10px;color:var(--color-text-muted);white-space:nowrap}
${N} .tk-bar-links a:hover{color:var(--color-text)}
@media (min-width:1240px){${N} .tk-bar-links{display:flex}}
@media (max-width:480px){${N} .tk-bar-line,${N} .tk-bar-links a{letter-spacing:.14em}}

${T} .hs-pill{position:relative;box-sizing:border-box;max-width:none;margin:0;min-height:0;height:var(--site-header-height);display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 var(--space-gutter);border:0;border-bottom:1px solid var(--color-border-strong);border-radius:0;${GLASS};box-shadow:none;overflow:visible;animation:none;transition:height var(--motion-fast) ${EASE},box-shadow var(--motion-fast) ${EASE}}
${T} .hs-pill::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;opacity:.45;pointer-events:none;background:linear-gradient(90deg,transparent,var(--color-accent) 50%,transparent)}
${N}[data-scrolled] .tk-top .hs-header .hs-pill{height:calc(var(--site-header-height) - 12px);box-shadow:var(--shadow-float)}
${T} .hs-brand{flex:none;display:block;padding:0;min-width:0;overflow:visible;font-size:inherit;color:var(--color-text)}
${T} .hs-brand:hover{color:var(--color-text)}

${N} .tk-logo{display:flex;align-items:center;gap:14px;min-width:0;color:var(--color-text)}
${N} .tk-mark{position:relative;flex:none;box-sizing:border-box;width:44px;height:50px;padding-top:4px;display:flex;align-items:center;justify-content:center;border:1px solid var(--line-rule);border-radius:var(--radius-arch-soft);color:var(--color-accent-strong);background-color:var(--surface-card);background-image:radial-gradient(ellipse 90% 70% at 50% 0%,color-mix(in srgb,var(--tk-saffron-400) 32%,transparent),transparent 70%)}
${N} .tk-mark-ring{position:absolute;inset:3px;border:1px solid var(--line-hairline);border-radius:inherit;pointer-events:none}
${N} .tk-mark-img{position:absolute;inset:7px;width:calc(100% - 14px);height:calc(100% - 14px);object-fit:contain}
${N} .tk-logo-text{display:flex;flex-direction:column;align-items:flex-start;min-width:0;line-height:1}
${N} .tk-logo-name{font-family:var(--font-hero);font-weight:400;font-size:30px;letter-spacing:.01em;line-height:1;color:var(--color-heading);white-space:nowrap}
${N} .tk-logo-tag{max-width:30em;margin-top:5px;overflow:hidden;font-family:var(--font-label);font-size:9px;letter-spacing:.24em;text-transform:uppercase;text-overflow:ellipsis;white-space:nowrap;color:var(--color-text-subtle)}

${T} .hs-nav{display:none;flex:0 1 auto;min-width:0;margin:-6px 0 -10px;padding:6px 0 10px;overflow-x:auto;-webkit-mask-image:none;mask-image:none}
${T} .hs-nav-track{display:flex;align-items:center;gap:30px;width:max-content;margin:0;padding:0}
${T} .hs-nav a,${T} .hs-nav-mega{position:relative;display:flex;align-items:center;gap:8px;padding:10px 0;border:0;border-radius:0;background:none;${LABEL};font-size:11.5px;color:var(--color-text-muted);white-space:nowrap;transition:color var(--motion-fast) ${EASE}}
${T} .hs-nav a:hover,${T} .hs-nav-mega:hover,${T} .hs-nav-mega[aria-expanded="true"],${T} .hs-nav a[aria-current="page"]{background:none;color:var(--color-text)}
${T} .hs-nav a::after,${T} .hs-nav-mega::after{content:"";position:absolute;left:50%;bottom:-2px;width:0;height:1px;background:var(--color-accent);transform:translateX(-50%);transition:width var(--motion-fast) ${EASE}}
${T} .hs-nav a:hover::after,${T} .hs-nav a[aria-current="page"]::after,${T} .hs-nav-mega[aria-expanded="true"]::after{width:100%}
${T} .hs-nav a[aria-current="page"]::before{content:"";position:absolute;left:50%;bottom:-5px;width:5px;height:5px;border-radius:var(--radius-pill);background:var(--color-accent);transform:translateX(-50%)}
${T} .hs-nav-admin{margin-left:0}

${T} .hs-header-actions{display:contents}
${N} .tk-tools{display:flex;align-items:center;gap:4px;margin-left:auto}
${N} .tk-icon-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:38px;height:38px;padding:0;border:0;border-radius:0;background:none;color:var(--color-text-muted);cursor:pointer;transition:color var(--motion-fast) ${EASE},background var(--motion-fast) ${EASE}}
${N} .tk-icon-btn:hover,${N} .tk-icon-btn[data-active]{color:var(--color-text)}
${N} .tk-icon-btn[data-bare]{width:40px;height:40px;border-radius:var(--radius-pill);color:var(--color-text)}
${N} .tk-icon-btn[data-bare]:hover{background:var(--surface-veil)}
${N} .tk-icon-btn:focus-visible{box-shadow:var(--ring-focus)}
${N} .tk-count{position:absolute;top:4px;right:2px;box-sizing:border-box;min-width:15px;height:15px;padding:0 4px;display:flex;align-items:center;justify-content:center;border-radius:var(--radius-pill);background:var(--color-accent);color:var(--color-text-on-accent);font-family:var(--font-sans);font-size:9px;font-weight:var(--weight-semibold)}
${N} .tk-avatar{box-sizing:border-box;width:30px;height:30px;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid var(--line-hairline);border-radius:var(--radius-circle);background:var(--tk-plaster-200);color:var(--color-text-muted);font-family:var(--font-display);font-size:12px;line-height:1}
${N} .tk-avatar[data-size="lg"]{flex:none;width:40px;height:40px;font-size:16px}
${N} .tk-avatar img{width:100%;height:100%;object-fit:cover}
${N} .tk-tools-rule{width:1px;height:28px;margin:0 8px;background:var(--color-border-strong)}
${N} .tk-account{position:relative}
${T} .hs-member{padding:0 14px;height:34px;display:inline-flex;align-items:center;border:1px solid var(--line-rule);border-radius:var(--radius-pill);background:transparent;color:var(--color-text);${LABEL};font-size:10px}
${T} .hs-member:hover{background:var(--surface-veil);color:var(--color-text)}
${T} .hs-btn-dark,${T} .hs-btn-primary{flex:none;height:40px;padding:0 20px;font-size:14px;border-radius:var(--radius-control);background:var(--mn-solid);color:var(--kit-on-solid);border-color:var(--mn-solid);box-shadow:var(--shadow-button)}
${T} .hs-btn-dark:hover,${T} .hs-btn-primary:hover{background:var(--mn-solid-hover);border-color:var(--mn-solid-hover);color:var(--kit-on-solid);box-shadow:var(--shadow-button-hover)}
${T} .hs-btn-dark:active,${T} .hs-btn-primary:active{background:var(--tk-clay-700);border-color:var(--tk-clay-700);box-shadow:var(--shadow-inset-deep)}
${T} .hs-btn-dark:focus-visible,${T} .hs-btn-primary:focus-visible{box-shadow:var(--ring-focus)}

${T} .hs-menu{order:-1;display:block}
${T} .hs-menu-button{width:40px;height:40px;border:0;border-radius:var(--radius-pill);background:transparent;color:var(--color-text);transition:background var(--motion-fast) ${EASE}}
${T} .hs-menu-button:hover{background:var(--surface-veil)}
${T} .hs-menu-button:focus-visible{box-shadow:var(--ring-focus)}
${T} .hs-menu-panel{position:absolute;left:0;right:0;top:100%;max-width:none;margin:0;padding:20px var(--space-gutter) 28px;gap:14px;border:0;border-top:1px solid var(--color-border);border-bottom:1px solid var(--color-border-strong);border-radius:0;background:var(--color-surface-elevated);box-shadow:var(--shadow-float);display:flex;flex-direction:column}
${T} .hs-menu-panel a{display:flex;align-items:center;gap:8px;padding:6px 0;border-radius:0;${LABEL};font-size:13px;color:var(--color-text-muted)}
${T} .hs-menu-panel a:hover,${T} .hs-menu-panel a[aria-current="page"]{color:var(--color-text);background:none}
${T} .hs-menu-panel a[data-cta]{display:none}
${T} .hs-menu-panel [data-menu-group]{display:block;${LABEL};font-size:10px;color:var(--color-text-subtle)}
${T} .hs-mega-panel{border-radius:var(--radius-card);background:var(--color-surface-elevated);-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:var(--shadow-menu)}
${T} .hs-mega-links a{border-radius:var(--radius-control);color:var(--color-text-muted)}
${T} .hs-mega-links a:hover{background:var(--color-surface-hover);color:var(--color-text)}

@media (max-width:1279px){
${T} .tk-logo{gap:10px}
${T} .tk-mark{width:34px;height:39px;padding-top:3px}
${T} .tk-logo-name{font-size:24px}
${T} .tk-logo-tag{display:none}
}
@media (min-width:1280px){
${T} .hs-nav{display:block}
${T} .hs-menu{display:none}
${T} .hs-pill{gap:32px}
${T} .tk-tools{margin-left:0}
${T} .tk-tools-rule{margin:0 14px 0 10px}
${T} .hs-btn-dark,${T} .hs-btn-primary{height:50px;padding:0 30px;font-size:16px}
}
@media (min-width:1280px) and (max-width:1559px){
${N} .tk-logo-tag{display:none}
${T} .hs-pill{gap:20px}
${T} .hs-nav-track{gap:clamp(12px,1.55vw,22px)}
${T} .hs-btn-dark,${T} .hs-btn-primary{height:44px;padding:0 22px;font-size:15px}
}
${N} .hs-cta-short{display:none}
@media (max-width:639px){
${T} .hs-btn-dark,${T} .hs-btn-primary{min-width:0;max-width:34vw;padding:0 14px}
${T} .hs-cta-long{display:none}
${T} .hs-cta-short{display:inline}
${T} .hs-btn-dark:not(:has(.hs-cta-short)) .hs-cta-long{display:inline}
${N} .tk-tools-rule{margin:0 4px}
}

${N}[data-site-header="pill"] .tk-top .hs-header .hs-pill{width:auto;height:var(--site-header-height);margin:12px var(--space-gutter) 0;padding:0 12px 0 20px;border:1px solid var(--color-border-strong);border-radius:var(--site-header-radius);box-shadow:var(--shadow-float)}
${N}[data-site-header="pill"] .tk-top .hs-header .hs-pill::after{content:none}
${N}[data-site-header="pill"][data-scrolled] .tk-top .hs-header .hs-pill{height:var(--site-header-height)}
${N}[data-site-header="pill"] .tk-top .hs-header .hs-menu-panel{left:var(--space-gutter);right:var(--space-gutter);top:calc(100% + 8px);border:1px solid var(--color-border-strong);border-radius:var(--radius-card)}

${N} .tk-menu{position:absolute;right:0;top:calc(100% + 10px);z-index:31;box-sizing:border-box;width:290px;max-width:calc(100vw - 2 * var(--space-gutter));padding:20px;background:var(--color-surface-elevated);box-shadow:var(--shadow-menu);color:var(--color-text);font-family:var(--font-sans);text-align:left;text-transform:none;letter-spacing:normal}
${N} .tk-menu-who{display:flex;align-items:center;gap:12px;padding-bottom:16px;border-bottom:1px solid var(--color-border)}
${N} .tk-menu-who b{display:block;font-size:15px;font-weight:var(--weight-medium)}
${N} .tk-menu-who small{display:block;font-size:12px;color:var(--color-text-subtle)}
${N} .tk-menu-item{display:flex;align-items:center;gap:12px;box-sizing:border-box;width:100%;padding:11px 0;border-bottom:1px solid var(--color-border);color:var(--color-text);font-size:14px;line-height:1.3;text-decoration:none}
${N} .tk-menu-item:hover{color:var(--color-text)}
${N} .tk-menu-item svg{flex:none;color:var(--color-text-subtle)}
${N} .tk-menu-out{margin-top:14px;padding:0;border:0;background:none;${LABEL};font-size:11px;color:var(--color-text-muted);cursor:pointer}
${N} .tk-menu-out:hover{color:var(--color-text)}
${N} .tk-menu-in{display:flex;flex-direction:column;gap:14px}
${N} .tk-menu-in .hs-btn{width:100%}
${N} .tk-menu-welcome{margin:0;font-family:var(--font-display);font-size:24px;line-height:var(--leading-display);letter-spacing:var(--tracking-display);color:var(--color-heading)}
${N} .tk-menu-welcome em{font-style:var(--display-em-style);color:var(--display-em-color)}
${N} .tk-menu-body{margin:0;font-size:13px;color:var(--color-text-muted)}

${N} .tk-drawer{position:fixed;inset:0 0 0 auto;box-sizing:border-box;width:440px;max-width:100%;height:100dvh;max-height:none;margin:0;padding:0;border:0;border-left:1px solid var(--color-border-strong);background:var(--color-surface);color:var(--color-text);font-family:var(--font-sans);overflow:visible}
${N} .tk-drawer::backdrop{background:var(--color-scrim)}
${N} .tk-drawer-panel{display:flex;flex-direction:column;height:100%}
${N} .tk-drawer-head{display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-bottom:1px solid var(--color-border)}
${N} .tk-drawer-title{${LABEL};font-size:var(--text-eyebrow);font-weight:var(--weight-medium);color:var(--color-text)}
${N} .tk-drawer-meter{padding:16px 24px;border-bottom:1px solid var(--color-border);font-size:12px}
${N} .tk-meter-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin:0 0 8px}
${N} .tk-meter-row span:last-child{font-variant-numeric:tabular-nums;color:var(--color-text-muted)}
${N} .tk-meter{display:block;height:3px;overflow:hidden;border-radius:var(--radius-pill);background:var(--tk-plaster-300);box-shadow:var(--shadow-inset)}
${N} .tk-meter span{display:block;height:100%;border-radius:inherit;background:var(--tk-clay-500)}
${N} .tk-drawer-body{flex:1;overflow:auto;padding:0 24px}
${N} .tk-empty{margin-top:40px;padding:56px 24px;text-align:center;border:1px dashed var(--color-border-strong)}
${N} .tk-empty-mark{display:inline-flex;margin-bottom:18px;color:var(--color-text-subtle)}
${N} .tk-empty-title{margin:0;font-family:var(--font-display);font-size:26px;line-height:1.1;color:var(--color-text)}
${N} .tk-empty-body{margin:10px auto 0;max-width:28rem;font-size:14px;color:var(--color-text-muted)}
${N} .tk-empty .hs-btn{margin-top:24px}
${N} .tk-line{display:grid;grid-template-columns:56px 1fr auto;gap:16px;align-items:start;padding:18px 0;border-bottom:1px solid var(--color-border)}
${N} .tk-line-img{width:56px;height:56px;object-fit:cover;display:block;border:1px solid var(--color-border);background:var(--color-surface)}
${N} .tk-line-title{margin:0;font-family:var(--font-display);font-size:19px;line-height:1.2}
${N} .tk-line-meta{margin:4px 0 0;font-size:12px;color:var(--color-text-subtle)}
${N} .tk-line-price{margin:0;font-size:14px;font-variant-numeric:tabular-nums lining-nums;letter-spacing:.02em}
${N} .tk-drawer-foot{display:flex;flex-direction:column;gap:14px;padding:24px;border-top:1px solid var(--color-border)}
${N} .tk-drawer-sub{display:flex;align-items:baseline;justify-content:space-between;margin:0}
${N} .tk-drawer-sub span{${LABEL};font-size:var(--text-eyebrow);font-weight:var(--weight-medium);color:var(--text-accent)}
${N} .tk-drawer-sub b{font-family:var(--font-display);font-size:30px;font-weight:var(--weight-display);color:var(--color-heading)}
${N} .tk-drawer-foot .hs-btn{width:100%}
${N} .tk-drawer-fine{margin:0;font-size:12px;text-align:center;color:var(--color-text-subtle)}

${N} .tk-footer-ground{position:relative;overflow:hidden;isolation:isolate;background-color:var(--surface-sunk);background-image:var(--wash-dawn);border-top:1px solid var(--line-hairline);padding:var(--space-20) var(--space-gutter) var(--space-8)}
${N} .tk-footer-ground::after{content:"";position:absolute;right:-6%;bottom:-24%;width:48%;height:120%;background-image:var(--motif-palm-fan);background-repeat:no-repeat;background-position:bottom right;background-size:contain;opacity:var(--motif-opacity);mix-blend-mode:multiply;pointer-events:none;z-index:-1}
${N} .tk-footer-ground .hs-footer-top{width:auto;max-width:none;margin:0;padding:0;border:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:40px}
${N} .tk-footer-ground .hs-footer-brand{grid-column:span 2;min-width:0;gap:0;align-items:stretch}
${N} .tk-footer-ground .hs-footer-brand>.hs-brand{display:block;margin-bottom:28px;font-size:inherit}
${N} .tk-footer-ground .hs-footer-brand>p{margin:0 0 24px;max-width:34ch;font-size:14px;color:var(--color-text-muted)}
${N} .tk-letter-title{margin:0;font-family:var(--font-display);font-size:30px;font-weight:var(--weight-display);line-height:var(--leading-display);letter-spacing:var(--tracking-display);color:var(--color-heading);text-wrap:balance}
${N} .tk-letter-title em{font-style:var(--display-em-style);color:var(--display-em-color)}
${N} .tk-letter-form{display:flex;align-items:flex-end;gap:16px;max-width:440px;margin-top:24px}
${N} .tk-letter-field{flex:1}
${N} .tk-letter-done{margin:24px 0 0;font-size:14px;color:var(--color-text-muted)}
${N} .tk-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
${N} .tk-footer-ground .hs-footer-col{display:block}
${N} .tk-footer-ground .hs-footer-col-title{display:block;margin:0 0 16px;font-family:var(--font-label);font-size:var(--text-eyebrow);font-weight:var(--weight-medium);text-transform:uppercase;letter-spacing:var(--label-tracking);color:var(--text-accent)}
${N} .tk-footer-ground .hs-footer-col a,${N} .tk-footer-ground .hs-footer-links a{display:block;padding:4px 0;font-size:14px;font-weight:var(--weight-regular);color:var(--color-text-muted)}
${N} .tk-footer-ground .hs-footer-col a:hover,${N} .tk-footer-ground .hs-footer-links a:hover{color:var(--color-text)}
${N} .tk-footer-ground .hs-footer-links{display:block}
${N} .tk-footer-ground .hs-footer{width:auto;max-width:none;margin:64px 0 0;padding:20px 0 0;border-top:1px solid var(--color-border);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;font-family:var(--font-label);font-size:var(--text-eyebrow);font-weight:var(--weight-medium);letter-spacing:var(--label-tracking);text-transform:uppercase;color:var(--color-text-subtle)}
${N} .tk-footer-ground .hs-footer a{font-weight:inherit;color:inherit}
${N} .tk-footer-ground .hs-footer a:hover{color:var(--color-text)}
${N} .tk-footer-ground .hs-footer-line,${N} .tk-footer-ground .hs-footer-note{margin-left:auto}
@media (max-width:639px){
${N} .tk-letter-form{flex-direction:column;align-items:stretch}
${N} .tk-footer-ground .hs-footer-brand{grid-column:1 / -1}
}
@media (prefers-reduced-motion:reduce){${N} .hs-btn:hover,${N} .hs-btn:active{transform:none}}
`
