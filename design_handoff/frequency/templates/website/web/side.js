/* Side state (People ⇄ Spaces), pop-in reveals, parallax, dock. body[data-lock="p|e"] pins a wing page to one side. */
(function(){
var b=document.body,lock=b.dataset.lock,h=location.hash,s=lock||(h==='#people'?'p':(h==='#spaces'||h==='#experiences')?'e':null);
if(!s){try{s=localStorage.getItem('fq-home-side')}catch(e){}}s=s||'p';
function set(v){if(lock)v=lock;b.dataset.side=v;document.querySelectorAll('[data-set]').forEach(function(x){x.setAttribute('aria-pressed',String(x.dataset.set===v))});if(!lock){try{localStorage.setItem('fq-home-side',v)}catch(e){}}}
document.addEventListener('click',function(e){var x=e.target.closest('[data-set]');if(x)set(x.dataset.set)});
set(s);
var rm=matchMedia('(prefers-reduced-motion:reduce)').matches,last=0;
var io=new IntersectionObserver(function(es){es.forEach(function(en){if(!en.isIntersecting)return;var el=en.target,now=performance.now(),d=Math.max(0,last+170-now);last=now+d;setTimeout(function(){el.classList.add('in')},d);io.unobserve(el)})},{threshold:.2,rootMargin:'0px 0px -6% 0px'});
document.querySelectorAll('.pop').forEach(function(el){rm?el.classList.add('in'):io.observe(el)});
var px=[].slice.call(document.querySelectorAll('[data-px]')),hero=document.querySelector('.phero'),hb=hero&&hero.querySelector('.bg'),hw=hero&&hero.querySelector('.wrap'),dock=document.querySelector('.dock'),foot=document.querySelector('footer');
function tick(){var vh=innerHeight;
if(!rm){px.forEach(function(el){var r=el.getBoundingClientRect(),c=(r.top+r.height/2-vh/2)/vh;el.style.translate='0 '+(c*-(+el.dataset.px)*100).toFixed(1)+'px'});
if(hero){var y=Math.max(0,-hero.getBoundingClientRect().top),k=Math.min(1,y/(hero.offsetHeight*.7));if(hb)hb.style.transform='scale('+(1+k*.12)+')';if(hw){hw.style.opacity=String(1-k*.9);hw.style.transform='translate3d(0,'+(-y*.25)+'px,0)'}}}
if(dock&&hero){dock.classList.toggle('on',hero.getBoundingClientRect().bottom<80&&(!foot||foot.getBoundingClientRect().top>vh*.9))}}
addEventListener('scroll',tick,{passive:true});addEventListener('resize',tick);tick();
})();
