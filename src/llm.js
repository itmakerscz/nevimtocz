import * as webllm from "https://esm.run/@mlc-ai/web-llm@0.2.82"; // Pin version to ensure consistent URL structure
import { APP_CONFIG } from './config.js';
import { EmbeddingService } from './services/embedding-service.js';
import { logger } from './utils/logger.js';

export const models = APP_CONFIG.MODELS;

const CACHE_NAME = 'nevimto-models-v1';

/**
 * State management for the engines
 */
const state = {
    engine: null,
    engineId: null
};

/**
 * Shared singleton for embedding generation to prevent multiple worker instances.
 */
let sharedEmbeddingService = null;
const getEmbeddingService = () => {
    if (!sharedEmbeddingService) sharedEmbeddingService = new EmbeddingService();
    return sharedEmbeddingService;
};

/**
 * Proxy for the shared embedding service.
 */
export const getEmbedding = (text, onProgress) => getEmbeddingService().getEmbedding(text, onProgress);

/**
 * Checks if a specific model is already cached in CacheStorage.
 * @param {string} modelId 
 * @returns {Promise<boolean>}
 */
export async function isModelCached(modelId) {
    try {
        const cache = await caches.open(CACHE_NAME);
        const keys = await cache.keys();
        return keys.some(req => req.url.includes(modelId));
    } catch {
        return false;
    }
}

/**
 * Estimates required space for models and checks availability.
 * @param {string} mainModelId 
 * @returns {Promise<{available: boolean, requiredBytes: number, quotaBytes: number, usageBytes: number}>}
 */
export async function checkStorageAvailability(mainModelId) {
    const model = APP_CONFIG.MODELS.find(m => m.id === mainModelId);
    const [mainCached, embedCached] = await Promise.all([
        isModelCached(mainModelId),
        isModelCached(APP_CONFIG.EMBEDDING_MODEL.id)
    ]);

    let totalRequired = 0;
    if (!mainCached) totalRequired += (model?.estimatedSize || 0);
    if (!embedCached) totalRequired += APP_CONFIG.EMBEDDING_MODEL.size;

    if (navigator.storage && navigator.storage.estimate) {
        const { quota, usage } = await navigator.storage.estimate();
        const available = quota - usage;
        return {
            available: available > (totalRequired * 1.1),
            requiredBytes: totalRequired,
            quotaBytes: quota,
            usageBytes: usage
        };
    }

    return { available: true, requiredBytes: totalRequired, quotaBytes: 0, usageBytes: 0 };
}

let gpuDevice = null;
let similarityPipeline = null;

/**
 * CPU-side pool for matrix flattening to avoid GC pressure.
 */
let pooledMatrix = null;

/**
 * Cache for WebGPU buffers to avoid expensive reallocations.
 */
let cachedBuffers = {
    qBuf: null,  // Query vector buffer
    dBuf: null,  // Document vectors matrix buffer
    rBuf: null,  // Results storage buffer
    out: null,   // Map-read output buffer
    uBuf: null,  // Uniform buffer (dim, count)
    bg: null     // BindGroup cache
};

/**
 * Ensures a buffer exists and has at least the required size.
 * @returns {boolean} True if a new buffer was created, signaling BindGroup invalidation.
 */
function _ensureBuffer(device, key, size, usage) {
    if (!cachedBuffers[key] || cachedBuffers[key].size < size) {
        if (cachedBuffers[key]) cachedBuffers[key].destroy();
        cachedBuffers[key] = device.createBuffer({ size, usage });
        return true;
    }
    return false;
};

/**
 * Cleans up the GPU state if the device is lost.
 * @private
 */
function _resetGPUState() {
    Object.keys(cachedBuffers).forEach(key => {
        if (cachedBuffers[key]) {
            try { if (typeof cachedBuffers[key].destroy === 'function') cachedBuffers[key].destroy(); } catch {}
        }
        cachedBuffers[key] = null;
    });
    gpuDevice = null;
    similarityPipeline = null;
    
    // Clear engine state so it can be re-initialized on next use
    state.engine = null;
    state.engineId = null;

    logger.info("WebGPU similarity state has been reset due to device loss.");
}

/**
 * Initializes the WebGPU device and compute shader for similarity ranking.
 */
async function _initGPU() {
    if (gpuDevice) return gpuDevice;
    if (!navigator.gpu) return null;
    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return null;
        gpuDevice = await adapter.requestDevice();

        // Handle device loss (e.g. driver crash, window resize to different GPU)
        gpuDevice.lost.then((info) => {
            if (info.reason !== 'destroyed') {
                logger.error(`WebGPU device was lost: ${info.message}. Reason: ${info.reason}`);
                _resetGPUState();
            }
        });

        const shaderModule = gpuDevice.createShaderModule({
            code: `
                struct Params {
                    dim: u32,
                    count: u32,
                };
                @group(0) @binding(0) var<uniform> params: Params;
                @group(0) @binding(1) var<storage, read> q: array<f32>;
                @group(0) @binding(2) var<storage, read> d: array<f32>;
                @group(0) @binding(3) var<storage, read_write> r: array<f32>;

                @compute @workgroup_size(64)
                fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
                    let i = gid.x;
                    if (i >= params.count) { return; }
                    var dot: f32 = 0.0;
                    let offset = i * params.dim;
                    for (var j: u32 = 0u; j < params.dim; j = j + 1u) {
                        dot = dot + q[j] * d[offset + j];
                    }
                    r[i] = dot;
                }
            `
        });
        similarityPipeline = gpuDevice.createComputePipeline({
            layout: 'auto',
            compute: { module: shaderModule, entryPoint: 'main' }
        });
        return gpuDevice;
    } catch (e) {
        logger.warn("WebGPU similarity initialization failed", e);
        return null;
    }
}

