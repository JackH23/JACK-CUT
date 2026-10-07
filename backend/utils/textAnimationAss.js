const { getTextAnimationState } = require('../../frontend/lib/textAnimation');
const { getMediaAnimationSettings } = require('../../frontend/lib/mediaAnimation');

// ASS has centisecond event boundaries. Sampling on the GLOBAL output frame
// grid gives each decoded frame the same clip-local state as the preview. Merge
// equal adjacent samples so static portions remain one subtitle event. This also
// represents nonlinear overlap products exactly at output frames without GEQ.
function getTextAnimationSegments(clip, fps = 30) {
  const settings = getMediaAnimationSettings(clip);
  const animated = ['In', 'Out'].some(phase => settings['animation' + phase + 'Preset'] !== 'none' && settings['animation' + phase + 'Duration'] > 0 && settings['animation' + phase + 'Amount'] > 0);
  if (!animated) return [{ start: clip.start, end: clip.start + clip.duration, state: { opacity: 1, scale: 1, offset: 0 }, animated: false }];
  const end = clip.start + clip.duration;
  const segments = [];
  let previousKey;
  // Events begin at the clip boundary; state is sampled at the first output
  // frame on or after that boundary, rather than restarting on each ASS event.
  for (let frame = Math.ceil(clip.start * fps); frame / fps < end; frame++) {
    const time = frame / fps;
    const state = getTextAnimationState(clip, time - clip.start);
    const key = JSON.stringify(state);
    if (key !== previousKey) {
      if (segments.length) segments.at(-1).end = time;
      segments.push({ start: segments.length ? time : clip.start, end, state, animated: true });
      previousKey = key;
    }
  }
  return segments;
}
function getTextAnimationTags(clip, state, width, height) {
  const x = clip.textX / 100 * width + state.offset / 100 * width;
  const y = clip.textY / 100 * height;
  const number = value => Number(value.toFixed(6));
  const alpha = value => Math.round(value).toString(16).padStart(2, '0').toUpperCase();
  return `\\pos(${number(x)},${number(y)})\\fscx${number(state.scale * 100)}\\fscy${number(state.scale * 100)}\\1a&H${alpha(255 * (1-state.opacity))}&\\4a&H${alpha(128 + 127 * (1-state.opacity))}&`;
}
module.exports = { getTextAnimationSegments, getTextAnimationTags };
