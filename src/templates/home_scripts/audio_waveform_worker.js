const TARGET_BUCKETS = 4000;

function computeWaveformBuckets(channelData) {
    if (!(channelData instanceof Float32Array)) {
        return null;
    }
    const totalSamples = channelData.length;
    if (!Number.isFinite(totalSamples) || totalSamples <= 0) {
        return null;
    }
    const bucketWidth = Math.max(1, Math.floor(totalSamples / TARGET_BUCKETS) || 1);
    const bucketCount = Math.ceil(totalSamples / bucketWidth);
    const buckets = new Float32Array(bucketCount * 2);

    for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
        const startIndex = bucketIndex * bucketWidth;
        const endIndex = Math.min(totalSamples, startIndex + bucketWidth);
        let min = 1;
        let max = -1;

        for (let sampleIndex = startIndex; sampleIndex < endIndex; sampleIndex += 1) {
            const sample = channelData[sampleIndex] || 0;
            if (sample < min) {
                min = sample;
            }
            if (sample > max) {
                max = sample;
            }
        }

        buckets[(bucketIndex * 2)] = min;
        buckets[(bucketIndex * 2) + 1] = max;
    }

    return {
        bucketWidth,
        buckets,
        totalSamples,
    };
}

self.addEventListener('message', (event) => {
    const { id = null, channelData = null } = event.data || {};
    if (!(channelData instanceof Float32Array)) {
        self.postMessage({ id, error: 'invalid-data' });
        return;
    }

    try {
        const result = computeWaveformBuckets(channelData);
        if (!result) {
            self.postMessage({ id, error: 'failed' });
            return;
        }

        self.postMessage({ id, result }, [result.buckets.buffer]);
    } catch (error) {
        self.postMessage({ id, error: error?.message || 'error' });
    }
});
