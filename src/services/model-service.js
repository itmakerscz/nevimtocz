import * as webllm from "https://esm.run/@mlc-ai/web-llm@0.2.82";
import { APP_CONFIG } from '../config.js';
import { 
    warmMainModel, 
    checkStorageAvailability, 
    checkWebGPUSupport,
    isModelCached
} from '../llm.js';
import { logger } from '../utils/logger.js';

/**
 * ModelService handles the lifecycle of AI models, including warming,
 * storage checks, and background downloads.
 */
export class ModelService {
    constructor(app, limits) {
        this.app = app;
        this.limits = limits;
        this.models = APP_CONFIG.MODELS;
        this.CHAR_TO_TOKEN_RATIO = 4; 
    }

    /**
     * Warms up the embedding and main models after performing hardware and storage checks.
     */
    async warm(modelId, onProgress) {
        // 1. Parallel Pre-flight checks
        const [storage, isWebGPU] = await Promise.all([
            checkStorageAvailability(modelId),
            checkWebGPUSupport()
        ]);

        if (!storage.available) {
            if (storage.quotaBytes > 0) {
                const reqGB = (storage.requiredBytes / (1024 ** 3)).toFixed(2);
                const availGB = ((storage.quotaBytes - storage.usageBytes) / (1024 ** 3)).toFixed(2);
                throw new Error(`Nedostatek místa pro stažení modelů. Vyžadováno: ${reqGB} GB, k dispozici: ${availGB} GB.`);
            }
        }

        if (!isWebGPU) {
            logger.warn("WebGPU not detected. Falling back to WASM/CPU.");
            this.app.addToast("WebGPU není k dispozici. AI poběží v pomalejším režimu (WASM).", "warning");
        }

        // 2. Parallel warming with unified progress tracking to prevent UI flickering
        let progressState = { embed: 0, main: 0, status: 'Inicializace...' };
        const update = () => {
            const avg = Math.round((progressState.embed + progressState.main) / 2);
            onProgress(progressState.status, avg);
        };

        await Promise.all([
            this.app.embeddingService.warm((s, p) => { 
                progressState.embed = p; 
                update(); 
            }),
            warmMainModel(modelId, (s, p) => { 
                progressState.main = p; 
                progressState.status = s; 
                update(); 
            })
        ]);
    }

