/* ============================================================
   Mes Voyages — service worker (mode hors ligne / PWA)
   Stratégie : réseau d'abord pour les fichiers de l'app (toujours
   à jour quand on est en ligne), cache en secours hors ligne.
   Les tuiles de carte sont mises en cache (cache-first, plafonné)
   pour permettre les CARTES HORS-LIGNE.
   ============================================================ */

const CACHE = "mes-voyages-v26";
const TILE_CACHE = "mes-voyages-tiles-v1";
const TILE_MAX = 2000; // nb max de tuiles gardées (évite de saturer le stockage)

const CORE = [
  "./",
  "./index.html",
  "./style.css",
  "./data.js",
  "./app.js",
  "./features.js",
  "./album.js",
  "./extras.js",
  "./family.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-maskable.svg"
];

// Hôtes de tuiles de carte (à mettre en cache pour le hors-ligne)
const TILE_HOST = /arcgisonline\.com$|cartocdn\.com$|tile\.openstreetmap\.org$/;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== TILE_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Limite la taille du cache de tuiles (supprime les plus anciennes entrées)
async function trimTiles() {
  const c = await caches.open(TILE_CACHE);
  const keys = await c.keys();
  if (keys.length > TILE_MAX) {
    for (let i = 0; i < keys.length - TILE_MAX; i++) await c.delete(keys[i]);
  }
}

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  if (url.origin === location.origin) {
    // Fichiers de l'app : réseau d'abord (fraîcheur), cache si hors ligne
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request, { ignoreSearch: true }))
    );
  } else if (TILE_HOST.test(url.host)) {
    // Tuiles de carte : cache d'abord (rapide + hors-ligne), réseau sinon, puis mise en cache plafonnée
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(TILE_CACHE).then(c => c.put(e.request, copy).then(trimTiles));
        return res;
      }).catch(() => hit))
    );
  } else {
    // Autres ressources externes (Leaflet, globe.gl, polices…) : cache d'abord
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        if (/unpkg\.com|jsdelivr\.net/.test(url.host)) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }))
    );
  }
});
