'use strict';

/**
 * Local embedding using Hugging Face Transformers.js
 * Uses all-MiniLM-L6-v2 (22MB, 384 dimensions) - runs fully offline via ONNX/WASM.
 * No API key required.
 */

let _pipeline = null;
let _initPromise = null;

async function getExtractor() {
    if (_pipeline) return _pipeline;
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
        const { pipeline } = await import('@huggingface/transformers');
        _pipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
            quantized: true
        });
        return _pipeline;
    })();
    return _initPromise;
}

class TransformersEmbedder {
    constructor(config = {}) {
        this.model = config.model || 'Xenova/all-MiniLM-L6-v2';
        this.embeddingDims = 384;
    }

    async embed(text) {
        const extractor = await getExtractor();
        const output = await extractor(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    }

    async embedBatch(texts) {
        const results = [];
        for (const text of texts) {
            results.push(await this.embed(text));
        }
        return results;
    }
}

module.exports = { TransformersEmbedder };
