// Shared renderer for the Frequency teaser infographics (flows 2–6).
// Each flow HTML defines window.DATA, then loads this. Renders #feed + #story.
const GLYPHS = {
  lotus:`<svg viewBox="0 0 48 48"><path d="M24 41 C15 32 15 20 24 11 C33 20 33 32 24 41Z"/><path d="M24 41 C33 36 41 31 43 21 C33 21 27 29 24 41Z"/><path d="M24 41 C15 36 7 31 5 21 C15 21 21 29 24 41Z"/></svg>`,
  ring:`<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="15"/><circle cx="24" cy="24" r="8"/></svg>`,
  tick:`<svg viewBox="0 0 48 48"><path d="M10 38h28"/><path d="M15 38V28M24 38V20M33 38V12"/><path d="M33 12l-4 4M33 12l4 4" fill="currentColor" stroke="none"/></svg>`,
  note:`<svg viewBox="0 0 48 48"><rect x="8" y="13" width="32" height="22" rx="3"/><path d="M9 16l15 11 15-11"/></svg>`,
  flame:`<svg viewBox="0 0 48 48"><path d="M24 41 C15 37 13 28 19 22 C20 26 22 26 23 24 C24 17 21 14 27 8 C26 16 33 18 32 28 C35 26 35 22 34 20 C38 27 36 37 24 41Z"/></svg>`,
  chat:`<svg viewBox="0 0 48 48"><path d="M10 12h28a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H23l-8 7v-7h-5a3 3 0 0 1-3-3V15a3 3 0 0 1 3-3Z"/></svg>`,
  snow:`<svg viewBox="0 0 48 48"><path d="M24 5v38M8 15l32 18M40 15L8 33"/><path d="M24 5l-4 5M24 5l4 5M24 43l-4-5M24 43l4-5M8 15l1 6M8 15l6-1M40 33l-1-6M40 33l-6 1M40 15l-6-1M40 15l-1 6M8 33l6 1M8 33l1-6"/></svg>`,
  qr:`<svg viewBox="0 0 48 48"><rect x="8" y="8" width="13" height="13"/><rect x="27" y="8" width="13" height="13"/><rect x="8" y="27" width="13" height="13"/><path d="M27 27h5v5M40 27v5M27 40h5M40 36v4"/></svg>`,
  phonecheck:`<svg viewBox="0 0 48 48"><rect x="15" y="6" width="18" height="36" rx="3"/><path d="M19 22l3 3 6-7"/></svg>`,
  checklist:`<svg viewBox="0 0 48 48"><path d="M17 14h20M17 24h20M17 34h20"/><path d="M8 12l2 3 4-5M8 22l2 3 4-5M8 32l2 3 4-5"/></svg>`,
  rows:`<svg viewBox="0 0 48 48"><circle cx="13" cy="14" r="4"/><path d="M22 14h18"/><circle cx="13" cy="24" r="4"/><path d="M22 24h18"/><circle cx="13" cy="34" r="4"/><path d="M22 34h18"/></svg>`,
  tag:`<svg viewBox="0 0 48 48"><path d="M9 9h16l15 15-16 16L9 25V9Z"/><circle cx="17" cy="17" r="3"/></svg>`,
  plane:`<svg viewBox="0 0 48 48"><path d="M43 7L6 21l13 5 4 14 6-11"/><path d="M43 7L23 29"/></svg>`,
  ping:`<svg viewBox="0 0 48 48"><path d="M8 13h24a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H20l-7 6v-6H8a3 3 0 0 1-3-3V16a3 3 0 0 1 3-3Z"/><path d="M40 9l3-3M43 15h4M40 21l3 3" stroke-width="2"/></svg>`,
  bubbles:`<svg viewBox="0 0 48 48"><path d="M6 11h22a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H16l-6 5v-5H6a3 3 0 0 1-3-3V14a3 3 0 0 1 3-3Z"/><path d="M23 28h16a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-2v4l-5-4h-9a3 3 0 0 1-3-3" /></svg>`,
  doorcheck:`<svg viewBox="0 0 48 48"><path d="M14 8h20v34H14z"/><path d="M18 24l3 3 6-7"/><circle cx="30" cy="26" r="1.3" fill="currentColor" stroke="none"/></svg>`,
  house:`<svg viewBox="0 0 48 48"><path d="M8 24L24 10l16 14M12 22v18h24V22"/><path d="M20 40V30h8v10"/></svg>`,
  table:`<svg viewBox="0 0 48 48"><circle cx="15" cy="20" r="5"/><circle cx="33" cy="20" r="5"/><path d="M8 36h32M15 25v6M33 25v6"/></svg>`,
  calendar:`<svg viewBox="0 0 48 48"><rect x="9" y="12" width="30" height="28" rx="3"/><path d="M9 20h30M17 8v6M31 8v6"/><circle cx="24" cy="30" r="5"/></svg>`,
  returnloop:`<svg viewBox="0 0 48 48"><path d="M40 20a16 16 0 1 0-3 18"/><path d="M40 10v10h-10"/></svg>`,
};
const ARROW = `<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;

function stepHTML(s){
  const cls = s.dim ? 'dim' : (s.lit ? 'lit' : s.n);
  return `<div class="step ${s.dim?'dim':''}">
    <div class="glyph ${cls}">${GLYPHS[s.g]}</div>
    <div class="txt">
      ${s.day?`<span class="daytag">${s.day}</span><br>`:''}
      <p class="lbl">${s.lbl}</p>
      <p class="sub">${s.sub}</p>
      <p class="desc">${s.desc}</p>
    </div>
  </div>`;
}
function build(el, D){
  el.style.setProperty('--accent', D.accent);
  el.style.setProperty('--n1', D.ramp[0]); el.style.setProperty('--n2', D.ramp[1]); el.style.setProperty('--n3', D.ramp[2]);
  el.innerHTML = `
    <div class="glowtop"></div><div class="slat"></div>
    <div class="hd">
      <span class="wordmark">Frequency</span>
      <p class="eyb">${D.eyebrow}</p>
      <h1 class="hl">${D.headline}</h1>
      <p class="intro">${D.intro}</p>
    </div>
    <div class="flow">
      <div class="spine"></div>
      ${D.steps.map(stepHTML).join('')}
      ${D.loop?`<div class="loopnote"><span class="licon">${GLYPHS.returnloop}</span><p>${D.loopText}</p></div>`:''}
    </div>
    <div class="foot">
      <div class="divider"></div>
      <p class="stat">${D.stat}</p>
      <span class="cta">${D.cta} ${ARROW}</span>
    </div>`;
}
build(document.getElementById('feed'), window.DATA);
build(document.getElementById('story'), window.DATA);
