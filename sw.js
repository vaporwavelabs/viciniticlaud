const SHELL='viciniti-shell-v2', ASSETS='viciniti-assets-v1';
const FILES=['./','./index.html','./app.css','./app.js','./skins.js','./offline-map.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(SHELL).then(c=>c.addAll(FILES).catch(()=>{})).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('viciniti-')&&![SHELL,ASSETS].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
 if(u.hostname.endsWith('supabase.co'))return; // never cache API
 if(u.origin===location.origin&&u.pathname.includes('/speedometer/'))return; // speedometer has its own worker
 const lib=['unpkg.com','cdn.jsdelivr.net','cdnjs.cloudflare.com','protomaps.github.io','fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname);
 if(lib){e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok||res.type==='opaque'){const c=res.clone();caches.open(ASSETS).then(x=>x.put(r,c));}return res;})));return;}
 if(u.origin===location.origin){e.respondWith(fetch(r).then(res=>{if(res.ok){const c=res.clone();caches.open(SHELL).then(x=>x.put(r,c));}return res;}).catch(()=>caches.match(r,{ignoreSearch:true}).then(h=>h||caches.match('./index.html'))));}
});
