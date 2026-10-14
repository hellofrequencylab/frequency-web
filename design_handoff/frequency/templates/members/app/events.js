/* Frequency Events. Mirrors frequency-web /events (EventsSurface): hero search + member actions, category tabs,
   facets (Date, Format, Price, Pace, Spots, Distance) + Sort, For you lane, People to meet, EventCard grid,
   List / Map / Calendar views. Map: Google when a key is present (window.FQ_GMAPS_KEY or localStorage
   'fq-gmaps-key'), else the same pins on Leaflet. Geolocates; pins sit on the host's area, not the address. */
(function(){
var d=document,$=function(s,r){return (r||d).querySelector(s)},LS=function(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){}};
var HOME=[32.8128,-117.2735],P='../../assets/photos/',MON=['Oct'],DOW=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
/* d = days from today (Mon Oct 12). cat: mind|body|spirit|expression. fmt: in_person|online|hybrid. pace: still|flow|charge */
var EV=[
{id:'flow',n:'Sunset park flow',pl:'Kate Sessions Park',ll:[32.8077,-117.2335],d:0,t:'5:30pm',h:17.5,live:1,cat:'body',fmt:'in_person',pace:'flow',cap:20,g:12,f:['Ana'],img:'day-park-yoga.jpg',host:'Cardiff Movers',circle:1,price:'Free',rep:'Every Monday'},
{id:'opensit',n:'Open sit',pl:'Royal Temple',ll:[32.8190,-117.2650],d:0,t:'4:00pm',h:16,live:1,cat:'spirit',fmt:'in_person',pace:'still',cap:null,g:5,f:[],img:'day-meditation-circle.jpg',host:'Royal Temple',circle:1,price:'Free'},
{id:'social',n:'String-light social',pl:'Low Tide Café',ll:[32.7960,-117.2540],d:0,t:'8:00pm',h:20,cat:'expression',fmt:'in_person',pace:'charge',cap:50,g:41,f:['Jonah','Priya'],img:'night-string-lights-web.jpg',host:'Low Tide Café',price:'$10',featured:1},
{id:'breath',n:'Breathwork basics',pl:'Online · Zoom',ll:null,d:0,t:'7:30pm',h:19.5,cat:'mind',fmt:'online',pace:'still',cap:null,g:14,f:[],img:'gathering-04.jpg',host:'Saltwater Studio',price:'$15'},
{id:'sunrise',n:'Sunrise sit',pl:'Bird Rock beach',ll:[32.8128,-117.2745],d:1,t:'6:00am',h:6,cat:'spirit',fmt:'in_person',pace:'still',cap:12,g:8,f:['Jonah','Marcus'],img:'day-beach-hoop.jpg',host:'Bird Rock Sunrise Circle',circle:1,price:'Free',rep:'Every weekday'},
{id:'plunge',n:'Cold plunge club',pl:'Windansea',ll:[32.8300,-117.2810],d:1,t:'7:00am',h:7,cat:'body',fmt:'in_person',pace:'charge',cap:10,g:9,f:[],img:'gathering-13.jpg',host:'Windansea Plungers',circle:1,price:'Free'},
{id:'hoop',n:'Hoop jam',pl:'Kellogg Park',ll:[32.8505,-117.2585],d:1,t:'5:30pm',h:17.5,cat:'expression',fmt:'in_person',pace:'flow',cap:null,g:9,f:[],img:'gathering-05.jpg',host:'La Jolla Hoopers',price:'Free'},
{id:'bath',n:'Sunset sound bath',pl:'Royal Temple garden',ll:[32.8195,-117.2640],d:3,t:'6:00pm',h:18,cat:'spirit',fmt:'hybrid',pace:'still',cap:20,g:16,f:['Audrey','Priya'],img:'night-string-lights-web.jpg',host:'Royal Temple',circle:1,price:'$20',invite:'Audrey invited you'},
{id:'garden',n:'Garden sit',pl:'Royal Temple garden',ll:[32.8185,-117.2630],d:3,t:'6:30pm',h:18.5,cat:'mind',fmt:'in_person',pace:'still',cap:12,g:9,f:['Jonah','Priya','Theo'],img:'day-meditation-circle.jpg',host:'Royal Temple',circle:1,price:'Free',rep:'Every Thursday'},
{id:'run',n:'Run club',pl:'PB boardwalk',ll:[32.7930,-117.2560],d:4,t:'6:00pm',h:18,cat:'body',fmt:'in_person',pace:'charge',cap:null,g:40,f:['Ana'],img:'gathering-14.jpg',host:'Cardiff Movers',circle:1,price:'Free',rep:'Every Friday'},
{id:'packout',n:'Beach pack-out',pl:'Windansea',ll:[32.8290,-117.2800],d:5,t:'8:00am',h:8,cat:'expression',fmt:'in_person',pace:'flow',cap:30,g:26,f:['Priya','Theo','Ana','Marcus'],img:'gathering-03.jpg',host:'Bird Rock Sunrise Circle',circle:1,price:'Free',featured:1},
{id:'sflow',n:'Sunrise flow',pl:'Kate Sessions Park',ll:[32.8070,-117.2320],d:5,t:'7:00am',h:7,cat:'body',fmt:'in_person',pace:'flow',cap:35,g:31,f:[],img:'day-park-yoga.jpg',host:'Saltwater Studio',price:'$12'},
{id:'play',n:'Parachute play day',pl:'Mission Bay Park',ll:[32.7810,-117.2240],d:6,t:'10:00am',h:10,cat:'expression',fmt:'in_person',pace:'charge',cap:null,g:18,f:[],img:'day-parachute-play.jpg',host:'Frequency Families',price:'Free'},
{id:'journal',n:'Morning pages circle',pl:'Online · Frequency room',ll:null,d:8,t:'7:00am',h:7,cat:'mind',fmt:'online',pace:'still',cap:16,g:7,f:['Theo'],img:'gathering-06.jpg',host:'Mind Journey',price:'Free',rep:'Every Wednesday'},
{id:'drum',n:'Full moon drum circle',pl:'Black’s Beach trailhead',ll:[32.8790,-117.2510],d:12,t:'7:30pm',h:19.5,cat:'expression',fmt:'in_person',pace:'charge',cap:60,g:52,f:['Jonah','Ana'],img:'gathering-07.jpg',host:'Torrey Drum Collective',price:'$5'},
{id:'retreat',n:'Half-day silent retreat',pl:'Royal Temple',ll:[32.8192,-117.2655],d:19,t:'9:00am',h:9,cat:'spirit',fmt:'in_person',pace:'still',cap:24,g:24,f:['Audrey'],img:'day-meditation-circle.jpg',host:'Royal Temple',circle:1,price:'$45'}
];
var FACE={Jonah:'gathering-02.jpg',Priya:'gathering-06.jpg',Marcus:'gathering-07.jpg',Ana:'gathering-05.jpg',Theo:'gathering-03.jpg',Audrey:'gathering-04.jpg'};
var WHY={social:'Jonah and Priya are going, and you’ve been twice.',bath:'You sat with Audrey six times. She asked for you.',packout:'Four of your people. Your Circle is co-hosting.',garden:'You sit on Thursdays. Three friends will be there.',sunrise:'Your Circle, five minutes from home.',drum:'Jonah and Ana go every full moon.'};
var CATS=[['all','All'],['mind','Mind'],['body','Body'],['spirit','Spirit'],['expression','Expression']];
var FACETS=[
 {k:'date',label:'Date',opts:[['today','Today'],['week','This week'],['weekend','This weekend'],['month','This month']]},
 {k:'fmt',label:'Format',opts:[['in_person','In person'],['online','Online'],['hybrid','In person + online']]},
 {k:'price',label:'Price',opts:[['free','Free'],['paid','Paid']]},
 {k:'pace',label:'Pace',opts:[['still','Still'],['flow','Flow'],['charge','Charge']]},
 {k:'spots',label:'Spots',opts:[['1','Has open spots']]},
 {k:'near',label:'Distance',opts:[['2','Within 2 mi'],['5','Within 5 mi'],['15','Within 15 mi']]}];
var SORTS=[['date','Soonest'],['distance','Nearest'],['popularity','Most going'],['relevance','Best match']];
var S={cat:'all',q:'',f:{},sort:'date',view:LS('fq-ev-view2')||'split',going:{},hover:null,sel:null,me:HOME.slice(),open:null,met:{}};
try{S.going=JSON.parse(LS('fq-ev-going')||'null')||{sunrise:1,bath:1}}catch(e){S.going={sunrise:1,bath:1}}
var esc=function(s){return String(s).replace(/[&<"]/g,function(c){return {'&':'&amp;','<':'&lt;','"':'&quot;'}[c]})};
var IC=function(id,st){return '<svg class="fq-icon"'+(st?' style="'+st+'"':'')+' aria-hidden="true"><use href="#'+id+'"></use></svg>'};
function mi(a,b){var R=3958.8,r=Math.PI/180,dl=(b[0]-a[0])*r,dg=(b[1]-a[1])*r,x=Math.sin(dl/2)*Math.sin(dl/2)+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dg/2)*Math.sin(dg/2);return 2*R*Math.asin(Math.sqrt(x))}
function dist(e){return e.ll?mi(S.me,e.ll):null}
function going(e){return e.g+(S.going[e.id]?1:0)}
function dayDate(n){return 12+n}
function dayName(n){return n===0?'Today':n===1?'Tomorrow':DOW[n%7]+' Oct '+dayDate(n)}
function when(e){return (e.live?'Happening now':dayName(e.d))+' · '+e.t}
function att(e){var g=going(e);return e.cap!=null?g+' of '+e.cap+' going':g>0?g+' going':'Be the first'}
function warm(e){if(e.cap==null)return '';var left=Math.max(0,e.cap-going(e));if(!left)return '<span class="ev-badge mute">Waitlist</span>';if(left<=e.cap*.2)return '<span class="ev-badge warm">Filling up</span>';return ''}
function friends(e){var f=e.f;if(!f.length)return '';if(f.length===1)return f[0]+' is going';if(f.length===2)return f[0]+' and '+f[1]+' are going';return f[0]+', '+f[1]+' and '+(f.length-2)+' more'}
function pass(e,skip){var F=S.f;
 if(S.cat!=='all'&&e.cat!==S.cat)return false;
 if(S.q){var q=S.q.toLowerCase();if((e.n+' '+e.pl+' '+e.host).toLowerCase().indexOf(q)<0)return false}
 if(skip!=='date'&&F.date){if(F.date==='today'&&e.d!==0)return false;if(F.date==='week'&&e.d>6)return false;if(F.date==='weekend'&&!(e.d===5||e.d===6))return false}
 if(skip!=='fmt'&&F.fmt&&e.fmt!==F.fmt)return false;
 if(skip!=='price'&&F.price&&((F.price==='free')!==(e.price==='Free')))return false;
 if(skip!=='pace'&&F.pace&&e.pace!==F.pace)return false;
 if(skip!=='spots'&&F.spots&&e.cap!=null&&going(e)>=e.cap)return false;
 if(skip!=='near'&&F.near){var dm=dist(e);if(dm==null||dm>+F.near)return false}
 return true}
function list(){var L=EV.filter(function(e){return pass(e)});var so=S.sort;
 L.sort(function(a,b){if(so==='distance')return (dist(a)==null?999:dist(a))-(dist(b)==null?999:dist(b));if(so==='popularity')return going(b)-going(a);if(so==='relevance')return score(b)-score(a);return (a.d-b.d)||(a.h-b.h)});return L}
function score(e){return e.f.length*3+(e.invite?4:0)+(e.featured?2:0)+(S.going[e.id]?-5:0)+(e.cat==='spirit'?1:0)}
function filtering(){return S.cat!=='all'||!!S.q||Object.keys(S.f).length>0}
/* ---------- card ---------- */
function card(e,blurb){var g=!!S.going[e.id],dm=dist(e);
 return '<article class="ev-card'+(S.hover===e.id||S.sel===e.id?' hot':'')+'" data-ev="'+e.id+'">'+
 '<a href="Event.html" class="ev-cover" style="background-image:url(\''+P+e.img+'\')"><span class="ev-date"><b>'+dayDate(e.d)+'</b><i>Oct</i></span><span class="ev-badges">'+(e.live?'<span class="ev-badge live"><span class="dot fq-breathe"></span>Live</span>':'')+(e.featured?'<span class="ev-badge feat">'+IC('award','width:12px;height:12px')+'Featured</span>':'')+warm(e)+'</span>'+(e.invite?'<span class="ev-invite">'+esc(e.invite)+'</span>':'')+'</a>'+
 '<div class="ev-b"><span class="ev-when">'+when(e)+(e.rep?'<span>'+IC('streak','width:12px;height:12px')+e.rep+'</span>':'')+'</span><a href="Event.html" class="ev-t">'+esc(e.n)+'</a>'+
 (blurb?'<span class="ev-why">'+esc(blurb)+'</span>':'')+
 '<div class="ev-stats"><span>'+IC('contacts','width:13px;height:13px')+att(e)+'</span><span class="ev-price">'+IC('ticket','width:13px;height:13px')+e.price+'</span>'+(dm!=null?'<span>'+IC('compass','width:13px;height:13px')+dm.toFixed(1)+' mi</span>':'<span>'+IC('globe','width:13px;height:13px')+(e.fmt==='online'?'Online':'Hybrid')+'</span>')+'</div>'+
 '<div class="ev-prov">'+(e.circle?'<span class="ev-chip circ">'+esc(e.host)+'</span>':'<span class="ev-chip">'+IC('globe','width:11px;height:11px')+'Public · '+esc(e.host)+'</span>')+'<span class="t2">'+IC('pin','width:12px;height:12px;vertical-align:-2px')+' '+esc(e.pl)+'</span></div>'+
 '<div class="ev-foot">'+(e.f.length?'<span class="faces">'+e.f.slice(0,3).map(function(n){return '<span class="av s" style="background-image:url(\''+P+FACE[n]+'\')"></span>'}).join('')+'</span><span class="t2 grow">'+friends(e)+'</span>':'<span class="grow"></span>')+'<button class="btn sm'+(g?' pa':'')+'" data-go="'+e.id+'">'+IC(g?'check':'plus')+(g?'Going':'Going?')+'</button></div></div></article>'}
/* ---------- render ---------- */
function drawTabs(){$('#ev-tabs').innerHTML=CATS.map(function(c){var n=EV.filter(function(e){return c[0]==='all'||e.cat===c[0]}).length;return '<button class="'+(S.cat===c[0]?'on':'')+'" data-cat="'+c[0]+'">'+c[1]+'<i>'+n+'</i></button>'}).join('')}
function drawFacets(){var html=FACETS.map(function(f){var v=S.f[f.k],cur=v?f.opts.filter(function(o){return o[0]===v})[0][1]:f.label;return '<div class="ev-dd'+(S.open===f.k?' open':'')+'"><button class="ev-facet'+(v?' on':'')+'" data-dd="'+f.k+'" aria-expanded="'+(S.open===f.k)+'">'+cur+IC('chevron','width:13px;height:13px')+'</button><div class="ev-menu" role="listbox">'+f.opts.map(function(o){var n=EV.filter(function(e){var x=S.f[f.k];S.f[f.k]=o[0];var ok=pass(e);if(x==null)delete S.f[f.k];else S.f[f.k]=x;return ok}).length;return '<button data-fk="'+f.k+'" data-fv="'+o[0]+'" class="'+(v===o[0]?'on':'')+'"><span>'+o[1]+'</span><i>'+n+'</i>'+(v===o[0]?IC('check','width:14px;height:14px'):'')+'</button>'}).join('')+(v?'<button data-fk="'+f.k+'" data-fv="" class="clr">Clear</button>':'')+'</div></div>'}).join('');
 var sl=SORTS.filter(function(s){return s[0]!=='relevance'||S.q}),cs=SORTS.filter(function(s){return s[0]===S.sort})[0];
 html+='<span class="ap-sp"></span>'+(filtering()?'<button class="ev-clear" data-clearall>Clear filters</button>':'')+'<div class="ev-dd right'+(S.open==='sort'?' open':'')+'"><button class="ev-facet'+(S.sort!=='date'?' on':'')+'" data-dd="sort">'+IC('filter','width:14px;height:14px')+'Sort: '+cs[1]+'</button><div class="ev-menu">'+sl.map(function(s){return '<button data-sort="'+s[0]+'" class="'+(S.sort===s[0]?'on':'')+'"><span>'+s[1]+'</span>'+(S.sort===s[0]?IC('check','width:14px;height:14px'):'')+'</button>'}).join('')+'</div></div>';
 $('#ev-facets').innerHTML=html}
function drawViews(){$('#ev-views').innerHTML=[['split','map','Map'],['grid','page','List'],['calendar','event','Calendar']].map(function(v){return '<button class="'+(S.view===v[0]?'on':'')+'" data-view="'+v[0]+'">'+IC(v[1],'width:15px;height:15px')+v[2]+'</button>'}).join('')}
function drawForYou(){var box=$('#ev-foryou');if(filtering()||S.view==='calendar'){box.innerHTML='';return}
 var top=EV.filter(function(e){return !S.going[e.id]&&e.f.length}).sort(function(a,b){return score(b)-score(a)}).slice(0,4);if(top.length<2){box.innerHTML='';return}
 box.innerHTML='<div class="sec-h"><div class="stack" style="gap:6px"><span class="h2"><span class="orb" style="width:18px;height:18px;display:inline-block;vertical-align:-2px;margin-right:8px"></span>For you</span><span class="t2">Picked from what is coming up, by what you are into and who is going.</span></div></div><div class="ev-lane">'+top.map(function(e){return card(e,WHY[e.id]||'')}).join('')+'</div>'+
 '<section class="ev-meet"><div class="stack" style="gap:6px"><span class="h3">'+IC('contacts','width:16px;height:16px;vertical-align:-3px;margin-right:6px')+'People to meet</span><span class="t2">Going to the same things you are, into the same Channels. Say hi before the room does.</span></div><div class="ev-meet-row">'+[['Sunny Ortega','gathering-12.jpg','Both into Movement and Sound'],['Lena Park','gathering-11.jpg','Both into Stillness'],['Kai Moreno','gathering-10.jpg','Both into Creative, and more']].map(function(p,i){var on=S.met[i];return '<div class="ev-person"><span class="av m" style="background-image:url(\''+P+p[1]+'\')"></span><span class="grow"><b>'+p[0]+'</b><span class="t2">'+p[2]+'</span></span><button class="btn sm'+(on?' ink':'')+'" data-meet="'+i+'">'+(on?'Requested':'Connect')+'</button></div>'}).join('')+'</div></section>'}
function drawList(){var L=list();
 $('#ev-sum').innerHTML='<span class="h2">'+(filtering()?'Matching events':'Everything coming up')+'</span><span class="t2">'+L.length+' '+(L.length===1?'event':'events')+(S.f.near?' within '+S.f.near+' mi':'')+'</span>';
 $('#ev-list').innerHTML=L.length?L.map(function(e){return card(e)}).join(''):'<div class="ev-empty"><span class="ic">'+IC('event')+'</span><span class="h3">No events match these filters</span><span class="t2">Try another category or clear the filter to see everything coming up.</span><button class="btn pa" data-clearall>Clear filters</button></div>';
 drawCal(L);pins()}
function drawCal(L){var box=$('#ev-cal');if(S.view!=='calendar'){box.innerHTML='';return}
 var head=DOW.map(function(x){return '<span class="k">'+x+'</span>'}).join(''),cells='';
 /* Oct 2026 starts on a Thursday: 3 leading blanks in a Monday-first grid */
 for(var i=0;i<3;i++)cells+='<div class="ev-cell out"></div>';
 for(var day=1;day<=31;day++){var evs=L.filter(function(e){return dayDate(e.d)===day});cells+='<div class="ev-cell'+(day===12?' today':'')+(day<12?' past':'')+'"><span class="ev-cd">'+day+'</span>'+evs.slice(0,3).map(function(e){return '<a href="Event.html" class="ev-chipcal'+(S.going[e.id]?' going':'')+'" title="'+esc(e.n)+'"><b>'+e.t.replace(':00','')+'</b>'+esc(e.n)+'</a>'}).join('')+(evs.length>3?'<span class="t2">+'+(evs.length-3)+' more</span>':'')+'</div>'}
 var rem=(3+31)%7;if(rem)for(var j=rem;j<7;j++)cells+='<div class="ev-cell out"></div>';
 box.innerHTML='<div class="ev-cal-h"><span class="h2">October 2026</span><span class="ap-sp"></span><button class="btn sm" data-sub>'+IC('download')+'Subscribe</button></div><div class="ev-cal-g">'+head+cells+'</div><span class="t2">Every upcoming public event across Frequency. Subscribe once and they show up in Google or Apple Calendar.</span>'}
function drawAll(){drawTabs();drawFacets();drawViews();drawForYou();drawList();d.body.dataset.evView=S.view;if(map&&map.resize)setTimeout(function(){map.resize();fit()},60)}
/* ---------- interactions ---------- */
$('#ev-q').addEventListener('input',function(){S.q=this.value.trim();if(S.q&&S.sort==='date')S.sort='relevance';if(!S.q&&S.sort==='relevance')S.sort='date';drawFacets();drawForYou();drawList()});
d.addEventListener('click',function(e){var t=e.target;
 var dd=t.closest('[data-dd]');if(dd){S.open=S.open===dd.dataset.dd?null:dd.dataset.dd;drawFacets();return}
 if(!t.closest('.ev-menu')&&S.open){S.open=null;drawFacets()}
 var x;
 if(x=t.closest('[data-fk]')){var k=x.dataset.fk,v=x.dataset.fv;if(v)S.f[k]=v;else delete S.f[k];S.open=null;drawAll();return}
 if(x=t.closest('[data-sort]')){S.sort=x.dataset.sort;S.open=null;drawAll();return}
 if(x=t.closest('[data-cat]')){S.cat=x.dataset.cat;drawAll();return}
 if(x=t.closest('[data-view]')){S.view=x.dataset.view;LS('fq-ev-view2',S.view);drawAll();return}
 if(t.closest('[data-clearall]')){S.cat='all';S.q='';S.f={};$('#ev-q').value='';if(S.sort==='relevance')S.sort='date';drawAll();return}
 if(x=t.closest('[data-go]')){e.preventDefault();var id=x.dataset.go,on=!S.going[id];if(on)S.going[id]=1;else delete S.going[id];LS('fq-ev-going',JSON.stringify(S.going));var ev=EV.filter(function(y){return y.id===id})[0];window.fqToast&&fqToast(on?'You’re going to '+ev.n+'. Check in at the door for ⚡ 25.':'Removed '+ev.n+' from your week.');drawForYou();drawList();drawYours();return}
 if(x=t.closest('[data-meet]')){S.met[x.dataset.meet]=!S.met[x.dataset.meet];drawForYou();return}
 if(t.closest('[data-sub]')){window.fqToast&&fqToast('Subscribed. Events you’re going to land in your calendar.');return}
 if(t.closest('[data-calview]')){S.view='calendar';LS('fq-ev-view2',S.view);drawAll();scrollTo({top:$('#ev-views').getBoundingClientRect().top+scrollY-100,behavior:'smooth'});return}
 if(t.closest('[data-locate]')){locate(true)}
});
d.addEventListener('keydown',function(e){if(e.key==='Escape'&&S.open){S.open=null;drawFacets()}});
var lst=$('#ev-list');
lst.addEventListener('mouseover',function(e){var c=e.target.closest('[data-ev]');var id=c?c.dataset.ev:null;if(id!==S.hover){S.hover=id;hotPins()}});
lst.addEventListener('mouseleave',function(){S.hover=null;hotPins()});
function drawYours(){var mine=EV.filter(function(e){return S.going[e.id]}).sort(function(a,b){return a.d-b.d||a.h-b.h});var yw=$('#ev-yours');if(!yw)return;
 yw.innerHTML=mine.length?mine.map(function(e){return '<a href="Event.html"><span class="t2" style="width:48px">'+(e.d===0?'Today':DOW[e.d%7])+'</span><span class="dot"></span><span class="t1 grow">'+esc(e.n)+'</span><span class="t2">'+e.t+'</span></a>'}).join(''):'<span class="t2">Nothing yet. Tap Going? on anything.</span>';
 var n=Math.min(mine.filter(function(e){return e.d<7}).length,3),gm=$('#ev-goal');if(gm)gm.innerHTML='<div class="meter"><i style="width:'+(n/3*100)+'%"></i></div><span class="t2">Show up 3 times this week · '+(n>=3?'goal met':(3-n)+' to go')+'</span>'}
/* ---------- map ---------- */
var map=null,markers={},meMarker=null;
function pinHTML(e){var g=!!S.going[e.id];return '<div class="evx-pin'+(e.live?' live':'')+(g?' going':'')+'" data-pin="'+e.id+'"><span class="evx-pin-ph" style="background-image:url(\''+P+e.img+'\')"></span><b>'+(e.live?'Now':(e.d===0?'':DOW[e.d%7]+' ')+e.t.replace(':00',''))+'</b>'+(g?'<i>'+IC('check','width:11px;height:11px')+'</i>':'')+'</div>'}
function popHTML(e){return '<a href="Event.html" class="evx-pop"><span class="ph" style="background-image:url(\''+P+e.img+'\')"></span><span><b>'+esc(e.n)+'</b><span class="t2">'+when(e)+'</span><span class="t2">'+att(e)+' · '+e.price+'</span><span class="evx-pop-cta">View event →</span></span></a>'}
function hotPins(){d.querySelectorAll('.evx-pin').forEach(function(p){p.classList.toggle('hot',p.dataset.pin===S.hover||p.dataset.pin===S.sel)});d.querySelectorAll('.ev-card').forEach(function(c){c.classList.toggle('hot',c.dataset.ev===S.hover||c.dataset.ev===S.sel)})}
function pick(id){S.sel=id;hotPins();var c=d.querySelector('#ev-list .ev-card[data-ev="'+id+'"]');if(c)scrollTo({top:c.getBoundingClientRect().top+scrollY-120,behavior:'smooth'});map&&map.pop(id)}
function pins(){if(!map)return;var L=list().filter(function(e){return e.ll}),ids={};L.forEach(function(e){ids[e.id]=1});Object.keys(markers).forEach(function(id){map.remove(markers[id]);delete markers[id]});L.forEach(function(e){markers[e.id]=map.add(e)});hotPins();var c=$('#ev-mapcount');if(c)c.textContent=L.length+' on the map'}
function fit(){if(!map)return;var L=list().filter(function(e){return e.ll});map.fit(L.map(function(e){return e.ll}).concat([S.me]))}
function useLeaflet(){var css=d.createElement('link');css.rel='stylesheet';css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';d.head.appendChild(css);var s=d.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';s.onload=function(){
 var m=L.map('evx-map',{zoomControl:false,scrollWheelZoom:true}).setView(S.me,13);
 L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{maxZoom:19,subdomains:'abcd',attribution:'© OpenStreetMap © CARTO'}).addTo(m);
 L.control.zoom({position:'bottomright'}).addTo(m);
 map={add:function(e){var mk=L.marker(e.ll,{icon:L.divIcon({className:'evx-di',html:pinHTML(e),iconSize:null}),riseOnHover:true}).addTo(m);mk.on('click',function(){pick(e.id)});mk.bindPopup(popHTML(e),{closeButton:false,offset:[0,-36],className:'evx-lpop'});return mk},
  remove:function(mk){m.removeLayer(mk)},
  fit:function(pts){if(pts.length>1)m.flyToBounds(pts,{padding:[70,70],maxZoom:14,duration:.6});else m.flyTo(S.me,13,{duration:.6})},
  pop:function(id){var mk=markers[id];if(mk)mk.openPopup()},
  me:function(){if(meMarker)m.removeLayer(meMarker);meMarker=L.marker(S.me,{icon:L.divIcon({className:'evx-di',html:'<div class="evx-me"><i></i></div>',iconSize:null}),interactive:false,zIndexOffset:-100}).addTo(m)},
  resize:function(){m.invalidateSize()}};
 map.me();pins();fit();$('#evx-map').classList.add('ready')};d.head.appendChild(s)}
function useGoogle(key){window.__fqGm=function(){var m=new google.maps.Map($('#evx-map'),{center:{lat:S.me[0],lng:S.me[1]},zoom:13,mapId:'DEMO_MAP_ID',disableDefaultUI:true,zoomControl:true,gestureHandling:'greedy',clickableIcons:false});var info=new google.maps.InfoWindow({headerDisabled:true});
 google.maps.importLibrary('marker').then(function(lib){
 map={add:function(e){var el=d.createElement('div');el.innerHTML=pinHTML(e);var mk=new lib.AdvancedMarkerElement({map:m,position:{lat:e.ll[0],lng:e.ll[1]},content:el.firstChild,title:e.n});mk.addListener('click',function(){pick(e.id)});mk.__e=e;return mk},
  remove:function(mk){mk.map=null},
  fit:function(pts){var b=new google.maps.LatLngBounds();pts.forEach(function(p){b.extend({lat:p[0],lng:p[1]})});if(pts.length>1)m.fitBounds(b,70);else{m.panTo({lat:S.me[0],lng:S.me[1]});m.setZoom(13)}},
  pop:function(id){var mk=markers[id];if(!mk)return;info.setContent(popHTML(mk.__e));info.open({map:m,anchor:mk})},
  me:function(){if(meMarker)meMarker.map=null;var el=d.createElement('div');el.innerHTML='<div class="evx-me"><i></i></div>';meMarker=new lib.AdvancedMarkerElement({map:m,position:{lat:S.me[0],lng:S.me[1]},content:el.firstChild,zIndex:-1})},
  resize:function(){}};
 map.me();pins();fit();$('#evx-map').classList.add('ready')})};
 var s=d.createElement('script');s.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&v=weekly&loading=async&callback=__fqGm';s.onerror=useLeaflet;d.head.appendChild(s)}
function locate(force){var lbl=$('#ev-where');if(!('geolocation' in navigator))return;if(lbl&&force)lbl.textContent='Finding you…';
 navigator.geolocation.getCurrentPosition(function(p){var me=[p.coords.latitude,p.coords.longitude],far=mi(HOME,me)>40;
  if(far){var dl=me[0]-HOME[0],dg=me[1]-HOME[1];EV.forEach(function(e){if(e.ll)e.ll=[e.ll[0]+dl,e.ll[1]+dg]})}
  S.me=me;if(lbl)lbl.textContent=far?'Near you · demo events placed around you':'Near you · Bird Rock';if(map)map.me();drawAll()},
 function(){if(lbl)lbl.textContent='Bird Rock';if(force&&window.fqToast)fqToast('Location is off. Showing Bird Rock.')},{timeout:6000,maximumAge:600000})}
/* ---------- boot ---------- */
drawAll();drawYours();
var key=window.FQ_GMAPS_KEY||LS('fq-gmaps-key');if(key)useGoogle(key);else useLeaflet();
locate(false);
})();
