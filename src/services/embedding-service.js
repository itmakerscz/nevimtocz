import { logger } from '../utils/logger.js';

/**
 * EmbeddingService handles the generation of vector embeddings,
 * managing a background worker task queue and providing a main-thread fallback.
 */
export class EmbeddingService {
    constructor(config = {}) {
        this.worker = null;
        this.queue = [];
        this.isProcessing = false;
        this.mainThreadEmbedder = null;

        // Config for local hosting or hub fallback
        this.config = {
            modelId: config.modelId || 'Xenova/all-MiniLM-L6-v2',
            localPath: config.localPath || null, // e.g. '/models/embeddings/'
            allowLocalModels: config.allowLocalModels !== undefined ? config.allowLocalModels : true,
            allowRemoteModels: config.allowRemoteModels !== undefined ? config.allowRemoteModels : true
        };
    }

    /**
     * Queues a text string to be converted into a vector embedding.
     * @param {string} text - The text to embed.
     * @param {Function} onProgress - Callback for loading progress.
     * @returns {Promise<number[]>} The resulting vector.
     */
    async getEmbedding(text, onProgress) {
        return new Promise((resolve, reject) => {
            this.queue.push({ text, onProgress, resolve, reject });
            this._processQueue();
        });
    }

    /**
     * Triggers the initialization of the embedding engine.
     */
    async warm(onProgress) {
        return this.getEmbedding("Warmup query for semantic engine", onProgress);
    }

    /**
     * Processes the next task in the embedding queue.
     * @private
     */
    async _processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;
        this.isProcessing = true;

        const { text, onProgress, resolve, reject } = this.queue.shift();

        try {
            const embedding = await this._executeWorkerTask(text, onProgress);
            resolve(embedding);
        } catch (err) {
            logger.warn(`Embedding Worker failed: ${err.message}. Attempting main-thread fallback.`);
            try {
                const fallbackResult = await this._getFallback(text, onProgress);
                resolve(fallbackResult);
            } catch (fallbackErr) {
                reject(fallbackErr);
            }
        } finally {
            this.isProcessing = false;
            this._processQueue();
        }
    }

    /**
     * Communicates with the Web Worker to generate an embedding.
     * @private
     */
    async _executeWorkerTask(text, onProgress) {
        return new Promise((resolve, reject) => {
            if (!this.worker) {
                try {
                    this.worker = new Worker(new URL('../workers/embeddings-worker.js', import.meta.url), { type: 'module' });
                } catch (err) {
                    return reject(new Error(`Failed to initialize Embedding Worker: ${err.message}`));
                }
            }

            const handleMessage = (e) => {
                const { status, embedding, progress, error } = e.data;
                if (status === 'progress' && onProgress) {
                    onProgress(`Načítám sémantický engine: ${Math.round(progress)}%`, Math.round(progress));
                } else if (status === 'complete') {
                    cleanup();
                    resolve(embedding);
                } else if (status === 'error') {
                    cleanup();
                    reject(new Error(error));
                }
            };

            const handleError = (err) => {
                cleanup();
                this.worker = null; 
                reject(new Error(err.message || 'Embedding Worker crashed.'));
            };

            const cleanup = () => {
                this.worker.removeEventListener('message', handleMessage);
                this.worker.removeEventListener('error', handleError);
            };

            this.worker.addEventListener('message', handleMessage);
            this.worker.addEventListener('error', handleError);
            this.worker.postMessage({ text, ...this.config });
        });
    }

    /**
     * Fallback to main thread execution using Transformers.js.
     * @private
     */
    async _getFallback(text, onProgress) {
        if (!this.mainThreadEmbedder) {
            logger.info("Initializing embedding engine on main thread (fallback)");
            const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0');

            // Apply environment configuration for main-thread fallback
            env.allowLocalModels = this.config.allowLocalModels;
            env.allowRemoteModels = this.config.allowRemoteModels;
            if (this.config.localPath) env.localModelPath = this.config.localPath;

            this.mainThreadEmbedder = await pipeline('feature-extraction', this.config.modelId, {
                progress_callback: (p) => {
                    if (p.status === 'progress' && onProgress) {
                        onProgress(`Načítám sémantický engine (fallback): ${Math.round(p.progress)}%`, Math.round(p.progress));
                    }
                }
            });
        }
        const output = await this.mainThreadEmbedder(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    }
}