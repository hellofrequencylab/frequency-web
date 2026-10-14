/* Frequency web kit · FX layer behaviour. Load last, after megamenu.js.
   Builds page mood (palette, orbs), texture (grain, signal lines, card light, logo sheen).
   Performance: one rAF-batched scroll loop (reads, then writes), offscreen orb fields pause,
   signal lines draw at ~30fps only while visible, bitmap noise replaces SVG filters. */
(function(){
var d=document,b=d.body,root=d.documentElement,RM=matchMedia('(prefers-reduced-motion:reduce)').matches;
var page=(location.pathname.split('/').pop()||'Home.html').replace(/\.html?$/,'')||'Home';

/* ---------- shared noise tile ---------- */
try{var cv=d.createElement('canvas');cv.width=cv.height=180;var cx=cv.getContext('2d'),im=cx.createImageData(180,180);for(var q=0;q<im.data.length;q+=4){var v=Math.random()*255|0;im.data[q]=im.data[q+1]=im.data[q+2]=v;im.data[q+3]=255}cx.putImageData(im,0,0);root.style.setProperty('--fx-noise','url('+cv.toDataURL()+')');root.dataset.fx=''}catch(e){}

/* ---------- mood ---------- */
var H={v:'var(--x-violet-neon)',m:'var(--x-magenta-neon)',a:'var(--x-aqua-neon)',s:'var(--x-sun-neon)',c:'var(--uv-cyan)',l:'var(--uv-lime)',side:'var(--side)'};
var MOODS={
 Home:{e:'charge',p:['m','a','s']},
 People:{e:'flow',p:['a','v','c']},
 Spaces:{e:'flow',p:['s','m','v']},
 Features:{e:'flow',p:['v','a','s']},
 Pricing:{e:'still',p:['s','v','a'],quiet:1},
 Stories:{e:'flow',p:['m','s','v']},
 Vision:{e:'still',p:['v','c','l']},
 Join:{e:'flow',p:['side','m','v']},
 Help:{e:'still',p:['v','a','v'],quiet:2}
};
var M=MOODS[page]||MOODS.Home,P=M.p.map(function(k){return H[k]});
b.dataset.mood=page.toLowerCase();b.dataset.energyPage=M.e;
root.style.background=getComputedStyle(b).getPropertyValue('--bg-canvas').trim()||'#0A0612';
b.style.setProperty('--m1',P[0]);b.style.setProperty('--m2',P[1]);b.style.setProperty('--m3',P[2]);

var seed=7;function rnd(){seed=(seed*9301+49297)%233280;return seed/233280}
var fields=[];
function field(host){if(host.querySelector(':scope>.tx-field'))return null;var f=d.createElement('div');f.className='tx-field';f.setAttribute('aria-hidden','true');
 var w=host.querySelector(':scope>.wrap');if(w){host.insertBefore(f,w)}else{f.classList.add('under');host.classList.add('tx-host');if(getComputedStyle(host).position==='static')host.style.position='relative';host.insertBefore(f,host.firstChild)}fields.push(f);return f}
function el(f,cls,vars,inner){var e=d.createElement('span');e.className=cls;for(var k in vars)e.style.setProperty('--'+k,vars[k]);if(inner)e.innerHTML=inner;f.appendChild(e);return e}
function halo(f,c,s,x,y,o,dl){return el(f,'tx-halo',{c:c,s:s,x:x,y:y,o:o==null?'':o,dl:(dl||0)+'s'})}
function jewel(f,c,px,x,y,keep){var e=el(f,'tx-jewel'+(keep?' keep':''),{c:c,s:px+'px',x:x,y:y,dl:(-rnd()*5).toFixed(2)+'s'});e.dataset.depth=(.04+rnd()*.12).toFixed(2);return e}
function sphere(f,c1,c2,s,x,y){return el(f,'tx-sphere',{c1:c1,c2:c2,s:s,x:x,y:y},'<i></i><b></b>')}
var jn={still:2,flow:3,charge:4}[M.e];
function jewels(f,n,cols){for(var i=0;i<n;i++){var left=rnd()<.5,x=(left?2+rnd()*12:86+rnd()*12).toFixed(1)+'%',y=(8+rnd()*84).toFixed(1)+'%';jewel(f,cols[i%cols.length],Math.round(6+rnd()*14),x,y)}}

/* heroes: one signature sphere */
d.querySelectorAll('.hero,.phero,.hp-hero').forEach(function(h){var f=field(h);if(!f)return;
 var big=M.quiet===2?'clamp(160px,18vw,260px)':'clamp(100px,11vw,180px)';
 halo(f,P[1],'clamp(340px,42vw,640px)','86%','88%',.2);
 sphere(f,P[0],P[1],big,'86%','88%');
 jewel(f,P[2],14,'92%','30%',1);jewel(f,P[0],9,'74%','70%');if(M.e!=='still'){jewel(f,P[1],20,'70%','76%');jewel(f,P[2],7,'58%','58%')}});

/* Join: sphere behind the form */
var jp=d.querySelector('.jx-panel');if(jp){var jf=field(jp);if(jf){halo(jf,P[0],'640px','90%','10%',.4);halo(jf,P[1],'520px','10%','95%',.3);sphere(jf,P[0],P[1],'clamp(160px,18vw,280px)','92%','12%');jewels(jf,3,P)}}

/* Features halves keep their side colour */
d.querySelectorAll('.half').forEach(function(h,i){var f=field(h);if(!f)return;var e=h.classList.contains('half-e'),c=e?H.s:H.a,c2=e?H.m:H.v;
 halo(f,c,'clamp(420px,55vw,820px)',i%2?'12%':'88%','18%');halo(f,c2,'clamp(320px,40vw,600px)',i%2?'90%':'10%','80%',.25,-4);jewels(f,jn,[c,c2])});

/* content sections */
if(M.quiet!==2){var i=0;
 d.querySelectorAll('.chap,.sec,.lv,.closer').forEach(function(s){if(s.id==='story'||s.querySelector('.chap')||s.closest('.half'))return;var f=field(s);if(!f)return;
  var L=i%2===0,o=M.quiet?.22:null,isLv=s.classList.contains('lv'),c1=isLv?H.m:(s.classList.contains('kg')||s.classList.contains('closer'))?P[1]:P[i%3],c2=isLv?H.a:P[(i+1)%3];
  halo(f,c1,'clamp(380px,52vw,780px)',L?'88%':'12%','34%',o,-i*1.7);
  if(!M.quiet)halo(f,c2,'clamp(260px,34vw,520px)',L?'8%':'92%','86%',.22,-i*2.3);
  jewels(f,M.quiet?1:jn,isLv?[c1,c2,H.v]:[c1,c2,P[2]]);
  if(s.classList.contains('sec')&&!s.classList.contains('kg')&&getComputedStyle(s).borderTopStyle==='none'){var sm=d.createElement('span');sm.className='tx-seam';sm.setAttribute('aria-hidden','true');s.appendChild(sm)}
  i++})}

/* closer: jewels ring the manifesto */
var cl=d.querySelector('.closer .tx-field');if(cl){jewel(cl,P[0],16,'22%','30%',1);jewel(cl,P[2],10,'78%','26%',1);jewel(cl,P[1],22,'84%','70%');jewel(cl,P[0],8,'16%','74%')}

/* Home photo scroll: halos behind, orbs drifting between photos */
var fs=d.querySelector('.fold-stage'),fold=d.getElementById('fold'),fj=[];
if(fs&&fold&&!fs.querySelector('.tx-field')){var bk=d.createElement('div');bk.className='tx-field';bk.setAttribute('aria-hidden','true');fs.insertBefore(bk,fs.firstChild);fields.push(bk);
 halo(bk,P[0],'clamp(420px,60vw,900px)','20%','30%',.4);halo(bk,P[1],'clamp(380px,50vw,760px)','82%','70%',.35,-3);halo(bk,P[2],'clamp(300px,36vw,560px)','55%','12%',.22,-6);halo(bk,P[1],'clamp(400px,56vw,860px)','50%','-6%',.3,-2);
 var fr=d.createElement('div');fr.className='tx-field';fr.setAttribute('aria-hidden','true');var sh=fs.querySelector('.fl-shade');fs.insertBefore(fr,sh?sh.nextSibling:null);fields.push(fr);
 [[bk,P[1],10,'18%','14%',.5],[bk,P[2],16,'78%','18%',1.1],[bk,P[0],7,'40%','40%',.8],[bk,P[2],12,'92%','80%',1.4],[bk,P[1],20,'6%','86%',1.9],[bk,P[0],9,'58%','30%',.6],
  [fr,P[0],18,'30%','26%',1.6],[fr,P[1],11,'70%','34%',.9],[fr,P[2],24,'26%','72%',2.1],[fr,P[0],8,'62%','82%',1.2],[fr,P[1],14,'86%','52%',1.8],[fr,P[2],9,'10%','48%',.7],[fr,P[0],12,'48%','62%',2.4]]
 .forEach(function(o){var e=el(o[0],'tx-jewel keep',{c:o[1],s:o[2]+'px',x:o[3],y:o[4],dl:(-rnd()*5).toFixed(2)+'s'});e.dataset.fd=o[5];fj.push(e)})}

/* pause orb fields while offscreen */
if('IntersectionObserver' in window){var fio=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting)en.target.removeAttribute('data-off');else en.target.setAttribute('data-off','')})},{rootMargin:'100px'});fields.forEach(function(f){fio.observe(f)})}

