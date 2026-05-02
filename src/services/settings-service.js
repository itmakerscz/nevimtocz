import { logger } from '../utils/logger.js';

/**
 * SettingsService handles application settings persistence and
 * UI-related side effects like theme and accessibility adjustments.
 */
export class SettingsService {
    constructor(storageKeys) {
        this.storageKeys = storageKeys;
    }

    /**
     * Loads settings from localStorage and applies them to the DOM.
     * @param {Object} currentSettings - The default settings.
     * @returns {Object} The merged settings object.
     */
    init(currentSettings) {
        const savedSettings = localStorage.getItem(this.storageKeys.SETTINGS);
        let settings = { ...currentSettings };
        if (savedSettings) {
            try {
                settings = { ...settings, ...JSON.parse(savedSettings) };
            } catch (e) {
                logger.error("Failed to parse saved settings:", e);
            }
        }
        this.applyTheme(settings.theme);
        this.applyDyslexicMode(settings.isDyslexic);
        return settings;
    }

    /**
     * Applies the theme to the document element.
     * @param {string} val - Theme value ('light', 'dark', 'system', 'high-contrast').
     */
    applyTheme(val) {
        const root = document.documentElement;
        let effectiveTheme = val;

        if (val === 'system') {
            const prefersHC = window.matchMedia('(prefers-contrast: more)').matches || 
                             window.matchMedia('(prefers-contrast: custom)').matches;
            
            if (prefersHC) effectiveTheme = 'high-contrast';
            root.style.colorScheme = 'light dark';
        } else {
            root.style.colorScheme = val;
        }
        root.setAttribute('data-theme', effectiveTheme);
    }

    /**
     * Applies dyslexic mode to the document element.
     */
    applyDyslexicMode(val) {
        const root = document.documentElement;
        root.setAttribute('data-dyslexic', val ? 'true' : 'false');
    }
}