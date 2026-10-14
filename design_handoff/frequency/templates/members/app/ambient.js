/* Frequency ambient layer for Commons pages (members + admin). Soft depth orbs, grain, photo parallax, reveal on scroll.
   One rAF scroll loop. Respects prefers-reduced-motion. Loaded by app/shell.js and admin/shell.js. */
(function(){
var d=document,b=d.body,RM=matchMedia('(prefers-reduced-motion:reduce)').matches;
if(b.querySelector('.fq-amb')||b.querySelector('.pe'))return;
var amb=d.createElement('div');amb.className='fq-amb';amb.setAttribute('aria-hidden','true');
var O=[['var(--amb-1)','46vw','-8%','-6%',.10],['var(--amb-2)','38vw','78%','10%',.22],['var(--amb-3)','42vw','58%','62%',.16],['var(--amb-4)','30vw','4%','70%',.30]];
var orbs=O.map(function(o){var e=d.createElement('i');e.style.cssText='--c:'+o[0]+';--s:'+o[1]+';left:'+o[2]+';top:'+o[3];e.dataset.k=o[4];amb.appendChild(e);return e});
var g=d.createElement('span');g.className='fq-grain';amb.appendChild(g);
b.insertBefore(amb,b.firstChild);
/* photo parallax: card photos drift inside their frame, standalone photos shift focus */
var ph=[].slice.call(d.querySelectorAll('.ph')).filter(function(p){return p.offsetHeight>=120&&!p.closest('.ap-hdr,.ad-side')}).map(function(p){return{el:p}});
/* reveal */
var rv=[].slice.call(d.querySelectorAll('.ap-main .sec,.ap-main .panel,.ap-main .card,.ap-main .soft,.ad-main .sec,.ad-main .panel,.ad-main .soft')).filter(function(e){return !e.parentNode.closest('.panel,.card,.soft')});
if(!RM&&'IntersectionObserver' in window){var vh0=innerHeight;rv.forEach(function(e){if(e.getBoundingClientRect().top>vh0*.92)e.classList.add('rv')});
 var io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){en.target.classList.add('rv-on');io.unobserve(en.target)}})},{rootMargin:'0px 0px -8% 0px'});rv.forEach(function(e){if(e.classList.contains('rv'))io.observe(e)})}
if(RM)return;
var tick=false;
function frame(){tick=false;var y=scrollY,vh=innerHeight,w=[];
 d.querySelectorAll('.rv:not(.rv-on)').forEach(function(e){if(e.getBoundingClientRect().top<vh)e.classList.add('rv-on')});
 orbs.forEach(function(o){var t='0 '+(-y*o.dataset.k).toFixed(1)+'px';w.push(function(){o.style.translate=t})});
 ph.forEach(function(p){var r=p.el.getBoundingClientRect();if(r.bottom<0||r.top>vh)return;var k=((r.top+r.height/2)-vh/2)/vh;
  var bp='center '+Math.max(0,Math.min(100,50+k*-24)).toFixed(1)+'%';w.push(function(){p.el.style.backgroundPosition=bp})});
 w.forEach(function(f){f()})}
function on(){if(!tick){tick=true;requestAnimationFrame(frame)}}
addEventListener('scroll',on,{passive:true});addEventListener('resize',on,{passive:true});frame();
})();
