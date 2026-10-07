import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const frontend=path.resolve(import.meta.dirname,'..');
function load(file,deps,base='http://localhost:5001') {
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(frontend,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','module','exports','process',code)(name=>{assert(name in deps,name);return deps[name];},module,module.exports,{env:{NEXT_PUBLIC_API_URL:base}});
 return module.exports;
}
for(const base of ['http://localhost:5001','https://backend.example.trycloudflare.com'])test('timeline mutation query format on '+base,async()=>{
 const calls=[];const api={delete:async(...args)=>{calls.push(['DELETE',...args]);return {data:{id:'item'}};},patch:async(...args)=>{calls.push(['PATCH',...args]);return {data:{item:{}}};},post:async(...args)=>{calls.push(['POST',...args]);return {data:{item:{}}};}};
 const service=load('services/timelineService.ts',{'./api':{api}},base).timelineService;
 await service.removeItem('item /','project');await service.updateItem('item /',{startTime:2,duration:3},'project');await service.addItem({projectId:'project',itemType:'TEXT'});
 assert.deepEqual(calls[0],['DELETE',base+'/api/timeline/items/item%20%2F',{params:{projectId:'project'}}]);
 assert.deepEqual(calls[1],['PATCH',base+'/api/timeline/items/item%20%2F',{startTime:2,duration:3},{params:{projectId:'project'}}]);
 assert.equal(calls[2][2].projectId,'project');
});
test('editor deletion passes current project and removes local item only after successful response',async()=>{
 const requests=[],actions=[];const item={id:'clip',type:'text',startTime:0,duration:1,trackId:'track'};
 const noop=()=>({});const hooks={useCallback:fn=>fn,useMemo:fn=>fn(),useRef:v=>({current:v}),useState:v=>[v,()=>{}],useReducer:()=>[{items:[item]},action=>actions.push(action)]};
 const deps={react:hooks,'@/composables/useTimeline':{useTimeline:()=>({tracks:[]})},'@/composables/useAddText':{useAddText:noop},'@/composables/useTimelineClipboard':{useTimelineClipboard:noop},'@/composables/useAddMedia':{useAddMedia:noop},'@/composables/useTextEditor':{useTextEditor:noop},'@/composables/useLoadTimeline':{useLoadTimeline:noop},'@/composables/useAnimationEditor':{useAnimationEditor:noop},'@/reducers/timelineReducer':{initialTimelineState:{},timelineReducer:noop},'@/services/timelineService':{timelineService:{removeItem:async(...args)=>requests.push(args)}}};
 const editor=load('composables/useEditorTimeline.ts',deps).useEditorTimeline('current-project');
 await editor.handleRemoveTimelineItem('clip');assert.deepEqual(requests,[['clip','current-project']]);assert.deepEqual(actions,[{type:'REMOVE_ITEM',payload:'clip'}]);
});
test('every timeline mutation caller explicitly supplies projectId',()=>{
 for(const file of ['useEditorTimeline.ts','useTimelineClipboard.ts','useTextEditor.ts','useAnimationEditor.ts','useTimelineDrag.ts','useTimelineResize.ts']) {
  const source=ts.createSourceFile(file,fs.readFileSync(path.join(frontend,'composables',file),'utf8'),ts.ScriptTarget.Latest,true);
  function visit(node){if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(source)==='timelineService'&&['removeItem','updateItem'].includes(node.expression.name.text)){assert.equal(node.arguments.at(-1).getText(source),'projectId',file);assert.equal(node.arguments.length,node.expression.name.text==='removeItem'?2:3,file);}ts.forEachChild(node,visit);}visit(source);
 }
});
