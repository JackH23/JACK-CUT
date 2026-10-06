export type Bounds = { centerX: number; centerY: number; width: number; height: number };
export type Guides = { vertical: number[]; horizontal: number[] };
type Canvas = { width: number; height: number };
export const SNAP_DISPLAY_PIXELS = 8;
export function getPreviewSnapThreshold(canvas: Canvas, display: Canvas) {
  return { x: SNAP_DISPLAY_PIXELS * canvas.width / display.width, y: SNAP_DISPLAY_PIXELS * canvas.height / display.height };
}
function nearest(candidates: { correction: number; guide: number }[], threshold: number) {
  return candidates.filter(c => Math.abs(c.correction) <= threshold).sort((a,b) => Math.abs(a.correction)-Math.abs(b.correction))[0];
}
export function getPreviewSnapResult(bounds: Bounds, canvas: Canvas, threshold: {x:number;y:number}) {
  const x = nearest([
    { correction: canvas.width/2-bounds.centerX, guide: canvas.width/2 },
    { correction: -bounds.centerX+bounds.width/2, guide: 0 },
    { correction: canvas.width-bounds.centerX-bounds.width/2, guide: canvas.width },
  ], threshold.x);
  const y = nearest([
    { correction: canvas.height/2-bounds.centerY, guide: canvas.height/2 },
    { correction: -bounds.centerY+bounds.height/2, guide: 0 },
    { correction: canvas.height-bounds.centerY-bounds.height/2, guide: canvas.height },
  ], threshold.y);
  return { x: x?.correction ?? 0, y: y?.correction ?? 0, bounds: { ...bounds, centerX: bounds.centerX + (x?.correction ?? 0), centerY: bounds.centerY + (y?.correction ?? 0) }, vertical: x ? [x.guide] : [], horizontal: y ? [y.guide] : [] };
}
// Resize has one uniform scale degree of freedom. Snap the nearest moving edge,
// then report only axes that actually align after that single scale correction.
export function getPreviewResizeSnapResult(bounds: Bounds, canvas: Canvas, threshold: {x:number;y:number}, scale: number, sx:number, sy:number, derivatives: Bounds) {
  const edgeX = bounds.centerX + sx*bounds.width/2;
  const edgeY = bounds.centerY + sy*bounds.height/2;
  const slopeX = derivatives.centerX + sx*derivatives.width/2;
  const slopeY = derivatives.centerY + sy*derivatives.height/2;
  const candidates: {scale:number;distance:number}[] = [];
  for (const [edge,slope,size,tolerance,active] of [[edgeX,slopeX,canvas.width,threshold.x,sx],[edgeY,slopeY,canvas.height,threshold.y,sy]]) {
    if (!active || Math.abs(slope)<1e-9) continue;
    for (const target of [size/2,0,size]) {
      const distance=Math.abs(target-edge);
      const nextScale=scale+(target-edge)/slope;
      if (distance<=tolerance && nextScale>=0.1 && nextScale<=2) candidates.push({scale:nextScale,distance:distance/tolerance});
    }
  }
  const nextScale=candidates.sort((a,b)=>a.distance-b.distance)[0]?.scale ?? scale;
  const delta=nextScale-scale;
  const vertical=(sx ? [canvas.width/2,0,canvas.width] : []).filter(t=>Math.abs(edgeX+slopeX*delta-t)<1e-6);
  const horizontal=(sy ? [canvas.height/2,0,canvas.height] : []).filter(t=>Math.abs(edgeY+slopeY*delta-t)<1e-6);
  return {scale:nextScale,bounds:{centerX:bounds.centerX+derivatives.centerX*delta,centerY:bounds.centerY+derivatives.centerY*delta,width:bounds.width+derivatives.width*delta,height:bounds.height+derivatives.height*delta},vertical,horizontal};
}
