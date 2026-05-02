import { logger } from '../utils/logger.js';

/**
 * PwaService handles Service Worker registration, PWA installation lifecycle,
 * and application updates.
 */
export class PwaService {
    constructor(app) {
        this.app = app;
    }

    /**
     * Registers the Service Worker and sets up communication listeners.
     */
    async register() {
        if (!('serviceWorker' in navigator)) return;

        try {
            const reg = await navigator.serviceWorker.register('./sw.js');
            logger.info('Service Worker registered', { scope: reg.scope });

            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data === 'reload-app') window.location.reload();
            });

            await this._registerPeriodicSync(reg);
        } catch (err) {
            logger.error('Service Worker registration failed', err);
        }
    }

    /**
     * Detects if the app is currently running in standalone (installed) mode.
     */
    detectStatus() {
        return window.matchMedia('(display-mode: standalone)').matches 
            || window.navigator.standalone === true 
            || document.referrer.includes('android-keystore');
    }

    /**
     * Triggers the PWA installation prompt.
     */
    async install(deferredPrompt) {
        if (!deferredPrompt) return null;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        logger.info('User choice for PWA install:', outcome);
        return null; // Used to clear the reference in app state
    }

    /**
     * Forces a cache clear and app reload.
     */
    async clearCacheAndUpdate() {
        this.app.addToast('Čištění mezipaměti a aktualizace...', 'info');
        if (!navigator.serviceWorker.controller) {
            const names = await caches.keys();
            await Promise.all(names.map(name => caches.delete(name)));
            window.location.reload();
            return;
        }
        navigator.serviceWorker.controller.postMessage('clear-cache-and-update');
        setTimeout(() => window.location.reload(), 2000);
    }

    async _registerPeriodicSync(reg) {
        if (!('periodicSync' in reg)) return;
        try {
            const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
            if (status.state === 'granted') {
                await reg.periodicSync.register('update-model-configs', { minInterval: 24 * 60 * 60 * 1000 });
            }
        } catch (err) {
            logger.debug('Periodic Sync registration deferred:', err.name);
        }
    }
}