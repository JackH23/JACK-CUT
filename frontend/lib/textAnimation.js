const { getMediaAnimationState } = require('./mediaAnimation');

// Reuse phase/amount/overlap math; text moves in canvas units and scales about
// its own center. Saved text position and font size never change during playback.
function getTextAnimationState(clip, localTime) {
  return getMediaAnimationState(clip, localTime);
}
function getTextAnimationStyle(clip, localTime) {
  const { opacity, scale, offset } = getTextAnimationState(clip, localTime);
  return { opacity, transform: `translateX(${offset}cqw) scale(${scale})`, transformOrigin: 'center' };
}
module.exports = { getTextAnimationState, getTextAnimationStyle };
