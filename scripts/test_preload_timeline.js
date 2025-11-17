#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
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
                this.dispatchEvent({ type: 'canplay' });
                this.dispatchEvent({ type: 'canplaythrough' });
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

class MockAudio extends MockEventTarget {
    constructor() {
        super();
        this._src = '';
        this.attributeRemoved = false;
        this.loadCalls = 0;
        this.pauseCalls = 0;
        MockAudio.instances.push(this);
    }

    set src(value) {
        this._src = value || '';
        if (value) {
            setTimeout(() => {
                this.dispatchEvent({ type: 'loadeddata' });
                this.dispatchEvent({ type: 'canplay' });
                this.dispatchEvent({ type: 'canplaythrough' });
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

MockAudio.instances = [];

const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    Promise,
    timelineImagePreloadCache: new Map(),
    timelineVideoPreloadCache: new Map(),
    timelineAudioPreloadCache: new Map(),
    Image: MockImage,
    document: {
        createElement(tagName) {
            if (tagName === 'video') {
                return new MockVideo();
            }
            if (tagName === 'audio') {
                return new MockAudio();
            }
            throw new Error(`Unsupported element requested: ${tagName}`);
        },
    },
});

const scriptsDir = path.join(__dirname, '..', 'src', 'templates', 'home_scripts');
const scriptParts = fs.readdirSync(scriptsDir)
    .filter((name) => /^[0-9]{2}_home_content\.js$/.test(name))
    .sort();

if (scriptParts.length === 0) {
    throw new Error('No home content script parts found to test');
}

const source = scriptParts
    .map((name) => fs.readFileSync(path.join(scriptsDir, name), 'utf8'))
    .join('\n');
const imageStart = source.indexOf('function preloadTimelineImage');
const snippetEnd = source.indexOf('function waitForMediaReady');
const snippet = source.slice(imageStart, snippetEnd);
const script = new vm.Script(`${snippet}\nthis.preloadTimelineImage = preloadTimelineImage;\nthis.preloadTimelineVideo = preloadTimelineVideo;\nthis.releaseTimelineVideo = releaseTimelineVideo;\nthis.preloadTimelineAudio = preloadTimelineAudio;\nthis.releaseTimelineAudio = releaseTimelineAudio;`);
script.runInContext(context);

const {
    preloadTimelineImage,
    preloadTimelineVideo,
    releaseTimelineVideo,
    preloadTimelineAudio,
    releaseTimelineAudio,
} = context;

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
    assert.ok(videoInstance.pauseCalls >= 1, 'Video should be paused during warmup');
    assert.strictEqual(videoInstance.loadCalls, 1, 'Video load should be invoked once to buffer data');
    assert.strictEqual(videoInstance.attributeRemoved, false, 'Video src should be retained after warmup');
    assert.notStrictEqual(videoInstance.src, '', 'Video src should be kept for reuse after warmup');

    const secondVideoResult = await preloadTimelineVideo('video://example');
    assert.strictEqual(secondVideoResult, undefined, 'Cached video preload should resolve to void');
    assert.strictEqual(MockVideo.instances.length, 1, 'Video preload should reuse cached promise');

    releaseTimelineVideo('video://example');
    assert.strictEqual(videoInstance.attributeRemoved, true, 'Video src should be removed on release');
    assert.ok(videoInstance.loadCalls >= 2, 'Video load should be invoked again during release');

    const firstAudioPromise = preloadTimelineAudio('audio://example');
    assert.strictEqual(MockAudio.instances.length, 1, 'Expected one audio preload instance');
    const firstAudioResult = await firstAudioPromise;
    assert.strictEqual(firstAudioResult, undefined, 'Audio preload should resolve to void');
    const audioInstance = MockAudio.instances[0];
    assert.ok(audioInstance.pauseCalls >= 1, 'Audio should be paused during warmup');
    assert.strictEqual(audioInstance.loadCalls, 1, 'Audio load should be invoked once to buffer data');
    assert.strictEqual(audioInstance.attributeRemoved, false, 'Audio src should be retained after warmup');

    const secondAudioResult = await preloadTimelineAudio('audio://example');
    assert.strictEqual(secondAudioResult, undefined, 'Cached audio preload should resolve to void');
    assert.strictEqual(MockAudio.instances.length, 1, 'Audio preload should reuse cached promise');

    releaseTimelineAudio('audio://example');
    assert.strictEqual(audioInstance.attributeRemoved, true, 'Audio src should be removed on release');
    assert.ok(audioInstance.loadCalls >= 2, 'Audio load should be invoked again during release');

    // eslint-disable-next-line no-console
    console.log('All preload timeline tests passed.');
})().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
});
