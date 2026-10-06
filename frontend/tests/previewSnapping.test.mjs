import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const code=ts.transpileModule(fs.readFileSync(new URL("../lib/previewSnapping.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const loaded={exports:{}}; new Function("exports",code)(loaded.exports);
const {getPreviewSnapResult:snap,getPreviewSnapThreshold:threshold,getPreviewResizeSnapResult:resize}=loaded.exports;
const canvas={width:640,height:360}, tolerance={x:8,y:8};
const bounds=(x,y,w=100,h=60)=>({centerX:x,centerY:y,width:w,height:h});
for(const [name,b,vertical,horizontal,dx,dy] of [
 ["center X",bounds(325,100),[320],[],-5,0],
 ["center Y",bounds(200,175),[],[180],0,5],
 ["both axes",bounds(317,183),[320],[180],3,-3],
 ["left",bounds(55,100),[0],[],-5,0],
 ["right",bounds(585,100),[640],[],5,0],
 ["top",bounds(200,35),[],[0],0,-5],
 ["bottom",bounds(200,325),[],[360],0,5],
 ["outside threshold",bounds(200,100),[],[],0,0],
 ["nearest edge wins",bounds(325,100,648),[0],[],-1,0],
 ["tie prefers center",bounds(324,100,656),[320],[],-4,0],
]) test(name,()=>assert.deepEqual(snap(b,canvas,tolerance),{x:dx,y:dy,bounds:{...b,centerX:b.centerX+dx,centerY:b.centerY+dy},vertical,horizontal}));
test("8 displayed pixels at either viewport",()=>{
 for(const display of [{width:320,height:180},{width:960,height:540}]) {
  const t=threshold(canvas,display);
  assert.ok(Math.abs(t.x*display.width/640-8)<1e-9);
  assert.ok(Math.abs(t.y*display.height/360-8)<1e-9);
  assert.deepEqual(snap(bounds(320+7*640/display.width,100),canvas,t).vertical,[320]);
  assert.deepEqual(snap(bounds(320+9*640/display.width,100),canvas,t).vertical,[]);
 }
});
test("resize preserves one scale and reports only aligned axes",()=>{
 const result=resize(bounds(200,100,230,100),canvas,tolerance,1,1,1,bounds(100,50,230,100));
 assert.ok(Math.abs(result.scale-(1+5/215))<1e-9);
 assert.deepEqual(result.vertical,[320]);assert.deepEqual(result.horizontal,[]);
});
test("resize refuses zero and excessive scales",()=>{
 const result=resize(bounds(300,100,30,60),canvas,tolerance,.1,1,1,bounds(-1,0,0,60));
 assert.ok(result.scale>=.1 && result.scale<=2);
});
test("base bounds do not contain animated offset",()=>assert.deepEqual(snap(bounds(320,180),canvas,tolerance),{x:0,y:0,bounds:bounds(320,180),vertical:[320],horizontal:[180]}));

test("exactly threshold snaps and returns matching bounds/guide",()=>{
 const result=snap(bounds(58,100),canvas,tolerance);assert.equal(result.bounds.centerX-result.bounds.width/2,0);assert.deepEqual(result.vertical,[0]);
});
test("side resize does not snap an inactive axis",()=>{
 const result=resize(bounds(200,180,230,100),canvas,tolerance,1,1,0,bounds(115,0,230,100));assert.deepEqual(result.horizontal,[]);assert.deepEqual(result.vertical,[320]);assert.equal(result.bounds.centerX+result.bounds.width/2,320);
});
