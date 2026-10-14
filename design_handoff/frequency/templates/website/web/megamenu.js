/* Frequency header v4. Logo left, need-based nav (For people · For spaces · Features · Pricing · Stories), search, account on the right.
   Include on any page with <header class="nav">. Builds menus, inlines the icon sprite. data-open="people|spaces|packages(features)" opens a panel (cards). */
(function(){
var me=document.currentScript,RS=window.__resources||{},base=/^(https?|file):/.test(me.src)?me.src.replace(/web\/megamenu\.js.*$/,''):'',A=me.dataset.assets?new URL(me.dataset.assets,location.href).href:base+'../../assets/';
var RM_={'photos/day-meditation-circle.jpg':'mm-dmc','photos/night-string-lights-web.jpg':'mm-nsl','photos/gathering-04.jpg':'mm-g04','photos/day-park-yoga.jpg':'mm-dpy','icons/frequency-icons.svg':'icons'};var AS=function(p){return RS[RM_[p]]||A+p};
var U=function(h){return base+encodeURI(h).replace(/%23/g,'#')};
var I=function(id){return '<svg class="fq-icon" aria-hidden="true"><use href="#'+id+'"/></svg>'};
var L=function(x){return '<a class="mm-link" href="'+U(x[0])+'"><i class="mm-ic">'+I(x[3])+'</i><span><b>'+x[1]+'</b><small>'+x[2]+'</small></span></a>'};
var C=function(x){return '<a class="mm-card" href="'+U(x[0])+'"><span class="mm-img" style="background-image:url(\''+AS(x[1])+'\')"></span><span class="mm-shade"></span><span class="mm-ct"><span class="mm-k">'+x[2]+'</span><b>'+x[3]+'</b></span></a>'};
var COL=function(h,items){return '<div class="mm-col"><span class="mm-h">'+h+'</span>'+items.map(L).join('')+'</div>'};
var M={
people:{label:'For people',wing:'community',cols:[['Start',[['People.html','Find your people','How Frequency works for you','circle'],['People.html#first-night','Your first night','What to expect, start to finish','checkin'],['People.html#near','What’s happening near you','This week in your town','pin']]],['Play + lead',[['Features.html#f-zaps','The game','Only showing up earns Zaps','zap'],['Spaces.html','Host an experience','Your living room, garden or park counts','host'],['Stories.html','Host stories','Regulars who became Hosts','message']]]],
 cards:[['People.html','photos/day-meditation-circle.jpg','For people','Find the people you’ll see every week'],['People.html#near','photos/night-string-lights-web.jpg','This week','Gatherings near you']],foot:['A hundred contacts. No one to call on a Tuesday.','People.html','Find your Circle']},
spaces:{label:'For spaces',wing:'spaces',cols:[['Start',[['Spaces.html','Grow your community','What the network does for you','space'],['Spaces.html#types','For your type','Studios, coaches, hosts, venues, non-profits','contacts'],['Features.html#f-doorqr','Remember who came','Door QR and contacts','qr']]],['Trust',[['Features.html#f-standing','Standing','Earned by gathering, never sold','standing'],['Pricing.html#spaces','Pricing','Free, Business, Non-profit','tip'],['Stories.html','Space stories','In their own words','message']]]],
 cards:[['Features.html#f-doorqr','photos/gathering-04.jpg','Door QR','Remember everyone who walked in'],['Features.html#f-standing','photos/day-park-yoga.jpg','Standing','Nobody can buy their way up']],foot:['Host free. We only earn when we help your community grow.','Spaces.html','Open your Space']},
packages:{label:'Features',pk:true}};
var FJ=[['p','For people',[['Find',[['calendar','Your town’s calendar'],['circles','Circles'],['events','Events'],['programs','Programs']]],['Show up',[['checkin','Check-in'],['reminders','Reminders']]],['Come back',[['zaps','Zaps'],['seasons','Seasons'],['meter','Circle meter'],['membership-p','Memberships']]],['Pass it on',[['invites','Invites'],['host','Host an experience']]]]],['e','For spaces',[['Be found',[['page','Your page'],['standing','Standing'],['circles-s','Circles'],['events-s','Events']]],['Open the door',[['doorqr','Door QR'],['contacts','Contacts'],['firsttimers','First-timer nudges']]],['Bring them back',[['programs-s','Programs'],['email','Email + win-back'],['handoff','Hosts']]],['Get paid',[['tickets','Tickets + refunds'],['memberships','Memberships'],['tips','Tips']]]]]];
var DIRECT=[['Pricing.html','Pricing'],['Stories.html','Stories']];
var R={
member:{t:'Member',g:[['Today','Your next gathering','event'],['My Circles','Your regulars','circle'],['Messages','Friends and groups','message'],['Zaps + Vault','What you’ve earned','zap']]},
host:{t:'Host',g:[['Circle console','Members, roles, schedule','circle'],['Check-in','Door QR and attendance','checkin'],['Dispatches','Broadcast to your Circle','nudge'],['Invite links','Bring people in','host']]},
owner:{t:'Space owner',g:[['Page editor','Change it yourself','page'],['Contacts','Who came, who’s new','contacts'],['Memberships + tickets','Into their Circle','membership'],['Standing','How you’re ranking','standing']]},
admin:{t:'Admin',g:[['Members + roles','Role matrix','contacts'],['Moderation','Reports, trust','checkin'],['Economy','Zaps, Gems, Vault','zap'],['Commerce','Orders, refunds','ticket']]}};
var IDX=[['Join.html','Get started','Join as a person or open a Space','host'],['Help.html','Help','Questions, policies, contact','search'],['Home.html','Home','Gather like it matters','circle'],['People.html','For people','Find your people','circle'],['Spaces.html','For spaces','Open your Space','space'],['Pricing.html','Pricing','Free, Business, Non-profit','tip'],['Stories.html','Stories','Hosts and Spaces','message'],['Vision.html','Vision','Third spaces, 2027','breath'],['People.html#first-night','Your first night','What to expect','checkin'],['People.html#near','What’s happening near you','This week in your town','pin'],['Spaces.html#types','For your type','Studios, coaches, venues, non-profits','contacts']];
FJ.forEach(function(s){s[2].forEach(function(j){j[1].forEach(function(f){IDX.push(['Features.html#f-'+f[0],f[1],s[1]+' · '+j[0],s[0]==='p'?'circle':'space'])})})});
var side=function(){return 'e';var s=document.body.dataset.side;if(document.body.dataset.lock)return s;try{return localStorage.getItem('fq-home-side')||s||'p'}catch(e){return s||'p'}};
function pkHTML(){return '<div class="mm-fx">'+FJ.map(function(s){return '<div class="mm-fxs" data-wing="'+(s[0]==='e'?'spaces':'community')+'"><a class="mm-fxh" href="'+U('Features.html#'+(s[0]==='e'?'spaces':'people'))+'">'+s[1]+' →</a><div class="mm-fxrow">'+s[2].map(function(j){return '<div class="mm-fxj"><span class="mm-h">'+j[0]+'</span><div class="mm-pkf">'+j[1].map(function(f){return '<a href="'+U('Features.html#f-'+f[0])+'">'+f[1]+'</a>'}).join('')+'</div></div>'}).join('')+'</div></div>'}).join('')+'</div><div class="mm-foot"><span>Open any feature to see how it works.</span><a class="btn fq-iri-btn" href="'+U('Features.html')+'">All features →</a></div>'}
function panelHTML(k){var p=M[k];if(p.pk)return pkHTML();
return '<div class="mm-grid" data-wing="'+p.wing+'">'+p.cols.map(function(c){return COL(c[0],c[1])}).join('')+'<div class="mm-cards">'+p.cards.map(C).join('')+'</div></div><div class="mm-foot"><span>'+p.foot[0]+'</span><a class="btn fq-iri-btn" href="'+U(p.foot[1])+'">'+p.foot[2]+' →</a></div>'}
var chev='<svg class="mm-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
function build(){var nav=document.querySelector('header.nav');if(!nav)return;var ul=nav.querySelector('ul');
var here=location.pathname.split('/').pop()||'Home.html',wingOf={'People.html':'people','Spaces.html':'spaces','Features.html':'packages'};
var ctas=[].slice.call(nav.children).filter(function(c){return c!==ul&&!c.classList.contains('logo')&&!c.querySelector('.logo')});
var m=document.createElement('nav');m.className='mm-bar';m.setAttribute('aria-label','Main');
m.innerHTML=Object.keys(M).map(function(k){return '<button class="mm-trig'+(wingOf[here]===k?' is-here':'')+'" aria-expanded="false" aria-haspopup="true" data-k="'+k+'">'+M[k].label+chev+'</button>'}).join('')+DIRECT.map(function(d){return '<a class="mm-trig'+(here===d[0]?' is-here':'')+'" href="'+U(d[0])+'"'+(here===d[0]?' aria-current="page"':'')+'>'+d[1]+'</a>'}).join('');
if(ul)ul.replaceWith(m);else nav.appendChild(m);
var right=document.createElement('div');right.className='acct';nav.appendChild(right);
var panel=document.createElement('div');panel.className='mm-panel';panel.setAttribute('role','region');panel.hidden=true;nav.appendChild(panel);
var scrim=document.createElement('div');scrim.className='mm-scrim';document.body.appendChild(scrim);
var cur=null,t=null;
function show(k){cur=k;m.querySelectorAll('[data-k]').forEach(function(b){b.setAttribute('aria-expanded',String(b.dataset.k===k))});panel.innerHTML=panelHTML(k);panel.hidden=false;requestAnimationFrame(function(){panel.classList.add('on')});nav.classList.add('mm-open');nav.classList.remove('is-hidden');scrim.classList.add('on');closePops()}
function hide(){if(!cur)return;cur=null;panel.classList.remove('on');nav.classList.remove('mm-open');scrim.classList.remove('on');m.querySelectorAll('[data-k]').forEach(function(b){b.setAttribute('aria-expanded','false')});setTimeout(function(){if(!cur)panel.hidden=true},220)}
var fine=matchMedia('(hover:hover) and (pointer:fine)');
m.querySelectorAll('[data-k]').forEach(function(b){
 b.addEventListener('mouseenter',function(){if(!fine.matches)return;clearTimeout(t);t=setTimeout(function(){show(b.dataset.k)},cur?60:180)});
 b.addEventListener('click',function(e){e.stopPropagation();clearTimeout(t);cur===b.dataset.k?hide():show(b.dataset.k)});
 b.addEventListener('keydown',function(e){if(e.key==='ArrowDown'){show(b.dataset.k);var f=panel.querySelector('a,button');f&&f.focus();e.preventDefault()}})});
m.querySelectorAll('a.mm-trig').forEach(function(a){a.addEventListener('mouseenter',function(){clearTimeout(t);t=setTimeout(hide,180)})});
nav.addEventListener('mouseleave',function(){if(!fine.matches)return;clearTimeout(t);t=setTimeout(hide,280)});nav.addEventListener('mouseenter',function(){clearTimeout(t)});
panel.addEventListener('click',function(e){var x=e.target.closest('[data-ms]');if(!x)return;e.stopPropagation();var s=x.dataset.ms;try{localStorage.setItem('fq-home-side',s)}catch(_){}
 if(!document.body.dataset.lock){var tb=document.querySelector('body [data-set="'+s+'"]');tb&&tb.click()}panel.innerHTML=pkHTML()});
scrim.onclick=hide;
/* search */
var sOpen=false,sw=document.createElement('div');sw.className='fq-search';sw.hidden=true;sw.setAttribute('role','dialog');sw.setAttribute('aria-label','Search');
sw.innerHTML='<div class="fq-sbox"><label class="fq-sin">'+I('search')+'<input type="search" placeholder="Search features, pages, pricing…" aria-label="Search"><kbd>esc</kbd></label><div class="fq-sres" role="listbox"></div></div>';document.body.appendChild(sw);
var sin=sw.querySelector('input'),sres=sw.querySelector('.fq-sres');
function sRender(){var q=sin.value.trim().toLowerCase(),r=q?IDX.filter(function(x){return (x[1]+' '+x[2]).toLowerCase().indexOf(q)>-1}):IDX.slice(0,9);
sres.innerHTML=(q?'':'<span class="mm-h">Jump to</span>')+(r.length?r.slice(0,9).map(L).join(''):'<p class="fq-sno">Nothing matches “'+sin.value.replace(/</g,'&lt;')+'”. Try a feature or a page.</p>')}
function sShow(){hide();closePops();sw.hidden=false;sOpen=true;sin.value='';sRender();requestAnimationFrame(function(){sw.classList.add('on');sin.focus()})}
function sHide(){sOpen=false;sw.classList.remove('on');setTimeout(function(){if(!sOpen)sw.hidden=true},180)}
sin.addEventListener('input',sRender);sin.addEventListener('keydown',function(e){if(e.key==='Enter'){var a=sres.querySelector('a');a&&(location.href=a.href)}});
sw.addEventListener('click',function(e){if(e.target===sw)sHide()});
/* account */
var auth=localStorage.getItem('fq-auth')==='in',role=localStorage.getItem('fq-mm-role')||'owner';
var NT=[['circle','Your Thursday Circle meets tomorrow','7:00pm · Saltwater Studio','2h'],['checkin','Ana checked in at Sunday Potluck','You brought her. +40 Zaps','1d'],['zap','Season 3 ends in 9 days','Your Circle meter is at 82%','2d']];
function roleLinks(){return R[role].g.map(function(x){return L(['Features.html',x[0],x[1],x[2]])}).join('')}
function acctHTML(){var s='<button class="acct-ic" data-a="search" aria-label="Search (press /)">'+I('search')+'</button>';
if(!auth)return s+'<button class="acct-login" data-a="login">Log in</button><span class="acct-cta"></span><button class="mm-menu" data-a="sheet" aria-expanded="false">Menu</button>';
return '<span class="acct-cta"></span>'+s+'<div class="acct-wrap"><button class="acct-ic" data-a="bell" aria-label="Notifications, 3 new" aria-expanded="false">'+I('nudge')+'<i class="acct-dot"></i></button><div class="acct-pop acct-bell" hidden><div class="acct-h"><b>Notifications</b><a href="#">Mark all read</a></div>'+NT.map(function(n){return '<a class="acct-n" href="'+U('People.html#near')+'"><i class="mm-ic">'+I(n[0])+'</i><span><b>'+n[1]+'</b><small>'+n[2]+'</small></span><em>'+n[3]+'</em></a>'}).join('')+'</div></div>'+
'<div class="acct-wrap"><button class="acct-me" data-a="me" aria-expanded="false" aria-label="Account: Maya"><span class="acct-av">M</span><span class="acct-nm">Maya</span>'+chev+'</button>'+
'<div class="acct-pop acct-menu" hidden><div class="acct-card"><span class="acct-av lg">M</span><span><b>Maya Okafor</b><small>Member · Host · Space owner</small></span></div>'+
'<div class="acct-stats"><span><b>1,240</b>Zaps</span><span><b>36</b>Gems</span><span><b>3</b>Circles</span></div>'+
'<div class="acct-roles" role="tablist">'+Object.keys(R).map(function(r){return '<button role="tab" data-role="'+r+'" aria-selected="'+(r===role)+'">'+R[r].t+'</button>'}).join('')+'</div><div class="acct-rl">'+roleLinks()+'</div>'+
'<div class="acct-foot"><a href="'+U('Help.html#account')+'">Settings</a><button data-a="logout">Log out</button></div></div></div><button class="mm-menu" data-a="sheet" aria-expanded="false">Menu</button>'}
function renderAcct(){right.innerHTML=acctHTML();var slot=right.querySelector('.acct-cta');if(slot)ctas.forEach(function(c){slot.appendChild(c)});nav.classList.toggle('is-auth',auth)}
function closePops(ex){right.querySelectorAll('.acct-pop').forEach(function(p){if(p!==ex){p.hidden=true;var b=p.previousElementSibling;b&&b.setAttribute('aria-expanded','false')}})}
renderAcct();
right.addEventListener('click',function(e){var r=e.target.closest('[data-role]');if(r){e.stopPropagation();role=r.dataset.role;localStorage.setItem('fq-mm-role',role);right.querySelectorAll('[data-role]').forEach(function(x){x.setAttribute('aria-selected',String(x===r))});right.querySelector('.acct-rl').innerHTML=roleLinks();return}
 var x=e.target.closest('[data-a]');if(!x)return;e.stopPropagation();var a=x.dataset.a;
 if(a==='search')return sShow();
 if(a==='sheet')return sheet(true);
 if(a==='login'||a==='logout'){auth=a==='login';localStorage.setItem('fq-auth',auth?'in':'out');renderAcct();return}
 var pop=x.nextElementSibling,open=pop.hidden;closePops(pop);pop.hidden=!open;x.setAttribute('aria-expanded',String(open));if(open)hide()});
/* mobile sheet */
var sh=document.createElement('div');sh.className='mm-sheet';sh.hidden=true;document.body.appendChild(sh);
function sheet(on){if(!on){sh.classList.remove('on');setTimeout(function(){sh.hidden=true},220);document.documentElement.style.overflow='';return}
 var s=side(),h=s==='e'?'#spaces':'#people';
 sh.innerHTML='<div class="mm-shtop"><span class="mm-h">Menu</span><button class="acct-ic" data-x aria-label="Close menu">✕</button></div><button class="fq-sin as-btn" data-s>'+I('search')+'<span>Search features, pages, pricing…</span></button>'+
 (auth?'':'<div class="mm-shcta"><button class="btn btn-ghost fq-iri-rim" data-login>Log in</button><a class="btn fq-iri-btn" href="'+U(s==='e'?'Spaces.html':'People.html')+'">'+(s==='e'?'Open your Space':'Find your Circle')+'</a></div>')+
 ['people','spaces'].map(function(k){return '<details'+(wingOf[here]===k?' open':'')+'><summary>'+M[k].label+'</summary>'+M[k].cols.map(function(c){return c[1].map(L).join('')}).join('')+'</details>'}).join('')+
 '<details'+(wingOf[here]==='packages'?' open':'')+'><summary>Features</summary>'+FJ.map(function(x){return L(['Features.html#'+(x[0]==='e'?'spaces':'people'),x[1],x[2].map(function(j){return j[0]}).join(' · '),x[0]==='e'?'space':'circle'])}).join('')+'</details>'+
 DIRECT.map(function(d){return '<a class="mm-shlink" href="'+U(d[0])+'">'+d[1]+'</a>'}).join('');
 sh.hidden=false;document.documentElement.style.overflow='hidden';requestAnimationFrame(function(){sh.classList.add('on')})}
sh.addEventListener('click',function(e){if(e.target.closest('[data-x]'))sheet(false);if(e.target.closest('[data-s]')){sheet(false);sShow()}if(e.target.closest('[data-login]')){auth=true;localStorage.setItem('fq-auth','in');renderAcct();sheet(false)}});
document.addEventListener('click',function(e){if(cur&&!nav.contains(e.target))hide();if(!right.contains(e.target))closePops()});
document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(sOpen)sHide();else if(cur){var b=m.querySelector('[data-k="'+cur+'"]');hide();b&&b.focus()}closePops();if(!sh.hidden)sheet(false)}
 if(e.key==='/'&&!sOpen&&!/INPUT|TEXTAREA/.test(document.activeElement.tagName)){e.preventDefault();sShow()}});
nav.addEventListener('focusin',function(){nav.classList.remove('is-hidden')});
var bar=document.createElement('span');bar.className='fq-progress';nav.appendChild(bar);
var last=scrollY,tk=false;function onS(){var y=scrollY,h=document.documentElement.scrollHeight-innerHeight;nav.classList.toggle('is-scrolled',y>24);if(!cur){if(y>last+6&&y>240){nav.classList.add('is-hidden');closePops()}else if(y<last-6)nav.classList.remove('is-hidden')}nav.style.setProperty('--p',h>0?(y/h).toFixed(3):0);last=y;tk=false}
addEventListener('scroll',function(){if(!tk){requestAnimationFrame(onS);tk=true}},{passive:true});onS();
if(me.dataset.open)show(me.dataset.open)}
function sprite(cb){if(document.getElementById('qr')){cb();return}fetch(AS('icons/frequency-icons.svg')).then(function(r){return r.text()}).then(function(s){var d=document.createElement('div');d.style.display='none';d.innerHTML=s;document.body.insertBefore(d,document.body.firstChild);cb()}).catch(cb)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){sprite(build)});else sprite(build);
})();
