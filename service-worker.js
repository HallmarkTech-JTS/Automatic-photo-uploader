// Jab bhi aap index.html me naya update karein, is Version (v1) ko v2, v3 me badal dein.
// Version change hote hi purana cache delete ho jayega aur naya code install ho jayega.
const CACHE_NAME = 'huid-camera-v5'; 

// Files jo offline hone par bhi app chalane ke liye zaroori hain
const urlsToCache = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js'
];

// 1. INSTALL EVENT (Nayi files ko download aur cache karna)
self.addEventListener('install', event => {
    // skipWaiting() app ko force karta hai ki purane version ka wait na kare, naya turant install kare
    self.skipWaiting(); 
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache and caching files...');
                return cache.addAll(urlsToCache);
            })
    );
});

// 2. ACTIVATE EVENT (Purana Cache Delete karna aur Naye update ko turant chalana)
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // Agar cache ka naam current version se match nahi karta, toh usko delete kar do
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // claim() se naya service worker turant sabhi pages ka control le leta hai
    );
});

// 3. FETCH EVENT (Network First Strategy)
// Yeh pehle internet se latest file lane ki koshish karega, 
// agar internet band hai tabhi cache wali file dikhayega. Isse update hamesha fast milta hai.
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});