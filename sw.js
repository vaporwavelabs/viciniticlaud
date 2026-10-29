const SHELL='viciniti-shell-v1', ASSETS='viciniti-assets-v1';
const FILES=['./','./index.html','./app.css','./app.js','./skins.js','./offline-map.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(SHELL).then(c=>c.addAll(FILES).catch(()=>{})).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>![SHELL,ASSETS].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET')return;
 if(u.hostname.endsWith('supabase.co'))return; // never cache API
 const lib=['unpkg.com','cdn.jsdelivr.net','cdnjs.cloudflare.com','protomaps.github.io','fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname);
 if(lib||u.origin===location.origin){e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(res=>{if(res.ok){const c=res.clone();caches.open(lib?ASSETS:SHELL).then(x=>x.put(e.request,c));}return res;}).catch(()=>hit)));}});
