const CACHE='motoratlas-shell-v4';
const CORE=['/','/manifest.webmanifest','/motoratlas-icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==self.location.origin)return;
  if(req.mode==='navigate'){event.respondWith(fetch(req).catch(()=>caches.match('/')));return;}
  if(!/\.(?:js|css|svg|webp|woff2?|webmanifest)$/i.test(url.pathname))return;
  event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(response=>{
    if(response.ok)caches.open(CACHE).then(cache=>cache.put(req,response.clone()));
    return response;
  })));
});
