const PIXELS_PER_SECOND = 20;
function pointerTime(clientX, canvasLeft, grabOffset, duration, clipDuration = 0) {
  return Math.max(0, Math.min(Math.max(0, duration - clipDuration), (clientX - canvasLeft - grabOffset) / PIXELS_PER_SECOND));
}
function snapClipStart(start, clip, items, duration) {
  let result = start, distance = duration * .015, guide = null;
  for (const other of items) if (other.id !== clip.id) for (const edge of [other.startTime, other.startTime + other.duration]) {
    for (const candidate of [edge, edge - clip.duration]) if (candidate >= 0 && candidate + clip.duration <= duration && Math.abs(candidate - start) <= distance) {
      distance = Math.abs(candidate - start); result = candidate; guide = edge;
    }
  }
  return { start: result, guide };
}
function hasOverlap(clip, items) { return items.some(other => other.id !== clip.id && other.trackId === clip.trackId && clip.startTime < other.startTime + other.duration && clip.startTime + clip.duration > other.startTime); }
module.exports = { pointerTime, snapClipStart, hasOverlap };
