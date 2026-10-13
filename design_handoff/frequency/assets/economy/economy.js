/* Frequency game values, one source. Fills any element marked with:
   data-zap="checkin"          → "⚡ 25"           (amount only: data-raw)
   data-gem="post_create"      → "💎 3"
   data-zap-x="checkin:6"      → "⚡ 150" (count × amount)
   data-econ-list="zaps|gems"  → a .list of every action and its value
   data-convert="340"          → "💎 68" (season conversion)
   Edit assets/economy/economy.json to tune; designs update everywhere. */
(function(){
var s=document.currentScript,src=s.src.replace(/economy\.js(\?.*)?$/,'economy.json');
function fill(E){
 var fmt=function(k,a,el){return el.hasAttribute('data-raw')?String(a):(k==='zaps'?'⚡ ':'💎 ')+a};
 document.querySelectorAll('[data-zap]').forEach(function(el){var r=E.zaps[el.dataset.zap];if(r)el.textContent=fmt('zaps',r.amount,el)});
 document.querySelectorAll('[data-gem]').forEach(function(el){var r=E.gems[el.dataset.gem];if(r)el.textContent=fmt('gems',r.amount,el)});
 document.querySelectorAll('[data-zap-x]').forEach(function(el){var p=el.dataset.zapX.split(':'),r=E.zaps[p[0]];if(r)el.textContent=fmt('zaps',r.amount*(+p[1]||1),el)});
 document.querySelectorAll('[data-convert]').forEach(function(el){el.textContent='💎 '+Math.floor(+el.dataset.convert/E.season.convert_zaps_per_gem)});
 document.querySelectorAll('[data-econ-list]').forEach(function(el){var k=el.dataset.econList,set=E[k];el.innerHTML=Object.keys(set).map(function(id){var r=set[id],cap=r.cap?(typeof r.cap==='number'?r.cap+' a day':r.cap):'';return '<div><span class="t1 grow">'+r.label+(cap?' <span class="t2">· '+cap+'</span>':'')+'</span><span class="t1">'+(k==='zaps'?'⚡ ':'💎 ')+r.amount+'</span></div>'}).join('')});
}
fetch(src).then(function(r){return r.json()}).then(fill).catch(function(){});
})();
