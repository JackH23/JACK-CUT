const TRANSITION_DURATION = 1;

/**
 * Keep a number inside the given range.
 */
function clamp(
  value,
  min = 0,
  max = 1,
) {
  return Math.min(
    Math.max(value, min),
    max,
  );
}

/**
 * Convert the saved animation settings
 * into values that FFmpeg can use.
 *
 * animationAmount:
 *   0   -> strength 0
 *   50  -> strength 0.5
 *   100 -> strength 1
 */
function getClipAnimationConfig(
  clip,
) {
  const preset =
    clip.animationPreset ?? "none";

  const amount = Number(
    clip.animationAmount ?? 50,
  );

  const strength = clamp(
    amount / 100,
  );

  const duration = Math.max(
    0,
    Number(clip.duration ?? 0),
  );

  const transitionDuration =
    Math.min(
      TRANSITION_DURATION,
      duration,
    );

  return {
    preset,
    amount,
    strength,
    transitionDuration,
  };
}

/** Fades, centered zoom and slides evaluated at clip-local time (geq's T).
 * Preserve color and source alpha; amount controls strength, not duration.
 */
function getClipAnimationFilters(clip) {
  const { preset, strength, transitionDuration } = getClipAnimationConfig(clip);
  if (!transitionDuration || strength === 0 ||
      !["fade-in", "fade-out", "zoom-in", "zoom-out", "slide-left", "slide-right"].includes(preset)) return [];
  const duration = Number(clip.duration);
  const localTime = 'clip(T,0,' + duration + ')';
  if (preset === "slide-left" || preset === "slide-right") {
    const progress = 'clip(' + localTime + '/' + transitionDuration + ',0,1)';
    const direction = preset === "slide-left" ? 1 : -1;
    // CSS translateX percentages refer to the full canvas-sized media element.
    // Inverse sampling moves the media, leaving uncovered pixels transparent.
    const offset = 'W*' + (direction * strength) + '*(1-' + progress + ')';
    const x = 'X-(' + offset + ')';
    return [
      "format=yuva444p",
      "geq=lum='lum(" + x + ",Y)':cb='cb(" + x + ",Y)':cr='cr(" + x + ",Y)':a='if(between(" + x + ",-0.5,W-0.5),alpha(" + x + ",Y),0)':enable='lt(t," + transitionDuration + ")'",
    ];
  }
  if (preset === "zoom-in" || preset === "zoom-out") {
    const progress = 'clip(' + localTime + '/' + transitionDuration + ',0,1)';
    const direction = preset === "zoom-in" ? '-' : '+';
    const scale = '(1' + direction + (0.25 * strength) + '*(1-' + progress + '))';
    // Inverse-map each output pixel about the canvas center. Pixel-center
    // coordinates preserve the fixed dimensions and CSS transform origin.
    // 4:4:4 keeps luma, chroma and alpha on the same coordinate grid.
    const x = '(X-(W-1)/2)/' + scale + '+(W-1)/2';
    const y = '(Y-(H-1)/2)/' + scale + '+(H-1)/2';
    const inside = 'between(' + x + ',-0.5,W-0.5)*between(' + y + ',-0.5,H-0.5)';
    // Once the transition finishes, scale is exactly 1: pass frames through
    // instead of resampling every pixel for the rest of a long clip.
    return [
      "format=yuva444p",
      "geq=lum='lum(" + x + "," + y + ")':cb='cb(" + x + "," + y + ")':cr='cr(" + x + "," + y + ")':a='if(" + inside + ",alpha(" + x + "," + y + "),0)':enable='lt(t," + transitionDuration + ")'",
    ];
  }
  const progress = preset === "fade-in"
    ? 'clip(' + localTime + '/' + transitionDuration + ',0,1)'
    : 'clip((' + duration + '-' + localTime + ')/' + transitionDuration + ',0,1)';
  const opacity = '1-' + strength + '*(1-' + progress + ')';
  return [
    "format=yuva444p",
    "geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='alpha(X,Y)*(" + opacity + ")'",
  ];
}

module.exports = {
  getClipAnimationConfig,
  getClipAnimationFilters,
};