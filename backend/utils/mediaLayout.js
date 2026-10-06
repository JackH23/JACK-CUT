const { referenceWidth, referenceHeight } = require('../../frontend/lib/textLayout.json');

// CSS outer transform: translate(reference offsets) scale(user scale), origin center.
function getMediaParentTransform(clip, width, height) {
  const scale = Number(clip.mediaScale ?? 1);
  return {
    scale, width: width * scale, height: height * scale,
    centerX: width / 2 + Number(clip.mediaX ?? 0) * width / referenceWidth,
    centerY: height / 2 + Number(clip.mediaY ?? 0) * height / referenceHeight,
    offsetX: Number(clip.mediaX ?? 0) * width / referenceWidth,
    offsetY: Number(clip.mediaY ?? 0) * height / referenceHeight,
  };
}

function getMediaRectangle(clip, canvas, source, animation = { scale: 1, offset: 0 }) {
  const parent = getMediaParentTransform(clip, canvas.width, canvas.height);
  const fit = Math.min(canvas.width / source.width, canvas.height / source.height);
  const width = source.width * fit * parent.scale * animation.scale;
  const height = source.height * fit * parent.scale * animation.scale;
  const centerX = parent.centerX + parent.width * animation.offset / 100;
  const centerY = parent.centerY;
  return { left: centerX-width/2, top: centerY-height/2, right: centerX+width/2, bottom: centerY+height/2, width, height, centerX, centerY };
}

module.exports = { getMediaParentTransform, getMediaRectangle };
