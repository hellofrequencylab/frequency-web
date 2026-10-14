/* Frequency Members shell. Three columns, matching frequency-web's app shell:
   LEFT rail = the app spine (nav.js rail), with My Frequency disclosed under Feed.
   CENTER = the page's <main class="ap-main">.
   RIGHT rail = what this page is about: an "On this page" summary aggregated from the page's own
   section headings and its <aside class="side">, then the route's panels (nav.js panels), then the
   Vault dock pinned to the rail's foot (opens upward, lists adopted practices).
   Both rails default to the logo's width (--rail), fold independently, and scroll on their own. */
(function(){
var d=document,b=d.body,me=d.currentScript,N=window.FQ_NAV;
if(!N){var s=d.createElement('script');s.src=me.src.replace(/shell\.js.*$/,'nav.js');s.onload=function(){N=window.FQ_NAV;go()};d.head.appendChild(s)}else go();
function go(){
var file=decodeURIComponent((location.pathname.split('/').pop()||''));var key=N.pages[file]||b.dataset.nav||'';
var I=function(id,st){return '<svg class="fq-icon"'+(st?' style="'+st+'"':'')+' aria-hidden="true"><use href="#'+id+'"></use></svg>'};
var LS=function(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){}};
var lf=LS('fq-rail-l')==='1',rfs=LS('fq-rail-r'),rf=rfs==null?b.dataset.railR==='fold':rfs==='1';
var main=d.querySelector('.ap-main');if(!main)return;
/* ---------- header: the Feed's header, identical on every member page ---------- */
var area=b.dataset.area||'',MK=['home','community','quest','you'];
var h=d.createElement('header');h.className='ap-hdr';
h.innerHTML='<div class="ap-hdr-l"><button class="ap-ic ap-burger" aria-label="Menu">'+I('more')+'</button><a href="Members.dc.html" class="ap-logo fq-logo-flow" aria-label="Frequency home"></a><a href="Members.dc.html" class="ap-roundel" aria-label="Frequency home"></a></div>'+
'<div class="ap-hdr-c"><nav class="ap-nav" aria-label="Primary">'+MK.map(function(k){return '<button data-mega="'+k+'" class="'+(k===area?'on':'')+'" aria-expanded="false">'+I(N.megaIcons[k])+'<span>'+N.mega[k].label+'</span></button>'}).join('')+'</nav><span class="ap-sp"></span>'+
'<a href="Search.html" class="ap-search" title="Search ⌘K">'+I('search','width:17px;height:17px;color:var(--text-muted)')+'<span>Search</span><kbd>⌘K</kbd></a>'+
'<a href="Messages.html" class="ap-ic" title="Messages">'+I('message')+'<i></i></a><button class="ap-ic" data-sheet="bell" title="Notifications">'+I('nudge')+'<i></i></button><button class="btn pa ap-zap" data-sheet="zap">'+I('zap')+'Zap</button></div>'+
'<div class="ap-hdr-r"><a href="Profile.html" class="ap-me" title="Daniel Tyack"></a></div>';
var mega=d.createElement('div');mega.className='ap-mega';mega.setAttribute('aria-hidden','true');
var sheets=d.createElement('div');sheets.className='ap-sheets';
sheets.innerHTML='<div class="ap-sheet" data-s="zap"><span class="ap-sheet-t">Capture a moment.</span><div class="ap-zapg">'+[['Share','page'],['Event','event'],['Contact','contacts'],['Connect','qr']].map(function(z){return '<span><i>'+I(z[1])+'</i>'+z[0]+'</span>'}).join('')+'</div><a href="Mindless.html" class="ap-sheet-row" data-energy="still"><span class="orb fq-breathe" style="width:40px;height:40px"></span><span><b>Mindless</b><span class="t2">Tune out</span></span></a></div>'+
'<div class="ap-sheet" data-s="bell"><div class="rr-h" style="padding-bottom:6px"><span class="h3">Notifications</span><a href="Settings.html" class="t2">Manage</a></div>'+[['Jonah accepted your friend request.','12 min ago','contacts'],['Garden sit starts in 2 hours. 9 going.','1 hr ago','event'],['You earned the 7-day streak badge.','Yesterday','standing']].map(function(n){return '<div class="ap-note">'+I(n[2])+'<span><span>'+n[0]+'</span><span class="t2">'+n[1]+'</span></span></div>'}).join('')+'</div>';
var scrim=d.createElement('div');scrim.className='ap-scrim';
function megaHTML(k){var p=N.mega[k];return '<div class="ap-mega-in">'+p.cols.map(function(c){return '<div class="ap-mega-col"><span class="k">'+c.h+'</span>'+c.items.map(function(it){return '<a href="'+it.href+'">'+I(it.icon)+'<span><b>'+it.label+'</b><span>'+it.sub+'</span></span></a>'}).join('')+'</div>'}).join('')+
 '<div class="ap-mega-cards">'+p.cards.map(function(c){return '<a href="'+c.href+'"><span class="ph" style="background-image:url(\'../../assets/photos/'+c.bg+'\')"></span><span class="k">'+c.kicker+'</span><span class="h3">'+c.title+'</span></a>'}).join('')+'</div></div>'+
 '<div class="ap-mega-foot"><span>'+p.foot+'</span><a href="'+p.footHref+'" class="btn pa lg">'+p.footCta+'</a></div>'}
var openK=null;
function setOpen(k){openK=k;h.querySelectorAll('[data-mega]').forEach(function(t){var on=t.dataset.mega===k;t.setAttribute('aria-expanded',on);t.classList.toggle('on',on||(!k&&t.dataset.mega===area))});
 var isMega=k&&MK.indexOf(k)>-1;if(isMega)mega.innerHTML=megaHTML(k);mega.classList.toggle('on',!!isMega);
 sheets.querySelectorAll('.ap-sheet').forEach(function(x){x.classList.toggle('on',x.dataset.s===k)});scrim.classList.toggle('on',!!k);h.classList.toggle('open',!!k)}
h.addEventListener('click',function(e){var t=e.target.closest('[data-mega],[data-sheet]');if(!t)return;var k=t.dataset.mega||t.dataset.sheet;setOpen(openK===k?null:k)});
scrim.addEventListener('click',function(){setOpen(null)});
function hdrState(){h.classList.toggle('scrolled',scrollY>8)}addEventListener('scroll',hdrState,{passive:true});hdrState();
/* ---------- left rail ---------- */
var mf=N.myFrequency,mfN=mf.personal.concat(mf.spaces,mf.circles).reduce(function(a,x){return a+(x.n||0)},0),mfOn=key==='myfreq';
var row=function(it){var on=it.key===key;return '<a href="'+it.href+'" class="rl-row'+(on?' on':'')+'"'+(on?' aria-current="page"':'')+' title="'+it.label+'">'+I(it.icon)+'<span>'+it.label+'</span></a>'};
var sub=function(x){return '<a href="'+x.href+'" class="rl-sub">'+x.label+(x.n?'<b>'+x.n+'</b>':'')+'</a>'};
var L=d.createElement('aside');L.className='ap-rail ap-rail-l';L.setAttribute('aria-label','Main');
L.innerHTML='<nav class="rl-scroll">'+N.rail.map(function(g,gi){var html=(g.section?'<span class="rl-h">'+g.section+'</span>':'')+g.items.map(row).join('');
 if(gi===0)html+='<div class="rl-mf'+(mfOn?' open':'')+'"><button class="rl-row rl-mf-btn'+(mfOn?' on':'')+'" aria-expanded="'+mfOn+'" title="My Frequency">'+I('user')+'<span>My Frequency</span>'+(mfN?'<b class="rl-n">'+mfN+'</b>':'')+I('chevron','width:14px;height:14px;margin-left:auto')+'</button><div class="rl-mf-body"><div>'+mf.personal.map(sub).join('')+'<span class="rl-sh">'+I('space','width:13px;height:13px')+'Spaces</span>'+mf.spaces.map(sub).join('')+'<span class="rl-sh">'+I('circle','width:13px;height:13px')+'Circles</span>'+mf.circles.map(sub).join('')+'</div></div></div>';
 return '<div class="rl-g">'+html+'</div>'}).join('')+'</nav>'+
'<div class="rl-foot"><a href="Help.html" class="rl-row" title="Help">'+I('help')+'<span>Help</span></a><button class="rl-fold" title="Fold rail" aria-label="Fold left rail">'+I('chevron')+'</button></div>';
/* ---------- right rail ---------- */
var R=d.createElement('aside');R.className='ap-rail ap-rail-r';R.setAttribute('aria-label','About this page');
var parts=[];
/* 1. On this page: headings + the page's own side column */
var title=b.dataset.screenLabel||d.title.split('·')[0].trim();
var heads=[].slice.call(main.querySelectorAll('.sec-h .h2, .sec-h h2, section > .h2, .head .h1')).filter(function(x){return x.textContent.trim()});
var toc=heads.filter(function(x){return !x.classList.contains('h1')}).map(function(x,i){var host=x.closest('.sec,section,.sec-h')||x;if(!host.id)host.id='s-'+(i+1);return '<a href="#'+host.id+'">'+x.textContent.trim()+'</a>'});
var side=main.querySelector('.ap-cols:not(.l) > .side');
var sum='<section class="rr-card rr-page"><span class="k">On this page</span><span class="h3">'+title+'</span>'+(toc.length>1?'<nav class="rr-toc">'+toc.join('')+'</nav>':'')+'</section>';
parts.push(sum);
/* 2. route panels */
var P={
 standing:'<section class="rr-card"><div class="rr-h"><span class="k">Your standing</span><a href="The Vault.html" class="t2">Vault</a></div><div class="rr-stand"><span><b>12</b><i>day streak</i></span><span><b>⚡ 340</b><i>Zaps</i></span><span><b>💎 85</b><i>Gems</i></span></div><div class="meter"><i style="width:68%"></i></div><span class="t2">Initiate · 160 Zaps to Adept</span></section>',
 events:'<section class="rr-card"><div class="rr-h"><span class="k">Coming up</span><a href="Events.html" class="t2">All</a></div><div class="rr-list"><a href="Event.html"><span class="ph" style="background-image:url(\'../../assets/photos/night-string-lights-web.jpg\')"></span><span><b>Sunset sound bath</b><i>Thu 6pm · Royal Temple</i></span></a><a href="Event.html"><span class="ph" style="background-image:url(\'../../assets/photos/day-beach-hoop.jpg\')"></span><span><b>Sunrise sit</b><i>Fri 6:15am · Bird Rock</i></span></a><a href="Event.html"><span class="ph" style="background-image:url(\'../../assets/photos/gathering-03.jpg\')"></span><span><b>Beach pack-out</b><i>Sat 8am · Swami’s</i></span></a></div></section>',
 online:'<section class="rr-card"><div class="rr-h"><span class="k">Around now</span><span class="t2">14 nearby</span></div><div class="faces">'+['02','06','07','05','03','04'].map(function(n){return '<span class="av s" style="background-image:url(\'../../assets/photos/gathering-'+n+'.jpg\')"></span>'}).join('')+'</div><span class="t2">Jonah, Priya and 12 others near Bird Rock</span></section>',
 circles:'<section class="rr-card"><div class="rr-h"><span class="k">Your Circles</span><a href="Circles.html" class="t2">All</a></div><div class="rr-list"><a href="Circle.html"><span class="ph" style="background-image:url(\'../../assets/photos/day-beach-hoop.jpg\')"></span><span><b>Bird Rock Sunrise Circle</b><i>4 new posts</i></span></a><a href="Circle.html"><span class="ph" style="background-image:url(\'../../assets/photos/day-park-yoga.jpg\')"></span><span><b>Cardiff Movers</b><i>Run club Sat</i></span></a></div></section>',
 newcircles:'<section class="rr-card"><div class="rr-h"><span class="k">New near you</span></div><div class="rr-list"><a href="Circle.html"><span class="ph" style="background-image:url(\'../../assets/photos/day-meditation-circle.jpg\')"></span><span><b>Leucadia Thursday Circle</b><i>Forming · 12 people</i></span></a><a href="Circle.html"><span class="ph" style="background-image:url(\'../../assets/photos/gathering-05.jpg\')"></span><span><b>Swami’s Surf Sit</b><i>Started this week</i></span></a></div></section>',
 activenow:'<section class="rr-card"><div class="rr-h"><span class="k">Active now</span></div><div class="rr-list"><a href="Profile.html"><span class="av s" style="background-image:url(\'../../assets/photos/gathering-04.jpg\')"></span><span><b>Audrey Lin</b><i>Checked in at Royal Temple</i></span></a><a href="Profile.html"><span class="av s" style="background-image:url(\'../../assets/photos/gathering-02.jpg\')"></span><span><b>Jonah Reyes</b><i>Logged Morning sit</i></span></a></div></section>',
 leaderboard:'<section class="rr-card"><div class="rr-h"><span class="k">Bird Rock this week</span><a href="The Vault.html" class="t2">Board</a></div><div class="rr-board"><span><i>1</i>Jonah Reyes<b>420</b></span><span><i>2</i>Priya Nair<b>380</b></span><span class="me"><i>3</i>You<b>340</b></span><span><i>4</i>Marcus Lee<b>290</b></span></div></section>',
 pulse:'<section class="rr-card"><div class="rr-h"><span class="k">This week near you</span></div><div class="rr-stand"><span><b>212</b><i>check-ins</i></span><span><b>41</b><i>gatherings</i></span><span><b>9</b><i>new Circles</i></span></div></section>'
};
var isQuest=N.questKeys.indexOf(key)>-1;
var keys=(N.panels[key]||N.panels._default).slice();
/* never repeat a function the page already shows: page side columns that list events/people drop that panel */
var sideTxt=side?side.textContent.toLowerCase():'';
if(/your week|going ·/.test(sideTxt))keys=keys.filter(function(k){return k!=='events'});
keys.forEach(function(k){if(P[k])parts.push(P[k])});
R.innerHTML='<div class="rr-scroll">'+parts.join('')+'</div>'+
/* 3. Vault dock: head at rest, panel reveals upward inside the tab */
'<div class="rr-dock"><div class="rr-dock-panel" role="region" aria-label="The Vault"><div class="rr-dock-in">'+
'<div class="rr-h" style="padding-bottom:12px;border-bottom:1px solid var(--border-hair)"><span class="k">Season standing</span><span class="tag">'+I('standing','width:13px;height:13px')+'Initiate</span></div>'+
'<div class="rr-h"><span class="k">Your practices</span><span class="t2 rr-pdone"></span></div><div class="rr-prac"></div><a href="Mindless.html" class="t2" style="color:var(--text-link)">Adopt another practice</a>'+
'<div class="rr-h"><span class="k">Streak</span><span class="t2">12 days · 2 freezes</span></div><div class="rr-week">'+['M','T','W','T','F','S','S'].map(function(l,i){return '<span class="'+(i<4?'on':i===4?'today':'')+'"><i></i>'+l+'</span>'}).join('')+'</div>'+
'<div class="rr-h"><span class="k">Rank</span><span class="t2">160 Zaps to Adept</span></div><div class="meter"><i style="width:68%"></i></div>'+
'<a href="The Vault.html" class="btn pa sm" style="margin-top:4px">Open the Vault</a></div></div>'+
'<button class="rr-dock-head" aria-expanded="false" aria-label="The Vault. Your Zaps, Gems and streak"><span class="orb" style="width:22px;height:22px"></span><b>⚡ 340</b><s></s><b>💎 85</b><s></s><b>12 days</b>'+I('chevron','width:14px;height:14px;margin-left:auto')+'</button></div>'+
'<button class="rl-fold rr-fold" title="Fold rail" aria-label="Fold right rail">'+I('chevron')+'</button>';
if(isQuest)R.querySelector('.rr-dock').remove();
/* page side column moves under "On this page" */
if(side){var pg=R.querySelector('.rr-page');var wrap=d.createElement('div');wrap.className='rr-side';while(side.firstChild)wrap.appendChild(side.firstChild);pg.after(wrap);side.remove();var cols=main.querySelector('.ap-cols:not(.l)');if(cols)cols.classList.add('solo')}
/* practices in the dock */
var PR=[['sit','Morning sit','10 min · daily','breath',1],['walk','Evening walk','20 min · daily','practice',0],['grat','Three good things','2 min · before bed','edit',0],['lesson','The open question','Mind Journey · lesson 6','lesson',0]];
try{var saved=JSON.parse(LS('fq-practice-log')||'null');if(saved)PR.forEach(function(p){if(saved[p[0]])p[4]=1})}catch(e){}
function drawPrac(){var box=R.querySelector('.rr-prac');if(!box)return;box.innerHTML=PR.map(function(p){return '<div class="rr-p">'+'<span class="ic">'+I(p[3],'width:16px;height:16px')+'</span><span class="grow"><b>'+p[1]+'</b><i>'+p[2]+'</i></span>'+(p[4]?'<span class="st-done">'+I('check','width:13px;height:13px')+'Done</span>':'<button class="btn ink sm" data-log="'+p[0]+'">Log</button>')+'</div>'}).join('');R.querySelector('.rr-pdone').textContent=PR.filter(function(p){return p[4]}).length+' of '+PR.length+' today'}
drawPrac();
R.addEventListener('click',function(e){var lb=e.target.closest('[data-log]');if(!lb)return;var p=PR.filter(function(x){return x[0]===lb.dataset.log})[0];p[4]=1;var o={};PR.forEach(function(x){o[x[0]]=x[4]});LS('fq-practice-log',JSON.stringify(o));drawPrac();window.fqToast&&fqToast('Logged '+p[1]+'. ⚡ 10 added.')});
/* ---------- mount ---------- */
var shell=d.createElement('div');shell.className='ap-shell';if(lf)shell.classList.add('lf');if(rf)shell.classList.add('rf');
main.parentNode.insertBefore(shell,main);shell.appendChild(L);shell.appendChild(main);shell.appendChild(R);
b.insertBefore(h,b.firstChild);h.after(mega);mega.after(sheets);sheets.after(scrim);
var w=d.createElement('div');w.className='fq-wash';w.setAttribute('aria-hidden','true');b.insertBefore(w,b.firstChild);
var f=d.createElement('footer');f.className='ap-foot';f.innerHTML='<span>Frequency · Community Collective</span><span class="ap-sp"></span><a href="Help.html">Help</a><a href="Site Map.html">Site map</a><a href="Settings.html">Settings</a>';main.appendChild(f);
var t=d.createElement('div');t.className='ap-toast';t.setAttribute('role','status');b.appendChild(t);var tt;
window.fqToast=function(m){t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(function(){t.classList.remove('on')},2800)};
var am=d.createElement('script');am.src=me.src.replace(/shell\.js.*$/,'ambient.js');b.appendChild(am);
/* ---------- behaviour ---------- */
var mfBox=L.querySelector('.rl-mf');L.querySelector('.rl-mf-btn').addEventListener('click',function(){if(shell.classList.contains('lf')){location.href='Profile.html';return}var o=mfBox.classList.toggle('open');this.setAttribute('aria-expanded',o)});
L.querySelector('.rl-fold').addEventListener('click',function(){var o=shell.classList.toggle('lf');LS('fq-rail-l',o?'1':'0')});
R.querySelector('.rr-fold').addEventListener('click',function(){var o=shell.classList.toggle('rf');LS('fq-rail-r',o?'1':'0');setDock(false)});
h.querySelector('.ap-burger').addEventListener('click',function(){b.classList.toggle('rl-drawer')});
L.addEventListener('click',function(e){if(e.target.closest('a'))b.classList.remove('rl-drawer')});
/* Vault dock: the live site's close rules: Esc, outside click, scroll past a deadband, folding the rail. Reaching the rail's end opens it. */
var dock=R.querySelector('.rr-dock')||d.createElement('div'),head=R.querySelector('.rr-dock-head')||d.createElement('button'),dockY=0;
function setDock(o){dock.classList.toggle('open',o);head.setAttribute('aria-expanded',o);if(o)dockY=scrollY}
head.addEventListener('click',function(){if(shell.classList.contains('rf')){shell.classList.remove('rf');LS('fq-rail-r','0')}setDock(!dock.classList.contains('open'))});
d.addEventListener('mousedown',function(e){if(!dock.contains(e.target))setDock(false)});
d.addEventListener('keydown',function(e){if(e.key==='Escape'){setDock(false);setOpen(null);b.classList.remove('rl-drawer')}});
addEventListener('scroll',function(){if(dock.classList.contains('open')&&Math.abs(scrollY-dockY)>120)setDock(false)},{passive:true});
var rs=R.querySelector('.rr-scroll'),wasEnd=false;rs.addEventListener('scroll',function(){var end=rs.scrollTop+rs.clientHeight>=rs.scrollHeight-4;if(end&&!wasEnd&&rs.scrollHeight>rs.clientHeight+8)setDock(true);wasEnd=end},{passive:true});
/* toc highlight */
var tl=[].slice.call(R.querySelectorAll('.rr-toc a'));if(tl.length&&'IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting)tl.forEach(function(a){a.classList.toggle('on',a.getAttribute('href')==='#'+en.target.id)})})},{rootMargin:'-30% 0px -60% 0px'});tl.forEach(function(a){var el=d.getElementById(a.getAttribute('href').slice(1));if(el)io.observe(el)})}
/* page behaviours */
d.addEventListener('click',function(e){
 var el=e.target.closest('[data-toast]');if(el)fqToast(el.dataset.toast);
 var g=e.target.closest('[data-group] > *');if(g&&!g.hasAttribute('data-noselect')){[].forEach.call(g.parentNode.children,function(c){c.classList.toggle('on',c===g)});var p=g.parentNode.dataset.group;if(p){d.querySelectorAll('[data-pane="'+p+'"]').forEach(function(x){x.classList.toggle('hide',x.dataset.key!==g.dataset.key)})}}
 var s=e.target.closest('.sw');if(s){s.classList.toggle('on');s.setAttribute('aria-checked',s.classList.contains('on'))}
 var sw=e.target.closest('[data-swap]');if(sw){e.preventDefault();var a=sw.dataset.swap.split('|');var on=sw.classList.toggle('on');var ic=sw.querySelector('svg');sw.textContent=on?a[1]:a[0];if(ic)sw.insertBefore(ic,sw.firstChild);if(sw.dataset.cls)sw.classList.toggle(sw.dataset.cls,on)}
 var rm=e.target.closest('[data-remove]');if(rm){var r=rm.closest(rm.dataset.remove);if(r){r.style.transition='opacity .26s';r.style.opacity=0;setTimeout(function(){r.remove()},260)}}
});
}
})();
