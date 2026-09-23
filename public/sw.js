const CACHE='motoratlas-shell-v6';
const ROOT=self.registration.scope;
const CORE=[
  ROOT,
  new URL('manifest.webmanifest',ROOT).href,
  new URL('motoratlas-icon.svg',ROOT).href
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(CORE))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;

  if(req.mode==='navigate'){
    event.respondWith(fetch(req).catch(()=>caches.match(ROOT)));
    return;
  }

  if(!/\.(?:js|css|svg|webp|woff2?|webmanifest)$/i.test(url.pathname))return;

  event.respondWith(
    caches.match(req).then(hit=>hit||fetch(req).then(response=>{
      if(response.ok)caches.open(CACHE).then(cache=>cache.put(req,response.clone()));
      return response;
    }))
  );
});
