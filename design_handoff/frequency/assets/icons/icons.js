/* Inlines the Frequency icon sprite so <use href="…frequency-icons.svg#id"> works everywhere (captures, exports, file://). */
(function(){var me=document.currentScript;var src=me&&me.src.replace(/icons\.js(\?.*)?$/,'frequency-icons.svg');if(!src)return;
fetch(src).then(function(r){return r.text()}).then(function(t){var d=document.createElement('div');d.style.display='none';d.innerHTML=t;document.body.insertBefore(d,document.body.firstChild);
document.querySelectorAll('use').forEach(function(u){var h=u.getAttribute('href')||'';var i=h.indexOf('frequency-icons.svg#');if(i>-1)u.setAttribute('href',h.slice(i+19));});}).catch(function(){});})();
