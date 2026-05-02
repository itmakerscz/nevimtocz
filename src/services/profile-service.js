import { logger } from '../utils/logger.js';

/**
 * ProfileService handles the logic for managing context profiles,
 * including creation and merging of knowledge bases.
 */
export class ProfileService {
    /**
     * Creates a new profile object with default values.
     */
    create(name) {
        return { id: crypto.randomUUID(), name, knowledgeBase: [], systemPrompt: '', tags: [], temperature: 0.7, top_p: 0.95, semanticThreshold: 0.5 };
    }

    /**
     * Merges knowledge from a source profile into a target profile, deduplicating by content.
     */
    merge(target, source) {
        const sourceKB = JSON.parse(JSON.stringify(source.knowledgeBase));
        const combined = [...target.knowledgeBase, ...sourceKB];
        const seen = new Set();
        return combined.filter(k => {
            const isDup = seen.has(k.content);
            seen.add(k.content);
            return !isDup;
        });
    }

    /**
     * Initializes profiles by loading from IndexedDB or migrating from localStorage.
     * @param {Object} storageService - The storage service instance.
     * @param {Object} storageKeys - Configuration keys for storage.
     * @returns {Promise<Object>} Object containing profiles and the activeProfileId.
     */
    async initProfiles(storageService, storageKeys) {
        let profiles = null;
        try {
            profiles = await storageService.getProfiles();
        } catch (err) {
            logger.error('Failed to load profiles from DB', err);
        }

        if (!profiles) {
            profiles = await this.migrateStorage(
                storageKeys.PROFILES,
                [],
                storageService,
                (p) => {
                    p.forEach(i => {
                        if (i.systemPrompt === undefined) i.systemPrompt = '';
                        if (i.tags === undefined) i.tags = [];
                        if (i.temperature === undefined) i.temperature = 0.7;
                        if (i.top_p === undefined) i.top_p = 0.95;
                        if (i.semanticThreshold === undefined) i.semanticThreshold = 0.5;
                    });
                    return p;
                }
            );
        }

        const savedActiveId = localStorage.getItem(storageKeys.ACTIVE_PROFILE);
        const activeProfileId = savedActiveId ? JSON.parse(savedActiveId) : (profiles[0]?.id || null);

        return { profiles, activeProfileId };
    }

    /**
     * Internal migration helper.
     */
    async migrateStorage(key, defaultVal, storageService, transformFn = null) {
        const saved = localStorage.getItem(key);
        if (!saved) return defaultVal;
        try {
            let data = JSON.parse(saved);
            if (transformFn) data = transformFn(data);
            await storageService.saveProfiles(data);
            localStorage.removeItem(key);
            return data;
        } catch (e) {
            logger.error(`Migration failed for ${key}`, e);
            return defaultVal;
        }
    }

    /**
     * Validates and prepares an imported profile object.
     * @param {Object} imported - The parsed JSON data.
     * @returns {Object} The processed profile ready for application.
     */
    validateAndPrepareImport(imported) {
        if (!imported.name || !Array.isArray(imported.knowledgeBase)) {
            throw new Error("Soubor nemá platný formát profilu.");
        }
        
        const profile = JSON.parse(JSON.stringify(imported));
        profile.id = crypto.randomUUID(); // Fresh ID to avoid collisions
        if (profile.systemPrompt === undefined) profile.systemPrompt = '';
        if (profile.tags === undefined) profile.tags = [];
        
        return profile;
    }

    /**
     * Extracts all unique tags from a collection of profiles.
     * @param {Array} profiles - The list of context profiles.
     * @returns {Array} Sorted array of unique tags.
     */
    getAllTags(profiles) {
        const tags = new Set();
        profiles.forEach(p => {
            if (p.tags) p.tags.forEach(t => tags.add(t));
        });
        return Array.from(tags).sort();
    }

    /**
     * Adds a tag to a profile, ensuring uniqueness.
     */
    addTag(profile, tag) {
        if (!tag) return;
        if (!profile.tags) profile.tags = [];
        if (!profile.tags.includes(tag)) profile.tags.push(tag);
    }

    /**
     * Removes a tag from a profile.
     */
    removeTag(profile, tag) {
        if (!profile.tags) return;
        profile.tags = profile.tags.filter(t => t !== tag);
    }
}