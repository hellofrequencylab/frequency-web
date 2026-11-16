// THE SIDE BEFORE THE FIRST PAINT (SCAN-895), restated. A LEAF: no imports.
//
// THE CANON IS THE LITERAL in components/frequency/site/shell/site-root.tsx: the SCAN-895 verify
// probe reads it there, so it stays there. This is the same text, for the proxy: the nonce-based
// Content-Security-Policy (lib/security/csp-nonce.ts, SCAN-1243) allows that inline script by the
// SHA-256 of its exact text. lib/security/csp-nonce.test.ts reads site-root.tsx and fails if the two
// differ by one byte. Change the script in the component, then paste it here.
export const SIDE_PREPAINT_SCRIPT =
  "(function(){try{var r=document.currentScript.parentElement;if(r.hasAttribute('data-lock'))return;var h=location.hash,s=h==='#people'?'p':(h==='#spaces'||h==='#experiences')?'e':localStorage.getItem('fq-home-side');if(s==='p'||s==='e'){r.setAttribute('data-side',s);}}catch(e){}})()"
