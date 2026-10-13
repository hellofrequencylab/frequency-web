/* Frequency Members shell: header, footer, toasts and small behaviours. Page sets <body data-area="home|community|quest|you">. */
(function(){
var b=document.body,A=b.dataset.area||'';
var NAV=[['home','Home','Members.dc.html','#breath'],['community','Community','Circles.html','#circle'],['quest','The Quest','Journey.html','#standing'],['you','You','Profile.html','#gem']];
var h=document.createElement('header');h.className='ap-hdr';
h.innerHTML='<a href="Members.dc.html" class="ap-logo fq-logo-flow" aria-label="Frequency home"></a>'+
'<nav class="ap-nav">'+NAV.map(function(n){return '<a href="'+n[2]+'"'+(n[0]===A?' class="on" aria-current="page"':'')+'><svg class="fq-icon"><use href="'+n[3]+'"></use></svg><span>'+n[1]+'</span></a>'}).join('')+'</nav>'+
'<span class="ap-sp"></span>'+
'<a href="Search.html" class="ap-search"><svg class="fq-icon" style="width:17px;height:17px;color:var(--text-muted)"><use href="#search"></use></svg><span>Search</span><kbd>⌘K</kbd></a>'+
'<a href="Messages.html" class="ap-ic" title="Messages"><svg class="fq-icon"><use href="#message"></use></svg><i></i></a>'+
'<a href="Members.dc.html" class="ap-ic" title="Notifications"><svg class="fq-icon"><use href="#nudge"></use></svg><i></i></a>'+
'<a href="Mindless.html" class="btn pa ap-zap" style="height:44px;padding:0 18px 0 14px"><svg class="fq-icon"><use href="#zap"></use></svg>Zap</a>'+
'<a href="Profile.html" class="ap-me" title="Daniel Tyack"></a>';
b.insertBefore(h,b.firstChild);
var w=document.createElement('div');w.className='fq-wash';w.setAttribute('aria-hidden','true');b.insertBefore(w,b.firstChild);
var f=document.createElement('footer');f.className='ap-foot';
f.innerHTML='<span>Frequency · Community Collective</span><span class="ap-sp"></span><a href="Help.html">Help</a><a href="Site Map.html">Site map</a><a href="Settings.html">Settings</a>';
b.appendChild(f);
var t=document.createElement('div');t.className='ap-toast';t.setAttribute('role','status');b.appendChild(t);var tt;
window.fqToast=function(m){t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(function(){t.classList.remove('on')},2800)};
document.addEventListener('click',function(e){
 var el=e.target.closest('[data-toast]');if(el)fqToast(el.dataset.toast);
 var g=e.target.closest('[data-group] > *');if(g&&!g.hasAttribute('data-noselect')){[].forEach.call(g.parentNode.children,function(c){c.classList.toggle('on',c===g)});var p=g.parentNode.dataset.group;if(p){document.querySelectorAll('[data-pane="'+p+'"]').forEach(function(x){x.classList.toggle('hide',x.dataset.key!==g.dataset.key)})}}
 var s=e.target.closest('.sw');if(s){s.classList.toggle('on');s.setAttribute('aria-checked',s.classList.contains('on'))}
 var sw=e.target.closest('[data-swap]');if(sw){e.preventDefault();var a=sw.dataset.swap.split('|');var on=sw.classList.toggle('on');sw.textContent=on?a[1]:a[0];if(sw.dataset.cls)sw.classList.toggle(sw.dataset.cls,on)}
 var rm=e.target.closest('[data-remove]');if(rm){var r=rm.closest(rm.dataset.remove);if(r){r.style.transition='opacity .26s';r.style.opacity=0;setTimeout(function(){r.remove()},260)}}
});
})();
