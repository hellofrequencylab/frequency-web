/* Frequency event map. Mounts on [data-fqmap="people|spaces"]. Web kit. Needs Leaflet 1.9.4 (css+js) loaded in <head>. OSM tiles, darkened to Stage. */
(function(){
var IC='#';
var EV=[
{n:'Breathwork Circle',p:'Saltwater Studio · Ocean Beach',t:'Thu 7:00pm',d:'Thu',k:'circle',tag:'4 spots left',ll:[32.7486,-117.2498]},
{n:'Supper club',p:'Ember Café · North Park',t:'Fri 6:30pm',d:'Fri',k:'event',tag:'Event',ll:[32.7480,-117.1300]},
{n:'Run Club',p:'Shoreline Park · Shelter Island',t:'Sat 8:00am',d:'Sat',k:'circle',tag:'Weekly',ll:[32.7135,-117.2280]},
{n:'Yoga rave',p:'The Warehouse · Barrio Logan',t:'Sat 9:00pm',d:'Sat',k:'event',tag:'32 going',ll:[32.6977,-117.1460]},
{n:'Sunday potluck',p:'Garden House · South Park',t:'Sun 10:00am',d:'Sun',k:'circle',tag:'Host: Ana',ll:[32.7240,-117.1290]},
{n:'Clay night',p:'Kiln Collective · Little Italy',t:'Mon 6:00pm',d:'Mon',k:'circle',tag:'2 spots left',ll:[32.7240,-117.1690]},
{n:'Book Circle',p:'Tidepool Books · La Jolla',t:'Tue 7:30pm',d:'Tue',k:'circle',tag:'Weekly',ll:[32.8470,-117.2740]},
{n:'Sunrise sit',p:'North Beach · Pacific Beach',t:'Wed 6:00am',d:'Wed',k:'circle',tag:'Free',ll:[32.7970,-117.2560]},
{n:'Sound bath',p:'The Long Room · Hillcrest',t:'Thu 8:00pm',d:'Thu',k:'event',tag:'Event',ll:[32.7480,-117.1640]},
{n:'Volleyball Circle',p:'Mission Beach',t:'Sat 4:00pm',d:'Sat',k:'circle',tag:'Weekly',ll:[32.7700,-117.2520]}];
var SP=[
{n:'Saltwater Studio',p:'Ocean Beach · Studio',s:'Gathered 18 times this month',r:1,ll:[32.7486,-117.2498],you:1},
{n:'Kiln Collective',p:'Little Italy · Venue',s:'Gathered 15 times',r:2,ll:[32.7240,-117.1690]},
{n:'Ember Café',p:'North Park · Café',s:'Gathered 12 times',r:3,ll:[32.7480,-117.1300]},
{n:'Tidepool Books',p:'La Jolla · Venue',s:'Gathered 9 times',r:4,ll:[32.8470,-117.2740]},
{n:'The Warehouse',p:'Barrio Logan · Event host',s:'Gathered 7 times',r:5,ll:[32.6977,-117.1460]},
{n:'Garden House',p:'South Park · Non-profit',s:'Gathered 6 times',r:6,ll:[32.7240,-117.1290]}];
function svg(k){return '<svg aria-hidden="true"><use href="'+IC+k+'"/></svg>'}
function mount(el){if(el.__fq||!window.L)return;el.__fq=1;var mode=el.dataset.fqmap||'people',sp=mode==='spaces',data=sp?SP:EV,nl=el.dataset.list==='off',PL=nl||innerWidth<=900?30:380;
el.classList.add('fqm');el.innerHTML='<div class="fqm-map"></div><aside class="fqm-list"><div class="fqm-top"><span class="fqm-live"><i></i>'+(sp?'Ranked by gathering':'Live this week')+'</span><b>'+(sp?'Spaces near you in San Diego':'This week in San Diego')+'</b>'+(sp?'':'<div class="fqm-chips" role="group" aria-label="Filter"><button aria-pressed="true" data-f="all">All</button><button aria-pressed="false" data-f="circle">Circles</button><button aria-pressed="false" data-f="event">Events</button><button aria-pressed="false" data-f="wk">This weekend</button></div>')+'</div><div class="fqm-items"></div></aside>';
var map=L.map(el.querySelector('.fqm-map'),{scrollWheelZoom:false,zoomControl:false,attributionControl:true}).setView([32.755,-117.20],12);
L.control.zoom({position:'topright'}).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:18}).addTo(map);
el.addEventListener('mouseenter',function(){map.scrollWheelZoom.enable()});el.addEventListener('mouseleave',function(){map.scrollWheelZoom.disable()});
var items=el.querySelector('.fqm-items'),marks=[];
data.forEach(function(d,i){
 var lbl=sp?('#'+d.r):d.t.split(' ')[1],cls='fqm-pin'+(sp?' sp':'')+(d.you?' you':'')+(d.k==='event'?' ev':'');
 var icon=L.divIcon({className:'',html:'<span class="'+cls+'"><i>'+svg(sp?'space':d.k)+'</i><b>'+lbl+'</b></span>',iconSize:null,iconAnchor:[18,18]});
 var m=L.marker(d.ll,{icon:icon,riseOnHover:true}).addTo(map);
 var href=sp?'Spaces.html':'Join.html#people';
 m.bindPopup('<div class="fqm-pop"><span class="k">'+(sp?(d.you?'Your Space · #'+d.r:'#'+d.r+' near you'):d.t)+'</span><b>'+d.n+'</b><span>'+d.p+'</span><em>'+(sp?d.s:d.tag)+'</em><a class="btn fq-iri-btn" href="'+href+'">'+(sp?(d.you?'Open your Space':'See how standing works'):'RSVP')+'</a></div>',{closeButton:false,offset:[0,-8],className:'fqm-popwrap'});
 var it=document.createElement('button');it.className='fqm-it'+(d.you?' you':'');it.type='button';
 it.innerHTML='<span class="ic">'+svg(sp?'space':d.k)+'</span><span class="tx"><small>'+(sp?'#'+d.r+(d.you?' · You':''):d.t)+'</small><b>'+d.n+'</b><em>'+d.p+'</em></span><i>'+(sp?d.s.replace('Gathered ','').replace(' this month',''):d.tag)+'</i>';
 items.appendChild(it);
 function hot(on){var p=m.getElement();p&&p.firstChild.classList.toggle('hot',on);it.classList.toggle('hot',on)}
 it.addEventListener('mouseenter',function(){hot(true)});it.addEventListener('mouseleave',function(){hot(false)});
 it.addEventListener('click',function(){map.flyTo(d.ll,14,{duration:.8});setTimeout(function(){m.openPopup()},700)});
 m.on('mouseover',function(){hot(true)});m.on('mouseout',function(){hot(false)});
 m.on('popupopen',function(){items.querySelectorAll('.fqm-it').forEach(function(x){x.classList.remove('on')});it.classList.add('on');items.scrollTo({top:it.offsetTop-items.offsetTop-8,behavior:'smooth'})});
 marks.push({d:d,m:m,it:it})});
el.querySelectorAll('[data-f]').forEach(function(b){b.onclick=function(){var f=b.dataset.f;el.querySelectorAll('[data-f]').forEach(function(x){x.setAttribute('aria-pressed',String(x===b))});var g=[];
 marks.forEach(function(o){var show=f==='all'||(f==='wk'?/Sat|Sun/.test(o.d.d):o.d.k===f);o.it.hidden=!show;if(show){o.m.addTo(map);g.push(o.d.ll)}else map.removeLayer(o.m)});
 if(g.length)map.flyToBounds(g,{padding:[60,60],maxZoom:13,duration:.8,paddingTopLeft:[PL,40]})}});
setTimeout(function(){map.invalidateSize();map.fitBounds(data.map(function(d){return d.ll}),{paddingTopLeft:[PL,40],paddingBottomRight:[40,40]})},60)}
function all(){document.querySelectorAll('[data-fqmap]').forEach(function(el){
 if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){if(es[0].isIntersecting){mount(el);io.disconnect()}},{rootMargin:'300px'});io.observe(el)}else mount(el)})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',all);else all();
window.FQMap={mount:mount};
})();
