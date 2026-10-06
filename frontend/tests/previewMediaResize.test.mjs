import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
function load(name){const code=ts.transpileModule(fs.readFileSync(new URL("../lib/"+name+".ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;const loaded={exports:{}};new Function("exports",code)(loaded.exports);return loaded.exports;}
const {getMediaResizeProposal:propose,mediaResizeHandles:handles}=load("previewMediaResize");
const {getPreviewResizeSnapResult:snap}=load("previewSnapping");
const canvas={width:640,height:360};
function fixture(handle,dx,dy,extra={}) {return {initial:{mediaScale:1,mediaX:0,mediaY:0},handle,dx,dy,visualWidth:200,visualHeight:100,baseWidth:200,baseHeight:100,animationOffset:0,canvas,...extra};}
for(const handle of handles) test(handle+" outward/inward preserves aspect and opposite anchor",()=>{
 const sx=handle.includes("left")?-1:handle.includes("right")?1:0;
 const sy=handle.includes("top")?-1:handle.includes("bottom")?1:0;
 for(const factor of [1.2,.8]) {
  const r=propose(fixture(handle,sx*200*(factor-1),sy*100*(factor-1)));
  assert.ok(Math.abs(r.transform.mediaScale-factor)<1e-9);
  assert.equal(r.bounds.width/r.bounds.height,2);
  assert.ok(Math.abs(r.bounds.centerX-sx*r.bounds.width/2-(320-sx*100))<1e-9);
  assert.ok(Math.abs(r.bounds.centerY-sy*r.bounds.height/2-(180-sy*50))<1e-9);
 }
});
for(const handle of handles) test(handle+" minimum cannot invert",()=>{
 const sx=handle.includes("left")?-1:handle.includes("right")?1:0;
 const sy=handle.includes("top")?-1:handle.includes("bottom")?1:0;
 const r=propose(fixture(handle,-sx*10000,-sy*10000));
 assert.equal(r.transform.mediaScale,.1);assert.ok(r.bounds.width>0&&r.bounds.height>0);assert.ok(Object.values(r.transform).every(Number.isFinite));
});
for(const [handle,x,y,dx,dy,vertical,horizontal] of [
 ["right",190,0,55,0,[640],[]], ["left",-190,0,-55,0,[0],[]],
 ["top",0,-115,0,-27.5,[],[0]], ["bottom",0,115,0,27.5,[],[360]],
 ["bottom-right",190,115,55,27.5,[640],[360]],
 ["top-right",190,-115,55,-27.5,[640],[0]],
 ["bottom-left",-190,115,-55,27.5,[0],[360]],
 ["top-left",-190,-115,-55,-27.5,[0],[0]],
]) test(handle+" snaps manipulated edges and returns bounds with guides",()=>{
 const r=propose(fixture(handle,dx,dy,{initial:{mediaScale:.7,mediaX:x,mediaY:y},visualWidth:140,visualHeight:70}));
 const result=snap(r.bounds,canvas,{x:8,y:8},r.transform.mediaScale,r.sx,r.sy,r.derivatives);
 assert.ok(Math.abs(result.scale-1)<1e-9);assert.equal(result.bounds.width/result.bounds.height,2);
 assert.deepEqual(result.vertical,vertical);assert.deepEqual(result.horizontal,horizontal);
 if(vertical.length)assert.ok(Math.abs(result.bounds.centerX+r.sx*result.bounds.width/2-vertical[0])<1e-9);
 if(horizontal.length)assert.ok(Math.abs(result.bounds.centerY+r.sy*result.bounds.height/2-horizontal[0])<1e-9);
});
test("side resize ignores perpendicular pointer motion",()=>{
 assert.deepEqual(propose(fixture("right",20,100)),propose(fixture("right",20,0)));
 assert.deepEqual(propose(fixture("top",100,-20)),propose(fixture("top",0,-20)));
});
test("degenerate unloaded dimensions remain finite",()=>{
 const r=propose(fixture("top-left",-10,-10,{visualWidth:0,visualHeight:0}));assert.ok(Object.values(r.transform).every(Number.isFinite));
});
test("animation slide compensation preserves the opposite visual midpoint",()=>{
 const options=fixture("right",30,0,{animationOffset:40,visualWidth:160,visualHeight:80});
 const r=propose(options);
 const before=320+640*.4-80;
 const after=320+r.transform.mediaX+640*.4*r.transform.mediaScale-80*r.transform.mediaScale;
 assert.ok(Math.abs(before-after)<1e-9);
});
