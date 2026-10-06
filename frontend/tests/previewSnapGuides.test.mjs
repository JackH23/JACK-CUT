import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import {createRequire} from "node:module";
import {renderToStaticMarkup} from "react-dom/server";
import {createElement} from "react";
const require=createRequire(import.meta.url);
const source=fs.readFileSync(new URL("../components/editor/PreviewSnapGuides.tsx",import.meta.url),"utf8");
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const loaded={exports:{}};
new Function("require","exports",code)(name=>name==="@/lib/textLayout.json"?require("../lib/textLayout.json"):require(name),loaded.exports);
const render=(vertical,horizontal)=>renderToStaticMarkup(createElement(loaded.exports.default,{vertical,horizontal}));
test("no active snap means no guide DOM",()=>assert.equal(render([],[]),""));
test("center X is vertical at 50%, dashed and inert",()=>{
 const html=render([320],[]);assert.match(html,/left:50%/);assert.match(html,/to bottom/);assert.match(html,/pointer-events-none/);assert.doesNotMatch(html,/data-snap-y/);
});
test("center Y is horizontal at 50%, not bottom",()=>{
 const html=render([],[180]);assert.match(html,/top:50%/);assert.match(html,/to right/);assert.doesNotMatch(html,/top:100%/);
});
test("exact center renders both independent axes",()=>{
 const html=render([320],[180]);assert.match(html,/data-snap-x="320"/);assert.match(html,/data-snap-y="180"/);
});
test("edges use 0/100 percent with far border inside clipping",()=>{
 const html=render([0,640],[0,360]);for(const value of ["left:0%","left:100%","top:0%","top:100%","translateX(-2px)","translateY(-2px)"]) assert.ok(html.includes(value));
});
