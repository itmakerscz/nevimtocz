import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

let embedder = null;

self.onmessage = async (e) => {
    const { text, modelId, localPath, allowLocalModels, allowRemoteModels } = e.data;

    if (!embedder) {
        try {
            // Configure environment for local hosting if requested
            if (allowLocalModels !== undefined) env.allowLocalModels = allowLocalModels;
            if (allowRemoteModels !== undefined) env.allowRemoteModels = allowRemoteModels;
            if (localPath) env.localModelPath = localPath;

            const targetModel = modelId || 'Xenova/all-MiniLM-L6-v2';

            embedder = await pipeline('feature-extraction', targetModel, {
                progress_callback: (p) => {
                    if (p.status === 'progress') {
                        self.postMessage({ status: 'progress', progress: p.progress });
                    }
                }
            });
        } catch (err) {
            self.postMessage({ status: 'error', error: err.message });
            return;
        }
    }

    try {
        const output = await embedder(text, { pooling: 'mean', normalize: true });
        self.postMessage({ status: 'complete', embedding: Array.from(output.data) });
    } catch (err) {
        self.postMessage({ status: 'error', error: err.message });
    }
};