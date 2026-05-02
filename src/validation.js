import { APP_CONFIG } from './config.js';

export const Schemas = {
    ChatMessage: {
        validate: (data) => {
            if (!data.role || typeof data.content !== 'string') throw new Error("Invalid Message");
            return true;
        }
    }
};

export const STORAGE_VALIDATORS = {
    [APP_CONFIG.STORAGE_KEYS.HISTORY]: { label: 'Historie', test: Array.isArray },
    [APP_CONFIG.STORAGE_KEYS.PROFILES]: { label: 'Profily', test: Array.isArray },
    [APP_CONFIG.STORAGE_KEYS.SETTINGS]: { label: 'Nastavení', test: val => typeof val === 'object' && val }
};

export function validate(schema, data) {
    try { return schema.validate(data); } catch (e) { return false; }
}