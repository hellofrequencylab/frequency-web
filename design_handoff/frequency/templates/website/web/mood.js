/* Mood layer: page energy + palette, spheres in heroes, halos/jewels per section, seams. */
(function(){
var d=document,b=d.body,page=(location.pathname.split('/').pop()||'Home.html').replace('.html','');
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
b.dataset.mood=page.toLowerCase();b.dataset.energyPage=M.e;d.documentElement.style.background=getComputedStyle(b).getPropertyValue('--bg-canvas').trim()||'#0A0612';
b.style.setProperty('--m1',P[0]);b.style.setProperty('--m2',P[1]);b.style.setProperty('--m3',P[2]);
var seed=7;function rnd(){seed=(seed*9301+49297)%233280;return seed/233280}
function field(host){if(host.querySelector(':scope>.tx-field'))return null;var f=d.createElement('div');f.className='tx-field';f.setAttribute('aria-hidden','true');
 var w=host.querySelector(':scope>.wrap');if(w){host.insertBefore(f,w)}else{f.classList.add('under');host.classList.add('tx-host');if(getComputedStyle(host).position==='static')host.style.position='relative';host.insertBefore(f,host.firstChild)}return f}
function el(f,cls,vars,inner){var e=d.createElement('span');e.className=cls;for(var k in vars)e.style.setProperty('--'+k,vars[k]);if(inner)e.innerHTML=inner;f.appendChild(e);return e}
function halo(f,c,s,x,y,o,dl){el(f,'tx-halo',{c:c,s:s,x:x,y:y,o:o==null?'':o,dl:(dl||0)+'s'})}
function jewel(f,c,px,x,y,keep){var e=el(f,'tx-jewel'+(keep?' keep':''),{c:c,s:px+'px',x:x,y:y,dl:(-rnd()*5).toFixed(2)+'s'});e.dataset.depth=(.04+rnd()*.12).toFixed(2)}
function sphere(f,c1,c2,s,x,y){el(f,'tx-sphere',{c1:c1,c2:c2,s:s,x:x,y:y},'<i></i><b></b>')}
var jn={still:2,flow:3,charge:4}[M.e];
function jewels(f,n,cols){for(var i=0;i<n;i++){var left=rnd()<.5,x=(left?2+rnd()*12:86+rnd()*12).toFixed(1)+'%',y=(8+rnd()*84).toFixed(1)+'%';jewel(f,cols[i%cols.length],Math.round(6+rnd()*14),x,y)}}

/* heroes: the signature sphere */
d.querySelectorAll('.hero,.phero,.hp-hero').forEach(function(h){var f=field(h);if(!f)return;
 var big=M.quiet===2?'clamp(160px,18vw,260px)':'clamp(100px,11vw,180px)';
 halo(f,P[1],'clamp(340px,42vw,640px)','86%','88%',.2);
 sphere(f,P[0],P[1],big,'86%','88%');
 jewel(f,P[2],14,'92%','30%',1);jewel(f,P[0],9,'74%','70%');if(M.e!=='still'){jewel(f,P[1],20,'70%','76%');jewel(f,P[2],7,'58%','58%')}});

/* Join: sphere behind the form */
var jp=d.querySelector('.jx-panel');if(jp){var f=field(jp);if(f){halo(f,P[0],'640px','90%','10%',.4);halo(f,P[1],'520px','10%','95%',.3);sphere(f,P[0],P[1],'clamp(160px,18vw,280px)','92%','12%');jewels(f,3,P)}}

/* Features halves keep their own side colour */
d.querySelectorAll('.half').forEach(function(h,i){var f=field(h);if(!f)return;var c=h.classList.contains('half-e')?H.s:H.a,c2=h.classList.contains('half-e')?H.m:H.v;
 halo(f,c,'clamp(420px,55vw,820px)',i%2?'12%':'88%','18%');halo(f,c2,'clamp(320px,40vw,600px)',i%2?'90%':'10%','80%',.25,-4);jewels(f,jn,[c,c2])});

/* content sections: alternating halos, jewels at the edges, gradient seam */
if(M.quiet!==2){var secs=d.querySelectorAll('.chap,.sec,.lv,.closer');var i=0;
 secs.forEach(function(s){if(s.id==='story'||s.querySelector('.chap'))return;if(s.closest('.half'))return;var f=field(s);if(!f)return;
  var L=i%2===0,o=M.quiet?.22:null,isLv=s.classList.contains('lv'),c1=isLv?H.m:s.classList.contains('kg')||s.classList.contains('closer')?P[1]:P[i%3],c2=isLv?H.a:P[(i+1)%3];
  halo(f,c1,'clamp(380px,52vw,780px)',L?'88%':'12%','34%',o,-i*1.7);
  if(!M.quiet)halo(f,c2,'clamp(260px,34vw,520px)',L?'8%':'92%','86%',.22,-i*2.3);
  jewels(f,M.quiet?1:jn,isLv?[c1,c2,H.v]:[c1,c2,P[2]]);
  if(s.classList.contains('sec')&&!s.classList.contains('kg')&&getComputedStyle(s).borderTopStyle==='none'){var sm=d.createElement('span');sm.className='tx-seam';sm.setAttribute('aria-hidden','true');s.appendChild(sm)}
  i++})}

/* photo scroll (Home fold): halos behind the photos, orbs drifting between them */
var fs=d.querySelector('.fold-stage');if(fs&&!fs.querySelector('.tx-field')){var bk=d.createElement('div');bk.className='tx-field';bk.setAttribute('aria-hidden','true');fs.insertBefore(bk,fs.firstChild);
 halo(bk,P[0],'clamp(420px,60vw,900px)','20%','30%',.4);halo(bk,P[1],'clamp(380px,50vw,760px)','82%','70%',.35,-3);halo(bk,P[2],'clamp(300px,36vw,560px)','55%','12%',.22,-6);halo(bk,P[1],'clamp(400px,56vw,860px)','50%','-6%',.3,-2);
 [[P[1],10,'18%','14%',.5],[P[2],16,'78%','18%',1.1],[P[0],7,'40%','40%',.8],[P[2],12,'92%','80%',1.4],[P[1],20,'6%','86%',1.9],[P[0],9,'58%','30%',.6]].forEach(function(o){var e=el(bk,'tx-jewel keep',{c:o[0],s:o[1]+'px',x:o[2],y:o[3],dl:(-rnd()*5).toFixed(2)+'s'});e.dataset.fd=o[4]});
 var fr=d.createElement('div');fr.className='tx-field';fr.setAttribute('aria-hidden','true');var sh=fs.querySelector('.fl-shade');fs.insertBefore(fr,sh?sh.nextSibling:null);
 [[P[0],18,'30%','26%',1.6],[P[1],11,'70%','34%',.9],[P[2],24,'26%','72%',2.1],[P[0],8,'62%','82%',1.2],[P[1],14,'86%','52%',1.8],[P[2],9,'10%','48%',.7],[P[0],12,'48%','62%',2.4]].forEach(function(o){var e=el(fr,'tx-jewel keep',{c:o[0],s:o[1]+'px',x:o[2],y:o[3],dl:(-rnd()*5).toFixed(2)+'s'});e.dataset.fd=o[4]});
 var fold=d.getElementById('fold'),fj=[].slice.call(fs.querySelectorAll('.tx-jewel[data-fd]'));
 function ft(){var r=fold.getBoundingClientRect(),p=Math.max(0,Math.min(1,-r.top/(r.height-innerHeight)));fj.forEach(function(e){e.style.translate='0 '+((0.1-p)*e.dataset.fd*innerHeight*.5).toFixed(1)+'px';e.style.opacity=String(1-Math.max(0,Math.min(1,(p-.55)/.2))*.6)})}
 if(!matchMedia('(prefers-reduced-motion:reduce)').matches){addEventListener('scroll',ft,{passive:true});ft()}}

/* Home: the hero sphere meanders down to the bottom of the hero as you scroll */
var hs=d.querySelector('.hero .tx-sphere'),hh=d.querySelector('.hero');
if(hs&&hh&&!matchMedia('(prefers-reduced-motion:reduce)').matches){var hhalo=hh.querySelector('.tx-halo');
 function mt(){var k=Math.max(0,Math.min(1,scrollY/(hh.offsetHeight*.75))),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2,y=(38+52*e).toFixed(2)+'%',x=(90-5*Math.sin(k*Math.PI*2.4)+2*k).toFixed(2)+'%';
  hs.style.setProperty('--y',y);hs.style.setProperty('--x',x);if(hhalo){hhalo.style.setProperty('--y',y);hhalo.style.setProperty('--x',x)}}
 addEventListener('scroll',mt,{passive:true});mt()}

/* closer: extra jewels ring the manifesto */
var cl=d.querySelector('.closer .tx-field');if(cl){jewel(cl,P[0],16,'22%','30%',1);jewel(cl,P[2],10,'78%','26%',1);jewel(cl,P[1],22,'84%','70%');jewel(cl,P[0],8,'16%','74%')}

/* depth parallax on jewels */
if(!matchMedia('(prefers-reduced-motion:reduce)').matches){var js=[].slice.call(d.querySelectorAll('.tx-jewel:not([data-fd])'));
 function t(){var vh=innerHeight;js.forEach(function(j){var r=j.parentNode.getBoundingClientRect();if(r.bottom<0||r.top>vh)return;j.style.translate='0 '+((r.top+r.height/2-vh/2)*-j.dataset.depth).toFixed(1)+'px'})}
 addEventListener('scroll',t,{passive:true});t()}
})();
