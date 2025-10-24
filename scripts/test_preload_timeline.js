#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

class MockEventTarget {
    constructor() {
        this.listeners = new Map();
    }

    addEventListener(type, listener) {
        const entries = this.listeners.get(type) || [];
        entries.push(listener);
        this.listeners.set(type, entries);
    }

    removeEventListener(type, listener) {
        const entries = this.listeners.get(type);
        if (!entries) {
            return;
        }
        const next = entries.filter((fn) => fn !== listener);
        if (next.length) {
            this.listeners.set(type, next);
        } else {
            this.listeners.delete(type);
        }
    }

    dispatchEvent(event) {
        const entries = this.listeners.get(event.type) || [];
        entries.forEach((listener) => {
            try {
                listener(event);
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error('Mock listener error', error);
            }
        });
    }
}

class MockImage extends MockEventTarget {
    constructor() {
        super();
        this.decodeCalls = 0;
        this._src = '';
        this.attributeRemoved = false;
        MockImage.instances.push(this);
    }

    set src(value) {
        this._src = value || '';
        if (value) {
            setTimeout(() => {
                this.dispatchEvent({ type: 'load' });
            }, 0);
        }
    }

    get src() {
        return this._src;
    }

    decode() {
        this.decodeCalls += 1;
        return new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    }

    removeAttribute(name) {
        if (name === 'src') {
            this.attributeRemoved = true;
            this._src = '';
        }
    }
}

MockImage.instances = [];

class MockVideo extends MockEventTarget {
    constructor() {
        super();
        this._src = '';
        this.attributeRemoved = false;
        this.loadCalls = 0;
        this.pauseCalls = 0;
        MockVideo.instances.push(this);
    }

    set src(value) {
        this._src = value || '';
        if (value) {
            setTimeout(() => {
                this.dispatchEvent({ type: 'loadeddata' });
            }, 0);
        }
    }

    get src() {
        return this._src;
    }

    load() {
        this.loadCalls += 1;
    }

    pause() {
        this.pauseCalls += 1;
    }

    removeAttribute(name) {
        if (name === 'src') {
            this.attributeRemoved = true;
            this._src = '';
        }
    }
}

MockVideo.instances = [];

const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    Promise,
    timelineImagePreloadCache: new Map(),
    timelineVideoPreloadCache: new Map(),
    Image: MockImage,
    document: {
        createElement(tagName) {
            if (tagName === 'video') {
                return new MockVideo();
            }
            throw new Error(`Unsupported element requested: ${tagName}`);
        },
    },
});

const source = fs.readFileSync('src/templates/home_scripts/02_home_content.js', 'utf8');
const imageStart = source.indexOf('function preloadTimelineImage');
const releaseStart = source.indexOf('function releaseTimelineVideo');
const snippet = source.slice(imageStart, releaseStart);
const script = new vm.Script(`${snippet}\nthis.preloadTimelineImage = preloadTimelineImage;\nthis.preloadTimelineVideo = preloadTimelineVideo;`);
script.runInContext(context);

const { preloadTimelineImage, preloadTimelineVideo } = context;

(async () => {
    const firstImagePromise = preloadTimelineImage('image://example');
    assert.strictEqual(MockImage.instances.length, 1, 'Expected one image preload instance');
    const firstImageResult = await firstImagePromise;
    assert.strictEqual(firstImageResult, undefined, 'Image preload should resolve to void');
    const imageInstance = MockImage.instances[0];
    assert.strictEqual(imageInstance.decodeCalls, 1, 'Image decode should be invoked once');
    assert.strictEqual(imageInstance.src, '', 'Image src should be cleared after preload');
    assert.strictEqual(imageInstance.attributeRemoved, true, 'Image src attribute should be removed');

    const secondImageResult = await preloadTimelineImage('image://example');
    assert.strictEqual(secondImageResult, undefined, 'Cached image preload should resolve to void');
    assert.strictEqual(MockImage.instances.length, 1, 'Image preload should reuse cached promise');

    const firstVideoPromise = preloadTimelineVideo('video://example');
    assert.strictEqual(MockVideo.instances.length, 1, 'Expected one video preload instance');
    const firstVideoResult = await firstVideoPromise;
    assert.strictEqual(firstVideoResult, undefined, 'Video preload should resolve to void');
    const videoInstance = MockVideo.instances[0];
    assert.ok(videoInstance.pauseCalls >= 1, 'Video should be paused during cleanup');
    assert.ok(videoInstance.loadCalls >= 1, 'Video load should be invoked during cleanup');
    assert.strictEqual(videoInstance.attributeRemoved, true, 'Video src attribute should be removed');
    assert.strictEqual(videoInstance.src, '', 'Video src should be cleared after preload');

    const secondVideoResult = await preloadTimelineVideo('video://example');
    assert.strictEqual(secondVideoResult, undefined, 'Cached video preload should resolve to void');
    assert.strictEqual(MockVideo.instances.length, 1, 'Video preload should reuse cached promise');

    // eslint-disable-next-line no-console
    console.log('All preload timeline tests passed.');
})().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
});