    /**
     * Initiates a Background Fetch for model assets via the Service Worker.
     */
    async startBackgroundFetch(modelId, estimatedSize, onProgress) {
        const reg = await navigator.serviceWorker.ready;
        
        if (!reg.backgroundFetch) {
            throw new Error('Váš prohlížeč nepodporuje stahování na pozadí.');
        }

        const urls = await this.getModelUrls(modelId);

        // Check cache to calculate total required size
        const modelCache = await caches.open('nevimto-models-v1');
        const cachedRequests = await modelCache.keys();
        const isMainCached = cachedRequests.some(req => req.url.includes(modelId));
        const isEmbedCached = cachedRequests.some(req => req.url.includes('all-MiniLM-L6-v2'));

        let totalRequired = 0;
        const finalUrls = [...urls];

        if (!isMainCached) totalRequired += estimatedSize;
        if (!isEmbedCached) {
            totalRequired += (this.limits.EMBEDDING_MODEL_SIZE || 94371840);
            finalUrls.push(...(await getEmbeddingModelUrls()));
        }

        // Pre-flight Storage Quota Check
        if (navigator.storage && navigator.storage.estimate && totalRequired > 0) {
            const { quota, usage } = await navigator.storage.estimate();
            const available = quota - usage;
            if (available < (totalRequired * 1.1)) {
                const reqGB = (totalRequired / (1024 ** 3)).toFixed(2);
                const availGB = (available / (1024 ** 3)).toFixed(2);
                throw new Error(`Nedostatek místa. Vyžadováno: ${reqGB} GB, k dispozici: ${availGB} GB.`);
            }
        }

        const bgFetch = await reg.backgroundFetch.fetch(modelId, finalUrls, {
            title: `Stahování AI modelu: ${modelId}`,
            icons: [
                { src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="%23ff0033"/></svg>', sizes: '192x192', type: 'image/svg+xml' }
            ],
            downloadTotal: totalRequired
        });

        if (onProgress) {
            bgFetch.addEventListener('progress', () => {
                if (!bgFetch.downloadTotal) return;
                const percent = Math.round(bgFetch.downloaded / bgFetch.downloadTotal * 100);
                onProgress(percent);
            });
        }

        return bgFetch;
    }

    /**
     * Calculates the total estimated size required for a given list of models,
     * accounting for whether they are already cached.
     * @param {Array} modelsToCheck - List of model objects to check.
     * @returns {Promise<number>} Total size in bytes.
     */
    async _getRequiredStorageForModels(modelsToCheck) {
        let totalRequired = 0;
        // Check for embedding model
        const embedCached = await isModelCached(APP_CONFIG.EMBEDDING_MODEL.id);
        if (!embedCached) {
            totalRequired += APP_CONFIG.EMBEDDING_MODEL.size;
        }

        // Check for main models in the provided list
        for (const model of modelsToCheck) {
            const mainCached = await isModelCached(model.id);
            if (!mainCached) totalRequired += (model.estimatedSize || 0);
        }
        return totalRequired;
    }

    /**
     * Identifies models that are not yet present in the local cache.
     */
    async getMissingModels() {
        const missing = [];
        for (const model of this.models) {
            const cached = await isModelCached(model.id);
            if (!cached) missing.push(model);
        }
        return missing;
    }

    /**
     * Triggers background downloads for all missing models.
     */
    async downloadAllMissing() {
        const missing = await this.getMissingModels();
        if (missing.length === 0) {
            this.app.addToast('Všechny modely jsou již uloženy v mezipaměti.', 'info');
            return;
        }

        // Pre-flight Storage Quota Check for all missing models
        const totalRequiredForMissing = await this._getRequiredStorageForModels(missing);
        if (totalRequiredForMissing > 0 && navigator.storage && navigator.storage.estimate) {
            const { quota, usage } = await navigator.storage.estimate();
            const available = quota - usage;
            if (available < (totalRequiredForMissing * 1.1)) { // 10% buffer
                const reqGB = (totalRequiredForMissing / (1024 ** 3)).toFixed(2);
                const availGB = (available / (1024 ** 3)).toFixed(2);
                this.app.addToast(`Nedostatek místa pro stažení všech chybějících modelů. Vyžadováno: ${reqGB} GB, k dispozici: ${availGB} GB.`, 'error', true);
                return; // Abort download
            }
        }

        this.app.addToast(`Spouštím stahování ${missing.length} modelů na pozadí...`, 'info');
        
        for (const model of missing) {
            try {
                // Check if already in active downloads to avoid overlapping requests
                const activeIds = await this.getActiveDownloadIds();
                if (!activeIds.includes(model.id)) {
                    await this.startBackgroundFetch(model.id, model.estimatedSize);
                }
            } catch (err) {
                logger.error(`Hromadné stahování selhalo pro model ${model.id}:`, err);
            }
        }
    }

    /**
     * Checks for missing models on startup and notifies the user.
     */
    async notifyMissingModelsOnStartup() {
        const missing = await this.getMissingModels();
        if (missing.length > 0) {
            const missingNames = missing.map(m => m.name).join(', ');
            this.app.addToast(`Některé modely nejsou staženy: ${missingNames}. Zvažte jejich stažení pro offline použití.`, 'info', true);
        }
    }

    /**
     * Resolves all URLs required for a specific WebLLM model.
     */
    async getModelUrls(modelId) {
        const config = webllm.prebuiltAppConfig.model_list.find(m => m.model_id === modelId);
        if (!config) return [];

        const urls = new Set();
        urls.add(config.model_lib_url);
        
        const modelBase = config.model_url.endsWith('/') ? config.model_url : config.model_url + '/';
        const cacheUrl = modelBase + 'ndarray-cache.json';
        
        urls.add(cacheUrl);
        urls.add(modelBase + 'mlc-chat-config.json');
        urls.add(modelBase + 'tokenizer.json');
        urls.add(modelBase + 'tokenizer_config.json');

        try {
            const response = await fetch(cacheUrl);
            if (response.ok) {
                const cacheData = await response.json();
                if (Array.isArray(cacheData.list)) {
                    cacheData.list.forEach(item => { if (item.name) urls.add(modelBase + item.name); });
                }
            }
        } catch (err) {
            logger.warn(`Failed to resolve all shards for ${modelId}`, err);
        }
        
        return Array.from(urls);
    }

    /**
     * Returns the list of URLs for the embedding model assets.
     */
    async getEmbeddingModelUrls() {
        const base = 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/';
        return [
            base + 'config.json',
            base + 'tokenizer.json',
            base + 'tokenizer_config.json',
            base + 'onnx/model.onnx',
            base + 'onnx/model_quantized.onnx'
        ];
    }

    async getActiveDownloadIds() {
        if (!('serviceWorker' in navigator)) return [];
        const reg = await navigator.serviceWorker.ready;
        return reg.backgroundFetch ? await reg.backgroundFetch.getIds() : [];
    }

    async abortDownload(modelId) {
        const reg = await navigator.serviceWorker.ready;
        if (reg.backgroundFetch) {
            const bgFetch = await reg.backgroundFetch.get(modelId);
            if (bgFetch) await bgFetch.abort();
        }
    }

    /**
     * Refreshes the list of active downloads in the app state.
     */
    async refreshActiveDownloads() {
        this.app.activeDownloads = await this.getActiveDownloadIds();
    }

    /**
     * Aborts a model download, refreshes the list, and notifies the user.
     * @param {string} modelId - The ID of the model to abort.
     */
    async abortModelDownload(modelId) {
        await this.abortDownload(modelId);
        await this.refreshActiveDownloads();
        this.app.addToast(`Stahování modelu ${modelId} bylo zrušeno.`, 'info');
    }

    /**
     * Starts an interval to periodically refresh the list of active background downloads.
     * Updates `app.activeDownloads`.
     * @returns {number} The interval ID.
     */
    startDownloadRefreshInterval() {
        this._downloadRefreshInterval = setInterval(async () => {
            await this.refreshActiveDownloads();
        }, 2000);
        return this._downloadRefreshInterval;
    }

    /**
     * Stops the download refresh interval.
     */
    stopDownloadRefreshInterval() {
        if (this._downloadRefreshInterval) {
            clearInterval(this._downloadRefreshInterval);
        }
    }

    /**
     * Determines the prompt formatting strategy based on the model ID.
     * @param {string} modelId 
     * @returns {string}
     */
    getPromptStrategy(modelId) {
        if (!modelId) return 'chatml';
        const id = modelId.toLowerCase();

        const strategies = [
            { key: 'llama-3', value: 'llama3' },
            { key: 'llama-2', value: 'llama2' },
            { key: 'phi-3',   value: 'phi3' },
            { key: 'gemma',   value: 'gemma' },
            { key: 'qwen',    value: 'chatml' }
        ];

        const match = strategies.find(s => id.includes(s.key));
        return match?.value || 'chatml';
    }

    /**
     * Checks if a model ID refers to a Vision-Language Model (VLM).
     * @param {string} modelId 
     * @returns {boolean}
     */
    isVLM(modelId) {
        if (!modelId) return false;
        const id = modelId.toLowerCase();
        return id.includes('llava') || id.includes('vision') || id.includes('vlm') || id.includes('phi-3-vision');
    }

    /**
     * Simple heuristic to estimate token count from string length.
     */
    estimateTokens(input) {
        if (!input) return 0;

        // 1. Handle raw strings
        if (typeof input === 'string') {
            return Math.ceil(input.length / this.CHAR_TO_TOKEN_RATIO);
        }

        // 2. Handle arrays (recursively sum parts)
        if (Array.isArray(input)) {
            return input.reduce((acc, part) => acc + this.estimateTokens(part), 0);
        }

        // 3. Handle objects (OpenAI multimodal parts or internal Attachment objects)
        if (typeof input === 'object') {
            // Standard OpenAI Part
            if (input.type === 'text') return this.estimateTokens(input.text);
            if (input.type === 'image_url') return 85;

            // Internal Attachment format
            if (input.type?.startsWith('image/')) return 85;
            
            // Textual attachments (PDF, text files) use extracted text for estimation
            const textContent = input.extractedText || input.content;
            if (textContent) return this.estimateTokens(textContent);
        }

        return 0;
    }

    /**
     * Maps usage or severity to standardized CSS status names.
     * @param {number} current - Current value.
     * @param {number} max - Maximum value.
     * @returns {string} 'healthy', 'warning', or 'critical'
     */
    getStatus(current, max) {
        const c = Number(current) || 0;
        const m = (Number(max) && max > 0) ? max : 1;
        const ratio = c / m;
        if (ratio >= 1.0) return 'critical';
        if (ratio >= 0.8) return 'warning';
        return 'healthy';
    }
}