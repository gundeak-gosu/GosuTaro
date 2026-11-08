// 오프라인 캐시: 재방문 시 네트워크 없이 즉시 로딩 (서버 트래픽 = 0에 가깝게)
const V = "ashk-v18";
const FILES = ["./", "index.html", "config.js", "css/style.css", "manifest.webmanifest", "icon.svg",
  "js/main.js", "js/ui.js", "js/systems.js", "js/data.js", "js/world.js", "js/render.js",
  "js/minigames.js", "js/olympics.js", "js/shop.js", "js/storage.js", "js/rng.js", "js/r3d.js", "js/net.js", "js/icons.js", "js/earth.js", "js/matchmaking.js", "js/sync.js", "js/sfx.js", "js/tutorial.js", "js/bgm.js", "js/regions.js", "js/earth-data.js", "vendor/three.module.min.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k))))); self.clients.claim(); });
// 네트워크 우선(업데이트 즉시 반영), 실패 시 캐시
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).pathname.includes("/.netlify/")) return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(V).then((ca) => ca.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
