// MkIco — React-owned lucide icons for the marketing pages.
// lucide.createIcons() REPLACES an <i data-lucide> node with a fresh <svg>. When
// React created that <i>, the next re-render tries to remove a node that is gone
// and the page unmounts. So we read lucide's icon DATA and render our own SVG.
function MkIco({ n, style, className }) {
  const inner = React.useMemo(() => {
    const L = window.lucide;
    if (!L || !L.icons || !n) return '';
    const key = String(n).split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
    const parts = (node) => {
      if (!node) return [];
      if (Array.isArray(node)) return typeof node[0] === 'string' ? (Array.isArray(node[2]) ? node[2] : []) : node;
      return Array.isArray(node.children) ? node.children : [];
    };
    const ser = (p) => {
      if (!p) return '';
      const tag = Array.isArray(p) ? p[0] : p.tag;
      if (typeof tag !== 'string') return '';
      const attrs = (Array.isArray(p) ? p[1] : p.attrs) || {};
      const kids = Array.isArray(p) && Array.isArray(p[2]) ? p[2] : (p.children || []);
      const a = Object.keys(attrs)
        .filter((k) => /^[a-zA-Z][a-zA-Z0-9:_-]*$/.test(k) && attrs[k] != null && typeof attrs[k] !== 'object')
        .map((k) => k + '="' + String(attrs[k]).replace(/"/g, '&quot;') + '"').join(' ');
      const open = '<' + tag + (a ? ' ' + a : '');
      return kids.length ? open + '>' + kids.map(ser).join('') + '</' + tag + '>' : open + '/>';
    };
    return parts(L.icons[key]).map(ser).join('');
  }, [n]);
  const w = (style && style.width) || 18;
  const h = (style && style.height) || w;
  return (
    <svg className={className} width={w} height={h} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, ...style, width: w, height: h }}
      dangerouslySetInnerHTML={{ __html: inner }} />
  );
}
window.MkIco = MkIco;
