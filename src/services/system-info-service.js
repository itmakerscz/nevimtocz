import { logger } from '../utils/logger.js';

/**
 * SystemInfoService handles hardware detection and diagnostic reporting.
 */
export class SystemInfoService {
    getStaticHealth() {
        return {
            webGpu: !!navigator.gpu,
            sab: typeof SharedArrayBuffer !== 'undefined',
            wasm: typeof WebAssembly !== 'undefined'
        };
    }

    async runFullDiagnostics(appUsage) {
        let storage = null;
        if (navigator.storage && navigator.storage.estimate) {
            storage = await navigator.storage.estimate();
        }

        return {
            webGpu: !!navigator.gpu,
            sab: typeof SharedArrayBuffer !== 'undefined',
            wasm: typeof WebAssembly !== 'undefined',
            quota: storage ? (storage.quota / (1024 * 1024)).toFixed(2) + ' MB' : 'Neznámá',
            usage: storage ? (storage.usage / (1024 * 1024)).toFixed(2) + ' MB' : 'Neznámá',
            appUsage: appUsage,
            ua: navigator.userAgent
        };
    }

    async nuclearReset(storageService) {
        localStorage.clear();
        await storageService.deleteDatabase();
        setTimeout(() => location.reload(), 500);
    }
}