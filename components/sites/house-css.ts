// THE HOUSE WEBSITE THEME'S STYLES (components/sites). Static, scoped under [data-house-site], so safe to
// inline. DAWN semantic tokens only: the Space's brand accent (AccentScope) repaints every amber here, and
// alpha washes are `color-mix` over tokens rather than raw colors. Faces: the house serif (Playfair) and
// sans (Space Grotesk) by default; a Space that chose a page theme (ADR-578) gets that theme's heading and
// body faces instead (data-house-fonts="theme"). No borders or rules anywhere: sections part with space,
// warm diffuse shadows and tonal panels. Reduced motion stops every animation.

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .24 0 0 0 0 .2 0 0 0 0 .16 0 0 0 .06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

/** `color-mix` shorthand: a token at a percentage over transparent. */
const a = (token: string, pct: number) => `color-mix(in srgb,var(--color-${token}) ${pct}%,transparent)`

const WARM = (y: number, blur: number, spread: number, pct: number) => `0 ${y}px ${blur}px -${spread}px ${a('text', pct)}`

export const HOUSE_CSS = `
html:has([data-house-site]){scroll-behavior:smooth;scroll-padding-top:96px}
html:has([data-house-site]),body:has([data-house-site]){background:var(--color-canvas)}
[data-house-site]{--hs-serif:var(--font-playfair);--hs-sans:var(--font-grotesk);min-height:100dvh;display:flex;flex-direction:column;font-family:var(--hs-sans),system-ui,sans-serif;font-size:17px;line-height:1.65;color:var(--color-text);background-color:var(--color-canvas);background-image:${GRAIN};overflow-x:clip;-webkit-font-smoothing:antialiased}
[data-house-site][data-house-fonts="theme"]{--hs-serif:var(--font-heading,var(--font-display));--hs-sans:var(--font-body,var(--font-nunito))}
[data-house-site] *,[data-house-site] *::before,[data-house-site] *::after{box-sizing:border-box}
[data-house-site] main{flex:1}
[data-house-site] a{text-decoration:none}
[data-house-site] img{display:block}
.hs-serif,.hs-h1,.hs-h2,.hs-brand{font-family:var(--hs-serif),Georgia,serif;font-weight:400}
.hs-eyebrow{display:inline-flex;align-items:center;gap:10px;font-size:12px;font-weight:600;letter-spacing:.25em;text-transform:uppercase;color:var(--color-primary-strong)}
.hs-h2{margin:0;font-size:clamp(2.4rem,4.8vw,3.8rem);line-height:1.04;letter-spacing:-.02em;text-wrap:balance}
.hs-accent{font-style:italic;color:var(--color-primary-strong)}
.hs-muted{color:var(--color-text-muted)}
.hs-lead{margin:0;font-size:1.15rem;line-height:1.7;color:var(--color-text-muted);text-wrap:pretty}
.hs-section{max-width:1160px;margin:0 auto;padding:0 clamp(20px,4vw,48px) clamp(112px,13vw,180px)}
.hs-section-first{padding-top:clamp(112px,13vw,180px)}
.hs-wide{max-width:1320px;margin:0 auto;padding:0 clamp(12px,2vw,24px) clamp(112px,13vw,180px)}
.hs-split{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr));gap:clamp(40px,7vw,104px)}
.hs-stack{display:flex;flex-direction:column;gap:20px}
.hs-center{display:flex;flex-direction:column;align-items:center;text-align:center;gap:16px;margin-bottom:clamp(40px,5vw,64px)}

.hs-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;border-radius:999px;font-weight:600;white-space:nowrap;transition:background 160ms ease,color 160ms ease}
.hs-btn-primary{padding:18px 30px;font-size:17px;background:var(--color-primary);color:var(--color-text-on-primary);box-shadow:0 0 60px -10px ${a('primary', 75)}}
.hs-btn-primary:hover{background:var(--color-primary-hover);color:var(--color-text-on-primary)}
.hs-btn-glass{padding:18px 28px;font-size:17px;background:${a('on-ink', 14)};-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);color:var(--color-on-ink)}
.hs-btn-glass:hover{background:${a('on-ink', 24)};color:var(--color-on-ink)}
.hs-btn-dark{padding:12px 20px;font-size:15px;background:var(--color-text);color:var(--color-canvas)}
.hs-btn-dark:hover{background:var(--color-ink);color:var(--color-canvas)}
.hs-btn-light{padding:15px 24px;background:var(--color-surface);color:var(--color-text);box-shadow:${WARM(14, 34, 18, 40)}}
.hs-btn-soft{padding:14px 24px;background:var(--color-surface-elevated);color:var(--color-text)}
.hs-dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--color-success);animation:hs-pulse 2s ease-out infinite}
@keyframes hs-pulse{0%{box-shadow:0 0 0 0 ${a('success', 55)}}70%{box-shadow:0 0 0 8px transparent}100%{box-shadow:0 0 0 0 transparent}}

.hs-header{position:sticky;top:0;z-index:50;padding:12px clamp(12px,3vw,32px) 0}
.hs-pill{max-width:1240px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 8px 8px 20px;border-radius:999px;background:${a('surface', 72)};-webkit-backdrop-filter:blur(18px) saturate(1.3);backdrop-filter:blur(18px) saturate(1.3);box-shadow:0 10px 30px -18px ${a('ink', 35)};transition:background 260ms ease,box-shadow 260ms ease}
@supports (animation-timeline:scroll()){.hs-pill{animation:hs-pill linear both;animation-timeline:scroll(root);animation-range:0 12px}}
@keyframes hs-pill{to{background:${a('surface', 86)};box-shadow:${WARM(18, 40, 22, 40)}}}
.hs-brand{font-size:22px;font-weight:500;letter-spacing:-.01em;color:var(--color-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hs-nav{display:none;align-items:center;gap:2px;font-weight:500;font-size:15px}
.hs-nav a{padding:9px 14px;border-radius:999px;color:var(--color-text-muted);transition:background 130ms ease,color 130ms ease}
.hs-nav a:hover{background:var(--color-surface-elevated);color:var(--color-text)}
.hs-header-actions{display:flex;align-items:center;gap:8px}
.hs-menu-button{width:44px;height:44px;border-radius:50%;border:0;cursor:pointer;background:var(--color-surface-elevated);color:var(--color-text);display:flex;align-items:center;justify-content:center}
.hs-menu-panel{position:absolute;left:clamp(12px,3vw,32px);right:clamp(12px,3vw,32px);top:76px;max-width:1240px;margin:0 auto;padding:8px;border-radius:24px;background:${a('surface', 94)};-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);box-shadow:0 24px 50px -20px ${a('text', 35)};display:flex;flex-direction:column}
.hs-menu-panel a{padding:14px 18px;border-radius:16px;font-weight:500;font-size:18px;color:var(--color-text)}
@media (min-width:940px){.hs-nav{display:flex}.hs-menu{display:none}}

.hs-hero{position:relative;margin-top:-80px;min-height:max(100svh,720px);display:flex;align-items:flex-end;overflow:hidden;background:var(--color-ink);color:var(--color-on-ink)}
.hs-hero-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.hs-hero-wash{position:absolute;inset:0;background:linear-gradient(to top,${a('ink', 82)} 0%,${a('ink', 35)} 45%,${a('ink', 15)} 100%)}
.hs-hero-side{position:absolute;inset:0;background:linear-gradient(90deg,${a('ink', 55)} 0%,transparent 60%)}
.hs-hero-grid{position:relative;width:100%;max-width:1240px;margin:0 auto;padding:140px clamp(20px,4vw,48px) clamp(48px,7vw,88px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:clamp(36px,5vw,72px);align-items:end}
.hs-hero-copy{display:flex;flex-direction:column;align-items:flex-start;gap:24px;max-width:640px}
.hs-hero-pill{display:inline-flex;align-items:center;gap:10px;padding:9px 16px 9px 12px;border-radius:999px;background:${a('on-ink', 14)};-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);color:var(--color-on-ink);font-size:14px;font-weight:500}
.hs-hero-pill:hover{background:${a('on-ink', 24)};color:var(--color-on-ink)}
.hs-h1{margin:0;font-size:clamp(3.4rem,8.4vw,7.2rem);line-height:.95;letter-spacing:-.03em;text-wrap:balance;text-shadow:0 2px 30px ${a('ink', 35)}}
.hs-hero-lede{margin:0;max-width:30em;font-size:clamp(1.1rem,1.6vw,1.3rem);line-height:1.6;color:var(--color-on-ink-muted);text-wrap:pretty}
.hs-hero-actions{display:flex;gap:12px;flex-wrap:wrap;padding-top:4px}
.hs-start{justify-self:end;width:100%;max-width:360px;padding:22px;border-radius:28px;background:${a('surface', 93)};-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);box-shadow:0 40px 80px -30px ${a('ink', 60)};display:flex;flex-direction:column;gap:16px;color:var(--color-text)}
.hs-start-who{display:flex;align-items:center;gap:16px}
.hs-start-who img{width:60px;height:60px;border-radius:50%;object-fit:cover;flex:none}
.hs-start-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 18px;border-radius:16px;background:var(--color-text);color:var(--color-canvas);font-weight:600;font-size:15px}
.hs-start-row:hover{background:var(--color-ink);color:var(--color-canvas)}

.hs-sign{display:flex;align-items:center;gap:16px;padding:18px 22px;border-radius:20px;background:${a('surface', 65)};box-shadow:${WARM(12, 30, 22, 40)};font-size:1.08rem}
.hs-sign::before{content:"";flex:none;width:8px;height:8px;border-radius:50%;background:var(--color-primary)}
.hs-pull{margin:18px 0 0;font-family:var(--hs-serif),Georgia,serif;font-style:italic;font-size:1.5rem;line-height:1.4;color:var(--color-primary-strong)}

.hs-panel{border-radius:clamp(24px,3vw,40px);background:var(--color-marketing-canvas);padding:clamp(56px,8vw,112px) clamp(24px,6vw,88px)}
.hs-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:clamp(40px,5vw,64px)}
.hs-step-n{font-family:var(--hs-serif),Georgia,serif;font-style:italic;font-size:4rem;line-height:.9;color:var(--color-primary-strong)}
.hs-step h3{margin:8px 0 0;font-size:1.35rem;line-height:1.25;font-weight:600;letter-spacing:-.01em}
.hs-step p{margin:14px 0 0;color:var(--color-text-muted);font-size:1.05rem;text-wrap:pretty}

.hs-photo{width:100%;aspect-ratio:4/5;overflow:hidden;border-radius:clamp(24px,3vw,36px);box-shadow:${WARM(50, 100, 50, 55)}}
.hs-photo img{width:100%;height:100%;object-fit:cover}
.hs-quote{margin:0;font-family:var(--hs-serif),Georgia,serif;font-size:1.45rem;line-height:1.45;text-wrap:pretty}
.hs-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px 20px;padding-top:16px}
.hs-fact-v{font-family:var(--hs-serif),Georgia,serif;font-size:clamp(1.6rem,2.6vw,2.1rem);line-height:1.1}
.hs-fact-l{color:var(--color-text-muted);font-size:14px;line-height:1.4}
.hs-photo-tall{aspect-ratio:2/3}
.hs-photo-col{display:flex;flex-direction:column;gap:28px}
@media (min-width:880px){.hs-photo-col{position:sticky;top:112px}}
.hs-photo-col .hs-pull{margin:0;padding:0 8px;font-size:1.6rem}
.hs-stats{margin-top:clamp(72px,9vw,128px)}
.hs-stats-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(36px,5vw,56px) clamp(20px,4vw,48px)}
@media (min-width:760px){.hs-stats-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
.hs-stat{display:flex;flex-direction:column;gap:10px;padding-top:20px;border-top:1px solid ${a('text', 14)}}
.hs-stat-v{font-family:var(--hs-serif),Georgia,serif;font-size:clamp(2.2rem,4.4vw,3.4rem);line-height:1;letter-spacing:-.02em;color:var(--color-primary-strong)}
.hs-stat-l{color:var(--color-text-muted);font-size:15px;line-height:1.45;max-width:16em}
.hs-hero-form{min-height:max(92svh,720px);align-items:center}
.hs-hero-form .hs-hero-grid{align-items:center;padding-top:clamp(140px,14vw,180px)}
.hs-hero-form .hs-hero-pill{text-transform:uppercase;letter-spacing:.2em;font-size:12px;font-weight:600;padding:9px 16px}
.hs-hero-form .hs-h1{font-size:clamp(3.2rem,7.4vw,6.2rem)}
.hs-hero-form + .hs-section{padding-top:clamp(96px,11vw,150px)}
.hs-hero-card{justify-self:end;width:100%;max-width:480px;filter:drop-shadow(0 40px 60px ${a('ink', 45)})}

.hs-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:clamp(16px,2.5vw,28px)}
.hs-card{display:flex;flex-direction:column;gap:16px;padding:clamp(32px,4vw,44px);border-radius:32px;background:var(--color-surface);box-shadow:${WARM(30, 70, 40, 45)}}
.hs-card h3{margin:0;font-family:var(--hs-serif),Georgia,serif;font-weight:400;font-size:clamp(1.7rem,2.6vw,2.1rem);line-height:1.15}
.hs-card p{margin:0;flex:1;color:var(--color-text-muted);font-size:1.05rem;text-wrap:pretty}
.hs-card .hs-btn{align-self:flex-start;margin-top:8px}

.hs-tier{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:24px 26px;border-radius:24px;background:var(--color-surface);box-shadow:${WARM(24, 54, 34, 45)};color:var(--color-text)}
.hs-tier:hover{color:var(--color-text)}
.hs-chip{padding:3px 10px;border-radius:999px;background:var(--color-primary-bg);color:var(--color-primary-strong);font-size:12px;font-weight:600}

.hs-faq{border-radius:22px;background:${a('surface', 50)};transition:background 260ms ease,box-shadow 260ms ease}
.hs-faq[open]{background:var(--color-surface);box-shadow:0 24px 50px -30px ${a('text', 40)}}
.hs-faq summary{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:22px 26px;cursor:pointer;list-style:none;font-size:1.12rem;font-weight:500}
.hs-faq summary::-webkit-details-marker{display:none}
.hs-faq summary::after{content:"+";flex:none;width:32px;height:32px;border-radius:50%;background:var(--color-primary-bg);color:var(--color-primary-strong);display:flex;align-items:center;justify-content:center;font-size:1.2rem;line-height:1}
.hs-faq[open] summary::after{content:"\\2212"}
.hs-faq-a{padding:0 72px 24px 26px;font-size:1.04rem;line-height:1.7;color:var(--color-text-muted);text-wrap:pretty}
.hs-faq-a p{margin:0 0 .75em}

.hs-band{position:relative;border-radius:clamp(24px,3vw,40px);overflow:hidden;background:var(--color-ink);color:var(--color-on-ink)}
.hs-band-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.4}
.hs-band-wash{position:absolute;inset:0;background:linear-gradient(100deg,${a('ink', 94)} 25%,${a('ink', 50)})}
.hs-band-grid{position:relative;padding:clamp(56px,8vw,120px) clamp(28px,6vw,96px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:clamp(48px,6vw,88px);align-items:center}
.hs-band h2{margin:0;font-size:clamp(2.8rem,6vw,4.8rem);line-height:1;letter-spacing:-.02em}
.hs-band-body{margin:0;max-width:30em;font-size:1.15rem;line-height:1.7;color:var(--color-on-ink-muted);text-wrap:pretty}
.hs-contact{padding:clamp(28px,3vw,40px);border-radius:28px;background:${a('on-ink', 7)};-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);display:flex;flex-direction:column;gap:4px}
.hs-contact a,.hs-contact span{font-size:1.05rem;padding:7px 0;color:var(--color-on-ink)}
.hs-contact .hs-contact-muted{color:var(--color-on-ink-muted)}
.hs-contact .hs-socials{display:flex;gap:8px;flex-wrap:wrap;padding-top:16px}
.hs-contact .hs-socials a{padding:10px 18px;border-radius:999px;background:${a('on-ink', 10)};font-weight:500;font-size:14px}

.hs-plain{max-width:1160px;margin:0 auto;padding:0 clamp(20px,4vw,48px) clamp(80px,9vw,120px)}
.hs-footer{width:100%;max-width:1240px;margin:0 auto;padding:0 clamp(20px,4vw,48px) 44px;display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;font-size:14px;color:var(--color-text-subtle)}
.hs-footer a{color:var(--color-text-muted);font-weight:500}
@media (prefers-reduced-motion:reduce){[data-house-site] *{animation:none!important}html:has([data-house-site]){scroll-behavior:auto}}
`
