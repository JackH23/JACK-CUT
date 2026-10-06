import type { Bounds } from "./previewSnapping";

export type MediaTransform = { mediaScale: number; mediaX: number; mediaY: number };
export const mediaResizeHandles = ["top-left", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left"] as const;
export type MediaResizeHandle = typeof mediaResizeHandles[number];
type Options = {
  initial: MediaTransform; handle: MediaResizeHandle; dx: number; dy: number;
  visualWidth: number; visualHeight: number; baseWidth: number; baseHeight: number;
  animationOffset: number; canvas: { width: number; height: number };
};

export function getMediaResizeProposal(options: Options) {
  const { initial, handle, dx, dy, visualWidth: w, visualHeight: h, baseWidth, baseHeight, animationOffset, canvas } = options;
  const sx = handle.includes("left") ? -1 : handle.includes("right") ? 1 : 0;
  const sy = handle.includes("top") ? -1 : handle.includes("bottom") ? 1 : 0;
  let factor = 1;
  if (sx && sy && w*w+h*h > 0) factor += (sx*dx*w+sy*dy*h)/(w*w+h*h);
  else if (sx && w > 0) factor += sx*dx/w;
  else if (sy && h > 0) factor += sy*dy/h;
  const mediaScale = Math.min(2, Math.max(0.1, initial.mediaScale * factor));
  // The opposite corner/edge midpoint remains anchored in the animated view.
  // Side handles change one scale, deriving the other dimension uniformly.
  const derivatives: Bounds = {
    centerX: sx*w/initial.mediaScale/2 - canvas.width*animationOffset/100,
    centerY: sy*h/initial.mediaScale/2,
    width: baseWidth, height: baseHeight,
  };
  const delta = mediaScale-initial.mediaScale;
  const transform = {mediaScale, mediaX:initial.mediaX+derivatives.centerX*delta, mediaY:initial.mediaY+derivatives.centerY*delta};
  const bounds = {centerX:canvas.width/2+transform.mediaX,centerY:canvas.height/2+transform.mediaY,width:baseWidth*mediaScale,height:baseHeight*mediaScale};
  return {transform,bounds,derivatives,sx,sy};
}
