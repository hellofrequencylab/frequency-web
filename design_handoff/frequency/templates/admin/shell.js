/* Frequency Admin shell. Page sets <body data-page="overview|editor|contacts|memberships|standing|moderation|economy" data-title="…">. Content goes in <main class="ad-main">. */
(function(){
var b=document.body,A=b.dataset.page,T=b.dataset.title||'',me=document.currentScript;
var N=[['overview','Overview','Overview.html','#space'],['editor','Page editor','Page Editor.html','#page'],['contacts','Contacts','Contacts.html','#contacts'],['memberships','Memberships','Memberships.html','#membership'],['standing','Standing','Standing.html','#standing'],['moderation','Moderation','Moderation.html','#tip',3],['economy','Economy','Economy.html','#zap']];
var main=document.querySelector('.ad-main');
var shell=document.createElement('div');shell.className='ad';
shell.innerHTML='<aside class="ad-side"><a href="Overview.html" class="fq-logo-flow" aria-label="Frequency admin"></a>'+
'<div class="ad-space"><span class="av" style="background-image:url(\'../../assets/photos/gathering-06.jpg\')"></span><span class="grow"><span class="t1" style="display:block">Royal Temple</span><span class="t2">Space · Owner</span></span></div>'+
'<nav class="ad-nav">'+N.map(function(n){return '<a href="'+n[2]+'"'+(n[0]===A?' class="on" aria-current="page"':'')+'><svg class="fq-icon"><use href="'+n[3]+'"></use></svg>'+n[1]+(n[4]?'<b>'+n[4]+'</b>':'')+'</a>'}).join('')+'</nav>'+
'<span style="flex:1"></span><nav class="ad-nav"><a href="../members/Members.dc.html"><svg class="fq-icon"><use href="#arrow"></use></svg>Back to Frequency</a><a href="../members/Help.html"><svg class="fq-icon"><use href="#tip"></use></svg>Help</a></nav></aside>'+
'<div><header class="ad-top"><span class="crumb">Royal Temple / <b>'+T+'</b></span><span style="flex:1"></span><a href="Contacts.html" class="ap-search" style="flex:0 1 260px"><svg class="fq-icon" style="width:17px;height:17px"><use href="#search"></use></svg><span>Search people, events</span></a><a class="ap-ic" href="Moderation.html" title="Alerts"><svg class="fq-icon"><use href="#nudge"></use></svg><i></i></a><a class="ap-me" href="../members/Profile.html" title="Daniel Tyack"></a></header></div>';
var w=document.createElement('div');w.className='fq-wash';w.setAttribute('aria-hidden','true');
b.insertBefore(shell,b.firstChild);b.insertBefore(w,b.firstChild);shell.lastChild.appendChild(main);
if(me){var am=document.createElement('script');am.src=me.src.replace(/shell\.js(\?.*)?$/,'../members/app/ambient.js');b.appendChild(am)}
var t=document.createElement('div');t.className='ap-toast';t.setAttribute('role','status');b.appendChild(t);var tt;
window.fqToast=function(m){t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(function(){t.classList.remove('on')},2800)};
document.addEventListener('click',function(e){
 var el=e.target.closest('[data-toast]');if(el)fqToast(el.dataset.toast);
 var g=e.target.closest('[data-group] > *');if(g){[].forEach.call(g.parentNode.children,function(c){c.classList.toggle('on',c===g)});var p=g.parentNode.dataset.group;if(p){document.querySelectorAll('[data-pane="'+p+'"]').forEach(function(x){x.classList.toggle('hide',x.dataset.key!==g.dataset.key)})}}
 var s=e.target.closest('.sw');if(s){s.classList.toggle('on');s.setAttribute('aria-checked',s.classList.contains('on'))}
 var sw=e.target.closest('[data-swap]');if(sw){e.preventDefault();var a=sw.dataset.swap.split('|');var on=sw.classList.toggle('on');var ic=sw.querySelector('svg');sw.textContent=on?a[1]:a[0];if(ic)sw.insertBefore(ic,sw.firstChild);if(sw.dataset.cls)sw.classList.toggle(sw.dataset.cls,on)}
 var rm=e.target.closest('[data-remove]');if(rm){var r=rm.closest(rm.dataset.remove);if(r){r.style.transition='opacity .26s';r.style.opacity=0;setTimeout(function(){r.remove()},260)}}
});
})();
