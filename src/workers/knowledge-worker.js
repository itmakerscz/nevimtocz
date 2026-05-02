/**
 * KnowledgeWorker handles semantic similarity scoring and keyword fallback search.
 */

let storedKB = [];
let sharedVectors = null;
let embeddingDim = 0;

self.onmessage = (e) => {
    const { action, id, query, queryVector, knowledgeBase, threshold, buffer, dim } = e.data;

    if (action === 'INIT_SHARED') {
        sharedVectors = new Float32Array(buffer);
        embeddingDim = dim;
        return;
    }

    if (action === 'SYNC') {
        storedKB = knowledgeBase || [];
        return;
    }

    if (action !== 'SEARCH') return;

    const lockedEntries = storedKB.filter(k => k.locked).map(k => k.content);

    let semanticResults = [];
    if (queryVector && sharedVectors) {
        semanticResults = storedKB.map((k, index) => {
            let dot = 0;
            const offset = index * embeddingDim;
            
            for (let i = 0; i < embeddingDim; i++) {
                dot += queryVector[i] * sharedVectors[offset + i];
            }

            const score = dot * (1 + ((k.importance || 1) - 1) * 0.1);
            return { ...k, score };
        })
        .filter(k => k.score > threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    }

    if (semanticResults.length === 0) {
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        if (queryWords.length > 0) {
            semanticResults = storedKB.map(k => {
                const content = k.content.toLowerCase();
                let matches = 0;
                queryWords.forEach(word => { if (content.includes(word)) matches++; });
                return { ...k, score: matches / queryWords.length };
            })
            .filter(k => k.score > 0.1)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
        }
    }

    const results = semanticResults || [];
    const finalResult = [...new Set([...lockedEntries, ...results.map(s => s.content)])].join('\n');
    self.postMessage({ id, result: finalResult, items: results });
};