/* ---------- one scroll loop: read everything, then write ---------- */
var hero=d.querySelector('.hero'),hs=hero&&hero.querySelector('.tx-sphere'),hh=hero&&hero.querySelector('.tx-halo');
var pj=[].slice.call(d.querySelectorAll('.tx-jewel:not([data-fd])')).map(function(j){return{el:j,p:j.parentNode,k:-j.dataset.depth}});
var ticking=false;
function frame(){ticking=false;var vh=innerHeight,y=scrollY,w=[];
 if(hs){var hH=hero.offsetHeight,hW=hero.offsetWidth,k=Math.max(0,Math.min(1,y/(hH*.75))),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2,
  ty=(38+52*e),tx=(90-5*Math.sin(k*Math.PI*2.4)+2*k),dx=((tx-86)/100*hW).toFixed(1)+'px',dy=((ty-88)/100*hH).toFixed(1)+'px';w.push(function(){[hs,hh].forEach(function(n){if(n){n.style.setProperty('--dx',dx);n.style.setProperty('--dy',dy)}})})}
 if(fj.length){var r=fold.getBoundingClientRect();if(r.bottom>0&&r.top<vh){var p=Math.max(0,Math.min(1,-r.top/(r.height-vh))),op=String(1-Math.max(0,Math.min(1,(p-.55)/.2))*.6);w.push(function(){fj.forEach(function(e){e.style.translate='0 '+((0.1-p)*e.dataset.fd*vh*.5).toFixed(1)+'px';e.style.opacity=op})})}}
 var cache=new Map();pj.forEach(function(o){var r=cache.get(o.p);if(!r){r=o.p.getBoundingClientRect();cache.set(o.p,r)}if(r.bottom<0||r.top>vh)return;var t='0 '+((r.top+r.height/2-vh/2)*o.k).toFixed(1)+'px';w.push(function(){o.el.style.translate=t})});
 w.forEach(function(f){f()})}
