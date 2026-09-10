/* ============================================================
   RentRide — Service Worker (sw.js)
   Fungsi:
   1. Syarat wajib agar aplikasi bisa di-INSTALL (PWA)
   2. Cache offline — app tetap bisa dibuka saat sinyal hilang
   3. Ikon/logo (BOY.jpg) tersimpan di cache agar ikon app muncul
   ============================================================ */

const CACHE_NAME = 'rentride-v1';

/* File inti yang wajib tersedia offline */
const CORE_ASSETS = [
  './',
  './index.html',
  './BOY.jpg'
];

/* ============================================================
   INSTALL — simpan file inti ke cache
   ============================================================ */
self.addEventListener('install', (event) => {
  console.log('[SW] Menginstall service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Menyimpan file inti ke cache:', CORE_ASSETS);
        // addAll gagal total jika 1 file tidak ketemu — pakai Promise.allSettled-style agar tetap lanjut
        return Promise.all(
          CORE_ASSETS.map((url) =>
            cache.add(url).catch((err) => {
              console.warn('[SW] Gagal cache:', url, err.message);
            })
          )
        );
      })
      .then(() => {
        console.log('[SW] Instalasi selesai ✅');
        return self.skipWaiting(); // langsung aktif tanpa menunggu tab lama ditutup
      })
  );
});

/* ============================================================
   ACTIVATE — bersihkan cache versi lama
   ============================================================ */
self.addEventListener('activate', (event) => {
  console.log('[SW] Mengaktifkan service worker...');
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Hapus cache lama:', key);
            return caches.delete(key);
          }
        })
      ))
      .then(() => self.clients.claim()) // ambil kontrol halaman yang sudah terbuka
  );
});

/* ============================================================
   FETCH — strategi cache:
   - Firebase / API penting → SELALU network dulu (data harus live)
   - File inti & gambar → cache dulu (cepat + offline), update di belakang
   ============================================================ */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Hanya tangani GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) Firebase & CDN penting → network-first (data real-time, jangan pernah pakai cache basi)
  const isLive = url.hostname.includes('firebaseio.com')
              || url.hostname.includes('googleapis.com')
              || url.hostname.includes('firebaseinstallations.googleapis.com')
              || url.hostname.includes('firebaselogging');
  if (isLive) {
    event.respondWith(
      fetch(req).catch(() => new Response(
        JSON.stringify({ ok: false, offline: true }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // 2) Selain itu → cache-first dengan update di belakang (stale-while-revalidate)
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            try {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            } catch (_) {}
          }
          return res;
        })
        .catch(() => {
          // Offline & tidak ada cache → fallback ke index.html (SPA shell)
          return caches.match('./index.html');
        });

      // Berikan cache langsung jika ada, sambil perbarui di belakang
      return cached || fetchPromise;
    })
  );
});

/* ============================================================
   PESAN — izinkan halaman memicu update segera (opsional)
   ============================================================ */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});