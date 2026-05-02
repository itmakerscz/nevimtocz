const APP_VERSION = '1.0.4'; // Upgraded Transformers.js to v4.2.0
const CACHE_NAME = `nevimto-core-v${APP_VERSION}`;
const MODEL_CACHE_NAME = 'nevimto-models-v1'; // Persistent cache for large AI assets
const STATIC_ASSETS = [
    './',
    './index.html',
    './assets/css/root.css',
    './assets/css/main.css',
    './assets/css/animations.css',
    './assets/css/theme.css',
    './assets/css/ui.css',
    './src/app.js',
    './src/llm.js',
    './src/services/message-service.js',
    './src/utils/logger.js',
    './src/views/LandingView.js',
    './src/views/ChatView.js',
    './src/views/SettingsView.js',
    './src/views/KbView.js',
    './src/views/HistoryView.js',
    './src/views/SystemModals.js',
    /* Local Fonts */
    './assets/fonts/opendyslexic-regular-webfont.woff2',
    './assets/fonts/opendyslexic-bold-webfont.woff2',
    './assets/fonts/opendyslexic-italic-webfont.woff2'
];

// Install Event: Pre-cache core UI assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Use map to catch individual failed requests so the whole SW doesn't fail
            return Promise.allSettled(
                STATIC_ASSETS.map(url => 
                    cache.add(url).catch(err => {
                        console.error(`[SW] Failed to cache: ${url}`, err);
                        return null; 
                    })
                )
            );
        })
    );
    self.skipWaiting();
});

// Activate Event: Cleanup old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    // Only delete old app versions, preserve the model cache
                    if (cache !== CACHE_NAME && cache !== MODEL_CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch Event: Strategy management
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 0. Optimized Handling for Large AI Models and Weight Files
    if (url.hostname.includes('huggingface.co') || url.hostname.includes('mlc.ai')) {
        // Prioritize MODEL_CACHE_NAME for all shards resolved in getModelUrls.
        // This includes WASM, binary weights, and essential JSON metadata.
        const isModelShard = url.pathname.endsWith('.wasm') || 
                             url.pathname.endsWith('.bin') || 
                             url.pathname.endsWith('ndarray-cache.json') || 
                             url.pathname.endsWith('mlc-chat-config.json') || 
                             url.pathname.endsWith('tokenizer.json') || 
                             url.pathname.endsWith('tokenizer_config.json');

        if (isModelShard) {
            event.respondWith(cacheFirst(event.request, MODEL_CACHE_NAME));
            return;
        }
    }

    // 1. Cache-First Strategy for Google Fonts & Material Symbols
    if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
        event.respondWith(
            caches.match(event.request).then((response) => {
                return response || fetch(event.request).then((networkResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
        );
        return;
    }

    // 2. Stale-While-Revalidate for local app assets & Navigation Fallback
    // This ensures users get a fast load but see updates on the next refresh
    const isAppAsset = STATIC_ASSETS.some(asset => {
        const normalizedAsset = asset.replace('./', '');
        if (!normalizedAsset) return url.pathname === '/' || url.pathname === '/index.html';
        return url.pathname.endsWith(normalizedAsset);
    });

    if (isAppAsset || event.request.mode === 'navigate') {
        event.respondWith(staleWhileRevalidate(event.request, event.request.mode === 'navigate'));
        return;
    }

    // 3. Default to network for everything else (like large WASM models)
    return;
});

/**
 * Cache-First strategy for large immutable assets (Models, WASM)
 */
async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) return cachedResponse;

    try {
        const networkResponse = await fetch(request);
        // Cache API strictly forbids caching partial content (status 206).
        if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        return null;
    }
}

/**
 * Stale-While-Revalidate strategy with navigation fallback
 */
async function staleWhileRevalidate(request, isNavigation = false) {
    const cachedResponse = await caches.match(request);
    const fetchPromise = fetch(request).then(async (networkResponse) => {
        // Cache API strictly forbids caching partial content (status 206).
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    });

    return cachedResponse || fetchPromise.catch(() => {
        if (isNavigation) return caches.match('./index.html');
        return null;
    });
}

// Periodic Background Sync: Update AI model configs periodically
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'update-model-configs') {
        event.waitUntil(refreshModelConfigs());
    }
});

async function refreshModelConfigs() {
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();
    
    // Filter for JSON configuration files from AI domains
    const configRequests = requests.filter(req => 
        req.url.endsWith('.json') && 
        (req.url.includes('mlc.ai') || req.url.includes('huggingface.co'))
    );

    return Promise.all(configRequests.map(req => staleWhileRevalidate(req)));
}

/**
 * Background Fetch Success: Moves downloaded files into the persistent model cache.
 */
self.addEventListener('backgroundfetchsuccess', (event) => {
    const bgFetch = event.registration;

    event.waitUntil(async function() {
        const cache = await caches.open(MODEL_CACHE_NAME);
        const records = await bgFetch.matchAll();

        const promises = records.map(async (record) => {
            const response = await record.responseReady;
            // Ensure we only cache full successful responses (status 200). 
            // Partial content (206) is unsupported by cache.put().
            if (response && response.status === 200) {
                await cache.put(record.request, response);
            }
        });

        await Promise.all(promises);

        // Update the OS-level notification (if supported by platform)
        event.updateUI({ title: `Model ${bgFetch.id} je připraven k použití offline.` });
    }());
});

/**
 * Handle failures or user cancellation of background downloads.
 */
self.addEventListener('backgroundfetchfail', (event) => {
    console.error('Background Fetch failed:', event.registration.id);
});

self.addEventListener('backgroundfetchabort', (event) => {
    console.warn('Background Fetch aborted by user:', event.registration.id);
});

self.addEventListener('backgroundfetchclick', (event) => {
    // Open the app if the user clicks the download notification
    event.waitUntil(clients.openWindow('./'));
});

/**
 * Message Listener: Handles manual cache clearing and force-update triggers
 */
self.addEventListener('message', (event) => {
    if (event.data === 'clear-cache-and-update') {
        caches.keys().then(names => Promise.all(names.map(name => caches.delete(name))))
            .then(() => {
                self.skipWaiting();
                self.clients.matchAll().then(clients => clients.forEach(c => c.postMessage('reload-app')));
            });
    }
});