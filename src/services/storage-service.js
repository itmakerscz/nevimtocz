import { logger } from '../utils/logger.js';
/**
 * StorageService encapsulates all IndexedDB operations for the application.
 * Handles lifecycle, data pruning, and provides high-level access to stores.
 */
export class StorageService {
    constructor(dbName = 'NevimtoSnapshots', version = 6, storageKeys) {
        this.dbName = dbName;
        this.version = version;
        this._db = null;
        this._dbPromise = null;
        this.storageKeys = storageKeys;
    }

    async _getDB() {
        if (this._db) return this._db;
        if (this._dbPromise) return this._dbPromise;

        this._dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                ['snapshots', 'profiles', 'history', 'logs', 'history_stacks'].forEach(s => {
                    if (!db.objectStoreNames.contains(s)) {
                        const store = db.createObjectStore(s, { keyPath: s === 'snapshots' ? 'timestamp' : 'id' });
                        if (s === 'logs') {
                            store.createIndex('timestamp', 'timestamp', { unique: false });
                        }
                    }
                });
            };
            request.onsuccess = e => {
                this._db = e.target.result;
                this._dbPromise = null;
                resolve(this._db);
            };
            request.onerror = e => {
                this._dbPromise = null;
                reject(e.target.error);
            };
        });
        return this._dbPromise;
    }

    async operation(storeName, mode, operationFn) {
        const db = await this._getDB();
        const transaction = db.transaction([storeName], mode);
        const store = transaction.objectStore(storeName);

        return new Promise((resolve, reject) => {
            const request = operationFn(store);
            if (request instanceof IDBRequest) {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } else {
                transaction.oncomplete = () => resolve(request);
            }
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(new Error('Transaction aborted'));
        });
    }

    async getHistory() {
        const res = await this.operation('history', 'readonly', s => s.get('active-chat'));
        return res?.data;
    }

    async saveHistory(history) {
        return this.operation('history', 'readwrite', s => s.put({ id: 'active-chat', data: JSON.parse(JSON.stringify(history)) }));
    }

    async getProfiles() {
        const res = await this.operation('profiles', 'readonly', s => s.get('active-set'));
        return res?.data;
    }

    async saveProfiles(profiles) {
        return this.operation('profiles', 'readwrite', s => s.put({ id: 'active-set', data: JSON.parse(JSON.stringify(profiles)) }));
    }

    async getHistoryStacks() {
        const undo = await this.operation('history_stacks', 'readonly', s => s.get('undo'));
        const redo = await this.operation('history_stacks', 'readonly', s => s.get('redo'));
        return { undo: undo?.data || [], redo: redo?.data || [] };
    }

    async saveHistoryStacks(undo, redo) {
        await this.operation('history_stacks', 'readwrite', s => s.put({ id: 'undo', data: JSON.parse(JSON.stringify(undo)) }));
        return this.operation('history_stacks', 'readwrite', s => s.put({ id: 'redo', data: JSON.parse(JSON.stringify(redo)) }));
    }

    /**
     * Removes the undo and redo entries from the database.
     */
    async clearHistoryStacks() {
        await this.operation('history_stacks', 'readwrite', s => s.delete('undo'));
        return this.operation('history_stacks', 'readwrite', s => s.delete('redo'));
    }

    async getLogs() {
        return this.operation('logs', 'readonly', s => s.index('timestamp').getAll());
    }

    /**
     * Initializes logs by fetching from DB and slicing to display limit.
     */
    async initLogs(limit = 100) {
        try {
            const result = await this.getLogs();
            return result ? result.slice(-limit) : [];
        } catch (err) {
            logger.error('Failed to load logs from DB', err);
            return [];
        }
    }

    /**
     * Persists a log entry with standard error handling.
     */
    async persistLog(log) {
        return this.saveLog(log).catch(err => console.error('Log persistence failed:', err));
    }

    async saveLog(log) {
        return this.operation('logs', 'readwrite', s => s.add(JSON.parse(JSON.stringify(log))));
    }

    async getSnapshots() {
        return this.operation('snapshots', 'readonly', s => s.getAll());
    }

    async saveSnapshot(snapshot) {
        return this.operation('snapshots', 'readwrite', s => s.add(JSON.parse(JSON.stringify(snapshot))));
    }

    async pruneSnapshots(maxCount) {
        return this.operation('snapshots', 'readwrite', async (store) => {
            const keys = await new Promise(resolve => {
                const req = store.getAllKeys(); req.onsuccess = () => resolve(req.result);
            });
            if (keys.length > maxCount) {
                const toDelete = keys.sort((a, b) => new Date(b) - new Date(a)).slice(maxCount);
                toDelete.forEach(key => store.delete(key));
            }
        });
    }

    async pruneLogs(maxCount) {
        return this.operation('logs', 'readwrite', async (store) => {
            const count = await new Promise(resolve => {
                const req = store.count(); req.onsuccess = () => resolve(req.result);
            });
            if (count > maxCount) {
                const toDelete = count - maxCount;
                let deleted = 0;
                await new Promise((resolve, reject) => {
                    const cursorReq = store.index('timestamp').openCursor();
                    cursorReq.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (cursor && deleted < toDelete) {
                            cursor.delete();
                            deleted++;
                            cursor.continue();
                        } else { resolve(); }
                    };
                    cursorReq.onerror = () => reject(cursorReq.error);
                });
            }
        });
    }

    /**
     * Optimizes the database by pruning old snapshots and logs.
     */
    async vacuum() {
        await this.pruneSnapshots(3);
        await this.pruneLogs(500);
    }

    async deleteDatabase() {
        if (this._db) {
            this._db.close();
            this._db = null;
        }
        return indexedDB.deleteDatabase(this.dbName);
    }

    /**
     * Migrates data from localStorage to IndexedDB for a given key.
     * @param {string} key - The localStorage key to migrate.
     * @param {any} defaultVal - Default value if no data is found or migration fails.
     * @param {Function} [transformFn=null] - Optional function to transform data before saving.
     * @returns {Promise<any>} The migrated data or default value.
     */
    async migrateStorage(key, defaultVal, transformFn = null) {
        const saved = localStorage.getItem(key);
        if (!saved) return defaultVal;
        try {
            let data = JSON.parse(saved);
            if (transformFn) data = transformFn(data);
            
            // Use internal save methods to persist to IndexedDB
            if (key === this.storageKeys.HISTORY) await this.saveHistory(data);
            else if (key === this.storageKeys.PROFILES) await this.saveProfiles(data);
            localStorage.removeItem(key); // Remove from localStorage after successful migration
            return data;
        } catch (e) {
            logger.error(`Migration failed for ${key}`, e);
            return defaultVal;
        }
    }

    /**
     * Checks if localStorage is accessible in the current environment.
     * @returns {boolean}
     */
    checkAccessibility() {
        try {
            const testKey = '__integrity_test__';
            localStorage.setItem(testKey, '1');
            localStorage.removeItem(testKey);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Verifies the integrity of data stored in localStorage against provided validators.
     * @param {Object} validators - Map of keys to {label, test} objects.
     * @returns {string[]} List of labels for corrupted items.
     */
    verifyIntegrity(validators) {
        if (!this.checkAccessibility()) return [];

        return Object.entries(validators).reduce((acc, [key, cfg]) => {
            const val = localStorage.getItem(key);
            if (val) {
                try {
                    if (!cfg.test(JSON.parse(val))) acc.push(cfg.label);
                } catch {
                    acc.push(cfg.label);
                }
            }
            return acc;
        }, []);
    }

    /**
     * Calculates the storage usage of the application.
     * @returns {string} Formatted string of storage usage.
     */
    calculateUsage() {
        try {
            let total = 0;
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith('nevimto-')) {
                    total += (key.length + (localStorage.getItem(key) || '').length) * 2;
                }
            }
            if (total === 0) return "0 B";
            const k = 1024, sizes = ['B', 'KB', 'MB'];
            const i = Math.floor(Math.log(total) / Math.log(k));
            return `${(total / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
        } catch (e) {
            return "N/A";
        }
    }

    /**
     * Returns a localized error message for database operations.
     * @param {string} storeName 
     * @param {string} mode 
     * @returns {string}
     */
    getErrorMessage(storeName, mode) {
        const messages = {
            history: {
                readwrite: 'Nepodařilo se uložit historii chatu',
                readonly: 'Nepodařilo se načíst historii chatu'
            },
            history_stacks: {
                readwrite: 'Nepodařilo se uložit zásobník změn',
                readonly: 'Nepodařilo se načíst zásobník změn'
            },
            profiles: {
                readwrite: 'Chyba při ukládání profilů',
                readonly: 'Chyba při načítání profilů'
            },
            snapshots: {
                readwrite: 'Chyba při zápisu do databáze snímků',
                readonly: 'Nepodařilo se načíst seznam snímků'
            },
            logs: {
                readwrite: 'Nepodařilo se uložit systémový log',
                readonly: 'Nepodařilo se načíst systémové logy'
            }
        };
        return messages[storeName]?.[mode] || 'Chyba databázové operace';
    }
}