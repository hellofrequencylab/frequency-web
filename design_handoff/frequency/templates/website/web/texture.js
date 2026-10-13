/* Texture layer behaviour: grain on photos, signal lines on live activity, pointer light on cards, footer roundel. */
(function(){
var rm=matchMedia('(prefers-reduced-motion:reduce)').matches,d=document;
var film=d.createElement('div');film.className='tx-film';try{var cv=d.createElement('canvas');cv.width=cv.height=180;var cx=cv.getContext('2d'),im=cx.createImageData(180,180);for(var q=0;q<im.data.length;q+=4){var v=Math.random()*255|0;im.data[q]=im.data[q+1]=im.data[q+2]=v;im.data[q+3]=255}cx.putImageData(im,0,0);film.style.backgroundImage='url('+cv.toDataURL()+')'}catch(e){}film.setAttribute('aria-hidden','true');d.body.appendChild(film);

function grain(){d.querySelectorAll('.photo,.pd,.mm-card').forEach(function(el){if(el.querySelector(':scope>.fq-grain'))return;var g=d.createElement('span');g.className='fq-grain';g.setAttribute('aria-hidden','true');el.appendChild(g)})}
var mq=0;grain();new MutationObserver(function(){if(mq)return;mq=setTimeout(function(){mq=0;grain();sigs()},400)}).observe(d.body,{childList:true,subtree:true});

var NS='http://www.w3.org/2000/svg',lines=[];
var E={still:{a:.35,s:.6,f:1.4},flow:{a:.6,s:1.2,f:2.2},charge:{a:1,s:3.2,f:3.4}};
function mk(host,where){if(!host||host.querySelector('.tx-sig'))return;var s=d.createElementNS(NS,'svg');s.setAttribute('class','tx-sig');s.setAttribute('viewBox','0 0 100 24');s.setAttribute('preserveAspectRatio','none');s.setAttribute('aria-hidden','true');
var p1=d.createElementNS(NS,'path'),p2=d.createElementNS(NS,'path');s.appendChild(p1);s.appendChild(p2);where==='before'?host.insertBefore(s,host.firstChild):host.appendChild(s);
var z=host.closest('[data-energy]'),e=E[(z&&z.dataset.energy)||'flow'];lines.push({p1:p1,p2:p2,e:e,ph:Math.random()*10,el:s})}
function sigs(){d.querySelectorAll('.lv-live,.fqm-live').forEach(function(h){mk(h)});var lp=d.querySelector('.locpill');if(lp&&!lp.querySelector('.tx-sig')){var sp=lp.querySelector('span');if(sp)mk(lp);var sg=lp.querySelector('.tx-sig');if(sg&&sp)lp.insertBefore(sg,sp.nextSibling)}}
sigs();
function wave(t,e,ph,k){var pts=[],n=40;for(var i=0;i<=n;i++){var x=i/n,env=Math.sin(Math.PI*x),y=12+env*e.a*9*(Math.sin(x*e.f*6.283+t*e.s*2+ph+k)*.65+Math.sin(x*e.f*13+t*e.s*3.1+ph*2+k)*.35);pts.push((x*100).toFixed(1)+' '+y.toFixed(2))}return 'M'+pts.join('L')}
function draw(now){var t=now/1000;lines.forEach(function(l){var r=l.el.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)return;l.p1.setAttribute('d',wave(t,l.e,l.ph,0));l.p2.setAttribute('d',wave(t*.8,l.e,l.ph,1.7))});if(!rm)requestAnimationFrame(draw)}
requestAnimationFrame(draw);

var cards='.fx,.half,.block,.door,.ledger>div,.panel,.stub,.next,.wv-cap';
d.querySelectorAll(cards).forEach(function(c){if(c.querySelector(':scope>.tx-spot'))return;c.classList.add('tx-lit');var s=d.createElement('span');s.className='tx-spot';s.setAttribute('aria-hidden','true');c.insertBefore(s,c.firstChild)});
if(!rm)d.addEventListener('pointermove',function(e){var c=e.target.closest&&e.target.closest('.tx-lit');if(!c)return;var r=c.getBoundingClientRect();c.style.setProperty('--mx',(e.clientX-r.left)+'px');c.style.setProperty('--my',(e.clientY-r.top)+'px')},{passive:true});

var em=d.querySelector('.ft2-bot em');if(em&&!d.querySelector('.ft2-roundel')){var w=d.createElement('span');w.className='ft2-sign';var r=d.createElement('span');r.className='fq-logo-icon fq-iridescent ft2-roundel fq-breathe';r.setAttribute('aria-hidden','true');em.parentNode.insertBefore(w,em);w.appendChild(r);w.appendChild(em)}
})();