function onScroll(){if(!ticking){ticking=true;requestAnimationFrame(frame)}}
if(!RM){addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',onScroll,{passive:true});frame()}

/* ---------- grain ---------- */
var film=d.createElement('div');film.className='tx-film';film.setAttribute('aria-hidden','true');b.appendChild(film);
function grain(){d.querySelectorAll('.photo,.pd,.mm-card').forEach(function(n){if(n.querySelector(':scope>.fq-grain'))return;var g=d.createElement('span');g.className='fq-grain';g.setAttribute('aria-hidden','true');n.appendChild(g)})}

/* ---------- signal lines: real activity only ---------- */
var NS='http://www.w3.org/2000/svg',lines=[],E={still:{a:.35,s:.6,f:1.4},flow:{a:.6,s:1.2,f:2.2},charge:{a:1,s:3.2,f:3.4}};
var sio='IntersectionObserver' in window?new IntersectionObserver(function(es){es.forEach(function(en){en.target.__l.vis=en.isIntersecting});kick()}):null;
function mk(host,after){if(!host||host.querySelector('.tx-sig'))return;var s=d.createElementNS(NS,'svg');s.setAttribute('class','tx-sig');s.setAttribute('viewBox','0 0 100 24');s.setAttribute('preserveAspectRatio','none');s.setAttribute('aria-hidden','true');
 var p1=d.createElementNS(NS,'path'),p2=d.createElementNS(NS,'path');s.appendChild(p1);s.appendChild(p2);if(after)host.insertBefore(s,after.nextSibling);else host.appendChild(s);
 var z=host.closest('[data-energy]'),l={p1:p1,p2:p2,e:E[(z&&z.dataset.energy)||'flow'],ph:Math.random()*10,vis:!sio};s.__l=l;lines.push(l);if(sio)sio.observe(s);draw1(l,0)}
function sigs(){d.querySelectorAll('.lv-live,.fqm-live').forEach(function(h){mk(h)});var lp=d.querySelector('.locpill');if(lp)mk(lp,lp.querySelector('span'))}
function wave(t,e,ph,k){var s='M',n=32;for(var i=0;i<=n;i++){var x=i/n,y=12+Math.sin(Math.PI*x)*e.a*9*(Math.sin(x*e.f*6.283+t*e.s*2+ph+k)*.65+Math.sin(x*e.f*13+t*e.s*3.1+ph*2+k)*.35);s+=(i?'L':'')+(x*100).toFixed(1)+' '+y.toFixed(1)}return s}
function draw1(l,t){l.p1.setAttribute('d',wave(t,l.e,l.ph,0));l.p2.setAttribute('d',wave(t*.8,l.e,l.ph,1.7))}
var running=false,lastT=0;
function loop(now){var any=false;if(now-lastT>=33){lastT=now;var t=now/1000;lines.forEach(function(l){if(l.vis){any=true;draw1(l,t)}})}else any=lines.some(function(l){return l.vis});
 if(any&&!d.hidden)requestAnimationFrame(loop);else running=false}
function kick(){if(RM||running)return;running=true;requestAnimationFrame(loop)}
d.addEventListener('visibilitychange',kick);

/* ---------- card light ---------- */
d.querySelectorAll('.fx,.half,.block,.door,.ledger>div,.panel,.stub,.next,.wv-cap').forEach(function(c){if(c.querySelector(':scope>.tx-spot'))return;c.classList.add('tx-lit');var s=d.createElement('span');s.className='tx-spot';s.setAttribute('aria-hidden','true');c.insertBefore(s,c.firstChild)});
if(!RM&&matchMedia('(hover:hover)').matches){var pe=null,pq=false;d.addEventListener('pointermove',function(e){pe=e;if(pq)return;pq=true;requestAnimationFrame(function(){pq=false;var c=pe.target.closest&&pe.target.closest('.tx-lit');if(!c)return;var r=c.getBoundingClientRect();c.style.setProperty('--mx',(pe.clientX-r.left)+'px');c.style.setProperty('--my',(pe.clientY-r.top)+'px')})},{passive:true})}

/* ---------- logos ---------- */
function logos(){d.querySelectorAll('.nav img.logo,.ft2-brand img.w').forEach(function(img){if(img.closest('.lg-fx'))return;var a=img.closest('a')||img.parentNode;a.classList.add('lg-fx');var s=d.createElement('span');s.className='lg-sheen';s.setAttribute('aria-hidden','true');s.style.setProperty('--lg','url("'+img.src+'")');a.appendChild(s)})}
var em=d.querySelector('.ft2-bot em');if(em&&!d.querySelector('.ft2-roundel')){var sg=d.createElement('span');sg.className='ft2-sign';var rd=d.createElement('span');rd.className='fq-logo-icon fq-iridescent ft2-roundel';rd.setAttribute('aria-hidden','true');em.parentNode.insertBefore(sg,em);sg.appendChild(rd);sg.appendChild(em)}

/* ---------- late DOM (mega menu panels, map popups) ---------- */
function late(){grain();sigs();logos()}
late();var mq=0;new MutationObserver(function(){if(mq)return;mq=setTimeout(function(){mq=0;late()},300)}).observe(b,{childList:true,subtree:true});
})();