export const stopAI = async () => state.engine?.interruptGenerate();

/**
 * Checks if WebGPU is available and compatible on the current system.
 * @returns {Promise<boolean>}
 */
export async function checkWebGPUSupport() {
    if (!navigator.gpu) return false;
    try {
        const adapter = await navigator.gpu.requestAdapter();
        return !!adapter;
    } catch (e) {
        return false;
    }
}

/**
 * Calculates similarity scores for a batch of vectors using GPU acceleration.
 * @param {number[]} queryVector - The vector to compare against.
 * @param {number[][]} vectors - Array of vectors to rank.
 * @returns {Promise<number[]>} Array of scores.
 */
export async function computeSimilarity(queryVector, vectors) {
    const device = await _initGPU();
    const qVec = new Float32Array(queryVector);
    const dim = qVec.length;
    const count = vectors.length;
    
    if (count === 0) return [];
    if (!device || count < 12) { // Threshold for CPU fallback
        return vectors.map(v => {
            let dot = 0;
            for (let i = 0; i < dim; i++) dot += qVec[i] * v[i];
            return dot;
        });
    }

    // Prepare matrix data
    const totalSize = count * dim;
    if (!pooledMatrix || pooledMatrix.length < totalSize) {
        pooledMatrix = new Float32Array(totalSize);
    }
    const vMatrix = pooledMatrix.subarray(0, totalSize);
    vectors.forEach((v, i) => vMatrix.set(v, i * dim));
    
    try {
        // Growth strategy: Check if existing buffers are large enough
        const uChanged = _ensureBuffer(device, 'uBuf', 8, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
        const qChanged = _ensureBuffer(device, 'qBuf', qVec.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
        const dChanged = _ensureBuffer(device, 'dBuf', vMatrix.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
        const rChanged = _ensureBuffer(device, 'rBuf', count * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
        const oChanged = _ensureBuffer(device, 'out', count * 4, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);

        const bgNeedsUpdate = !cachedBuffers.bg || uChanged || qChanged || dChanged || rChanged || oChanged;

        // Write current task parameters and data to shared buffers
        device.queue.writeBuffer(cachedBuffers.uBuf, 0, new Uint32Array([dim, count]));
        device.queue.writeBuffer(cachedBuffers.qBuf, 0, qVec);
        device.queue.writeBuffer(cachedBuffers.dBuf, 0, vMatrix);

        if (bgNeedsUpdate) {
            cachedBuffers.bg = device.createBindGroup({
                layout: similarityPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: cachedBuffers.uBuf } },
                    { binding: 1, resource: { buffer: cachedBuffers.qBuf } },
                    { binding: 2, resource: { buffer: cachedBuffers.dBuf } },
                    { binding: 3, resource: { buffer: cachedBuffers.rBuf } }
                ]
            });
        }

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(similarityPipeline);
        pass.setBindGroup(0, cachedBuffers.bg);
        pass.dispatchWorkgroups(Math.ceil(count / 64));
        pass.end();
        encoder.copyBufferToBuffer(cachedBuffers.rBuf, 0, cachedBuffers.out, 0, count * 4);
        device.queue.submit([encoder.finish()]);

        await cachedBuffers.out.mapAsync(GPUMapMode.READ, 0, count * 4);
        const result = Array.from(new Float32Array(cachedBuffers.out.getMappedRange(0, count * 4)));
        cachedBuffers.out.unmap();

        return result;
    } catch (err) {
        logger.warn("WebGPU similarity calculation failed, falling back to CPU", err);
        return vectors.map(v => {
            let dot = 0;
            for (let i = 0; i < dim; i++) dot += qVec[i] * v[i];
            return dot;
        });
    }
}

/**
 * Warms up the main LLM engine by triggering initialization.
 * @param {string} modelId - The ID of the model to load.
 * @param {Function} onProgress - Callback for loading progress.
 */
export async function warmMainModel(modelId, onProgress) {
    // Re-initialize if the model changed OR if the engine was cleared (e.g. after device loss)
    const needsReload = state.engineId !== modelId || !state.engine;
    if (needsReload) {
        if (state.engine) await state.engine.unload();
        logger.info(`Initializing main engine: ${modelId}`);

        state.engine = await webllm.CreateMLCEngine(modelId, {
            initProgressCallback: (report) => {
                if (onProgress) onProgress(report.text, Math.round(report.progress * 100));
            },
            appConfig: webllm.prebuiltAppConfig,
            chatOpts: APP_CONFIG.ENGINE_CONFIG
        });
        state.engineId = modelId;
    }
    return state.engine;
}

export async function askAI(modelId, messages, onProgress, onChunk, options = {}) {
    try {
        const currentEngine = await warmMainModel(modelId, onProgress);

        // Ensure messages is always an array for the Chat API, even if a strategy returned a pre-formatted string
        const chatPayload = typeof messages === 'string' ? [{ role: 'user', content: messages }] : messages;

        const asyncChunkIter = await currentEngine.chat.completions.create({ 
            messages: chatPayload,
            stream: true,
            ...APP_CONFIG.ENGINE_CONFIG,
            ...options
        });
        
        let fullText = "";
        for await (const chunk of asyncChunkIter) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                fullText += content;
                if (onChunk) onChunk(fullText);
            }
        }
        return fullText;

    } catch (err) {
        // Detect device loss specifically to trigger a state reset
        const isDeviceLoss = err.message?.toLowerCase().includes("device lost") || 
                             err.message?.toLowerCase().includes("device was lost");
        
        if (isDeviceLoss) _resetGPUState();

        logger.error('Inference failed:', err);
        throw new Error(`Incompatibility: ${err.message}`);
    }
}