const CACHE='bomber-v3-1-1-loading-fix';
const FILES=['./','./index.html','./game.js','./phaser.min.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./assets/grass.png','./assets/dirt.png','./assets/wall.png','./assets/crate.png','./assets/bomb.png','./assets/fire.png','./assets/bombup.png','./assets/heart.png','./assets/speed.png','./assets/hero_sheet.png','./assets/slime_sheet.png','./assets/demon_sheet.png','./assets/bat_sheet.png','./assets/flame_sheet.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)))});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)))})
