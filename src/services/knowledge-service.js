import { getEmbedding } from '../llm.js';
import { logger } from '../utils/logger.js';

/**
 * KnowledgeService handles semantic and keyword-based search within knowledge bases.
 */
export class KnowledgeService {
    constructor(similarityThreshold = 0.5) {
        this.similarityThreshold = similarityThreshold;
        this.worker = new Worker(new URL('../workers/knowledge-worker.js', import.meta.url), { type: 'module' });
        this._callbacks = new Map();
        this._nextId = 1;
        this._lastKBSyncRef = null;

        this.maxEntries = 5000; 
        this.embeddingDim = 384; // Typical for MiniLM-L6-v2
        this.sharedBuffer = null;
        this.vectorView = null;

        this.worker.onmessage = (e) => {
            const { id, result, items } = e.data;
            const callback = this._callbacks.get(id);
            if (callback) {
                this._callbacks.delete(id);
                callback({ result, items });
            }
        };
    }

    _initSharedBuffer() {
        if (this.sharedBuffer || typeof SharedArrayBuffer === 'undefined' || !self.crossOriginIsolated) return;
        
        this.sharedBuffer = new SharedArrayBuffer(this.maxEntries * this.embeddingDim * 4);
        this.vectorView = new Float32Array(this.sharedBuffer);
        
        this.worker.postMessage({ action: 'INIT_SHARED', buffer: this.sharedBuffer, dim: this.embeddingDim });
    }

    /**
     * Performs a hybrid search (semantic + locked + keyword fallback) on the knowledge base.
     * @param {string} query - The user query.
     * @param {Array} knowledgeBase - The list of KB entries.
     * @returns {Promise<string>} A combined string of relevant knowledge.
     */
    async search(query, knowledgeBase, threshold = null) {
        const data = await this._runWorker(query, knowledgeBase, threshold);
        return data.result;
    }

    /**
     * Performs search and returns ranked items instead of a combined string.
     * @returns {Promise<Array>}
     */
    async searchRanked(query, knowledgeBase, threshold = null) {
        const data = await this._runWorker(query, knowledgeBase, threshold);
        return data.items;
    }

    async _runWorker(query, knowledgeBase, threshold = null) {
        const id = this._nextId++;
        let queryVector = null;
        
        this._initSharedBuffer();

        try { queryVector = await getEmbedding(query); } 
        catch (e) { logger.warn("Query embedding failed, falling back to keywords in worker", e); }

        const needsSync = this._lastKBSyncRef !== knowledgeBase;
        if (needsSync) {
            this._lastKBSyncRef = knowledgeBase;
            
            // Copy vectors into shared buffer and remove from metadata to reduce sync payload
            if (this.vectorView) {
                knowledgeBase.forEach((item, i) => {
                    if (i < this.maxEntries && item.embedding) {
                        this.vectorView.set(item.embedding, i * this.embeddingDim);
                    }
                });
            }

            // Send metadata only (without heavy embeddings)
            const metadataOnly = knowledgeBase.map(({ embedding, ...rest }) => rest);
            this.worker.postMessage({ action: 'SYNC', knowledgeBase: metadataOnly });
        }

        return new Promise((resolve) => {
            this._callbacks.set(id, resolve);
            this.worker.postMessage({ 
                action: 'SEARCH', id, query, queryVector, 
                threshold: threshold !== null ? threshold : this.similarityThreshold 
            });
        });
    }

    /**
     * Creates a new knowledge entry with an embedding.
     * @param {string} content - The text to index.
     * @param {Object} options - Metadata for the entry (importance, locked, onProgress callback).
     * @returns {Promise<Object>} The formatted knowledge entry.
     */
    async createEntry(content, { importance = 1, locked = false, onProgress = null } = {}) {
        if (!content) throw new Error("Content is required to create a knowledge entry.");
        
        const embedding = await getEmbedding(content, onProgress);
        return {
            id: crypto.randomUUID(),
            content: content,
            embedding: embedding,
            importance: importance,
            locked: locked,
            date: new Date().toLocaleDateString()
        };
    }

    /**
     * Handles clicking on a knowledge link by navigating to the KB view and highlighting the entry.
     * @param {string} kbId - The ID of the knowledge entry.
     * @param {Object} app - The main application instance.
     */
    handleLinkClick(kbId, app) {
        const exists = app.activeProfile?.knowledgeBase?.some(k => k.id === kbId);
        
        app.uiService.openModal('kb');
        app.$nextTick(() => {
            const kbItemEl = app.$el.querySelector(`.kb-item[data-kb-id="${kbId}"]`);
            if (kbItemEl) {
                kbItemEl.classList.add('highlight');
                kbItemEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => kbItemEl.classList.remove('highlight'), 3000);
            } else if (!exists) {
                app.addToast(`Znalost s ID "${kbId}" nenalezena.`, 'warning');
            }
        });
    }
}