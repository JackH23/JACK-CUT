// Shared numeric preview and symbolic FFmpeg calculation. Legacy columns stay intact.
const animationFields = ['animationInPreset', 'animationInDuration', 'animationInAmount', 'animationOutPreset', 'animationOutDuration', 'animationOutAmount'];
const clamp = (x, a = 0, b = 1) => Math.min(Math.max(x, a), b);
function getMediaAnimationSettings(clip) {
    const duration = Math.max(0, Number(clip.duration) || 0);
    const legacy = !animationFields.some(key => clip[key] != null);
    const preset = clip.animationPreset ?? 'none', amount = clip.animationAmount ?? 50;
    const legacyOut = preset === 'fade-out' || preset === 'zoom-out';
    const settings = { legacy };
    for (const phase of ['In', 'Out']) {
        const applies = phase === 'Out' ? legacyOut : !legacyOut;
        settings['animation' + phase + 'Preset'] = clip['animation' + phase + 'Preset'] ?? (applies ? preset : 'none');
        settings['animation' + phase + 'Duration'] = clamp(Number(clip['animation' + phase + 'Duration'] ?? 1), 0, duration);
        settings['animation' + phase + 'Amount'] = clamp(Number(clip['animation' + phase + 'Amount'] ?? amount), 0, 100);
    }
    return settings;
}
function calculate(clip, time, symbolic = false) {
    const cfg = getMediaAnimationSettings(clip), d = Math.max(0, Number(clip.duration) || 0);
    const op = (a, b, sign) => symbolic ? '(' + a + sign + b + ')' : sign === '+' ? a + b : sign === '-' ? a - b : sign === '*' ? a * b : a / b;
    const sub = (a, b) => op(a, b, '-'), mul = (a, b) => op(a, b, '*');
    const bounded = (x, a, b) => symbolic ? 'clip(' + x + ',' + a + ',' + b + ')' : clamp(x, a, b);
    const u = bounded(time, 0, d);
    let opacity = 1, scale = 1, offset = 0;
    for (const phase of ['In', 'Out']) {
        const preset = cfg['animation' + phase + 'Preset'], dt = cfg['animation' + phase + 'Duration'], s = cfg['animation' + phase + 'Amount'] / 100;
        if (preset === 'none' || !dt || !s)
            continue;
        const isOut = phase === 'Out';
        // The old zoom-out was an entrance from enlarged scale. Preserve untouched clips.
        const legacyZoom = cfg.legacy && preset === 'zoom-out';
        const progress = bounded(op(isOut && !legacyZoom ? sub(u, d - dt) : u, dt, '/'), 0, 1);
        const weight = isOut && !legacyZoom ? progress : sub(1, progress);
        if (preset.startsWith('fade-'))
            opacity = mul(opacity, sub(1, mul(s, weight)));
        if (preset.startsWith('zoom-'))
            scale = mul(scale, op(1, mul(.25 * s, weight), legacyZoom ? '+' : '-'));
        if (preset.startsWith('slide-')) {
            const direction = (preset === 'slide-left' ? 1 : -1) * (isOut ? -1 : 1);
            offset = op(offset, mul(100 * s * direction, weight), '+');
        }
    }
    return { opacity, scale, offset };
}
function getMediaAnimationState(clip, time) { return calculate(clip, time); }
function getMediaAnimationExpressions(clip) { return calculate(clip, 'T', true); }
module.exports = { animationFields, getMediaAnimationSettings, getMediaAnimationState, getMediaAnimationExpressions };
