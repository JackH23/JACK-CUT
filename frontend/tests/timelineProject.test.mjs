import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const frontend=path.resolve(import.meta.dirname,'..');
function load(file,deps,base='http://localhost:5001') {
 const loadedModule={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(frontend,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','module','exports','process',code)(name=>{assert(name in deps,name);return deps[name];},loadedModule,loadedModule.exports,{env:{NEXT_PUBLIC_API_URL:base}});
 return loadedModule.exports;
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

const clip = (id, startTime = 0, duration = 5) => ({id, type:'text', trackId:'titles', startTime, duration});
test('stale load cannot restore deletion; repeated success cannot duplicate IDs',()=>{
 const {timelineReducer:reduce,initialTimelineState:initial}=load('reducers/timelineReducer.ts',{});
 let state=reduce(initial,{type:'LOAD_ITEMS_SUCCESS',payload:[clip('a'),clip('b',5)]});
 state=reduce(state,{type:'REMOVE_ITEM',payload:'a'});
 state=reduce(state,{type:'LOAD_ITEMS_SUCCESS',payload:[clip('a'),clip('b',5)]});
 assert.deepEqual(state.items.map(i=>i.id),['b']);
 state=reduce(state,{type:'ADD_ITEM_SUCCESS',payload:clip('b',10)});
 assert.equal(state.items.length,1);assert.equal(state.items[0].startTime,10);
 state=reduce(state,{type:'LOAD_ITEMS_START'});assert.equal(state.loaded,false);
 state=reduce(state,{type:'LOAD_ITEMS_SUCCESS',payload:[clip('b',10)]});assert.equal(state.loaded,true);
});
test('text creation uses playhead, skips occupied slots, normalizes saved times, and suppresses concurrent requests',async()=>{
 const actions=[],calls=[];let release;
 const hooks={useCallback:fn=>fn,useLayoutEffect:fn=>fn(),useRef:v=>({current:v})};
 const service={addItem:input=>{calls.push(input);return new Promise(resolve=>{release=()=>resolve({item:{id:'saved',track_id:input.trackId,start_time:String(input.startTime),duration:'5'}});});}};
 const {useAddText}=load('composables/useAddText.ts',{react:hooks,'@/services/timelineService':{timelineService:service}});
 const selected=[];const props={onSelectItem:id=>selected.push(id),projectId:'project',playheadTime:3,ready:true,tracks:[{id:'titles',name:'V3 Titles'}],timelineItems:[clip('a',0,5),clip('b',7,5)],dispatch:a=>actions.push(a)};
 const editor=useAddText(props);const pending=editor.handleAddText('title');await editor.handleAddText('title');
 assert.equal(calls.length,1);assert.equal(calls[0].startTime,12);assert.equal(calls[0].duration,5);assert.equal(calls[0].trackId,'titles');
 release();await pending;assert.deepEqual(selected,['saved']);assert.equal(actions.at(-1).payload.startTime,12);assert.equal(actions.at(-1).payload.duration,5);assert.equal(actions.at(-1).payload.id,'saved');
 const second=editor.handleAddText('title');assert.equal(calls[1].startTime,17);release();await second;
 const blocked=useAddText({...props,ready:false});await blocked.handleAddText('title');assert.equal(calls.length,2);
 const empty=useAddText({...props,playheadTime:23,timelineItems:[]});const third=empty.handleAddText('title');assert.equal(calls[2].startTime,23);release();await third;
});
test('failed text creation releases guard for retry without inserting a clip',async()=>{
 let attempts=0;const actions=[];
 const {useAddText}=load('composables/useAddText.ts',{react:{useCallback:fn=>fn,useLayoutEffect:fn=>fn(),useRef:v=>({current:v})},'@/services/timelineService':{timelineService:{addItem:async()=>{attempts++;throw new Error('offline');}}}});
 const editor=useAddText({projectId:'project',playheadTime:0,ready:true,tracks:[{id:'titles',name:'V3 Titles'}],timelineItems:[],dispatch:a=>actions.push(a)});
 await editor.handleAddText('title');await editor.handleAddText('title');assert.equal(attempts,2);assert(!actions.some(a=>a.type==='ADD_ITEM_SUCCESS'));
});
test('delete guard is shared by callers and failures retain dragged/resized clip for retry',async()=>{
 const actions=[],requests=[];let reject,resolve;
 const item=clip('moved',37,8);
 const noop=()=>({});const hooks={useCallback:fn=>fn,useMemo:fn=>fn(),useRef:v=>({current:v}),useState:v=>[v,()=>{}],useReducer:()=>[{items:[item]},a=>actions.push(a)]};
 const deps={react:hooks,'@/composables/useTimeline':{useTimeline:()=>({tracks:[]})},'@/composables/useAddText':{useAddText:noop},'@/composables/useTimelineClipboard':{useTimelineClipboard:noop},'@/composables/useAddMedia':{useAddMedia:noop},'@/composables/useTextEditor':{useTextEditor:noop},'@/composables/useLoadTimeline':{useLoadTimeline:noop},'@/composables/useAnimationEditor':{useAnimationEditor:noop},'@/reducers/timelineReducer':{initialTimelineState:{},timelineReducer:noop},'@/services/timelineService':{timelineService:{removeItem:(...args)=>{requests.push(args);return new Promise((yes,no)=>{resolve=yes;reject=no;});}}}};
 const editor=load('composables/useEditorTimeline.ts',deps).useEditorTimeline('project');
 const first=editor.handleRemoveTimelineItem('moved');await editor.handleRemoveTimelineItem('moved');assert.equal(requests.length,1);reject(new Error('offline'));await first;
 assert.equal(actions.at(-1).type,'REMOVE_ITEM_ERROR');assert(!actions.some(a=>a.type==='REMOVE_ITEM'));
 const retry=editor.handleRemoveTimelineItem('moved');resolve();await retry;assert.deepEqual(actions.at(-1),{type:'REMOVE_ITEM',payload:'moved'});assert.deepEqual(requests[1],['moved','project']);await editor.handleRemoveTimelineItem('moved');assert.equal(requests.length,2);
});

function findElement(node,predicate) {
 if(!node || typeof node!=='object') return null;
 if(predicate(node)) return node;
 for(const child of [node.props?.children].flat(Infinity)) {const match=findElement(child,predicate);if(match)return match;}
 return null;
}
const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
test('settings Delete calls removal only for the displayed clip and stops propagation',()=>{
 const calls=[];const component=load('components/editor/SettingsPanel.tsx',{
 'react/jsx-runtime':jsx,'lucide-react':{Copy:'Copy',RotateCcw:'RotateCcw',Trash2:'Trash2',Type:'Type'},
 './SettingsContent':{default:'SettingsContent'},'@/lib/types':{SETTINGS_TABS:[]},'@/composables/useSettingsPanel':{useSettingsPanel:()=>({})}
 }).default;
 const tree=component({activeItem:clip('chosen'),onDuplicate:()=>calls.push('duplicate'),onRemoveItem:id=>calls.push(id)});
 const button=findElement(tree,n=>n.type==='button' && n.props.children.includes('Delete'));
 assert(button);const events=[];button.props.onClick({preventDefault:()=>events.push('prevent'),stopPropagation:()=>events.push('stop')});assert.deepEqual(calls,['chosen']);assert.deepEqual(events,['prevent','stop']);
});
test('timeline X uses its own clip ID and cannot bubble to parent click',()=>{
 const calls=[];const component=load('components/editor/timeline/track/TimelineClip.tsx',{
 'react/jsx-runtime':jsx,'lucide-react':{X:'X'},'@/components/shared/LoadingState':{default:'Loading'},
 './ClipResizeHandle':{default:'Resize'},'./ClipMediaPreview':{default:'Preview'},'./TimelineAnimationRegions':{default:'Animations'}
 }).default;
 const tree=component({item:clip('target'),selected:false,onSelectItem:id=>calls.push('select '+id),onRemoveClick:(e,id)=>calls.push(id)});
 const button=findElement(tree,n=>n.type==='button');const events=[];button.props.onClick({preventDefault:()=>events.push('prevent'),stopPropagation:()=>events.push('stop')});assert.deepEqual(calls,['target']);assert.deepEqual(events,['prevent','stop']);
});
