const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function load(relative,mocks){const exports={};const source=fs.readFileSync(require.resolve(relative),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('exports','require',code)(exports,name=>{if(!(name in mocks))throw Error('Unexpected dependency '+name);return mocks[name]});return exports;}
const clip={id:'clip',type:'text',text:'Touch fixture',startTime:0,duration:4,sourceStart:0,trackId:'video',startPosition:0,width:10};
test('touch on the clip body selects but cannot start native HTML dragging',()=>{
 let selected=0,moved=0,blocked=false;
 const jsx=(type,props)=>({type,props});
 const {default:Component}=load('../components/editor/timeline/track/TimelineClip.tsx',{'react':{useRef:value=>({current:value})},'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react':{X:'x'},'@/components/shared/LoadingState':{default:'loading'},'./ClipResizeHandle':{default:'resize'},'./ClipMediaPreview':{default:'media'},'./TimelineAnimationRegions':{default:'animation'}});
 const tree=Component({item:clip,selected:false,onSelectItem:()=>selected++,onClipDragStart:()=>moved++});
 tree.props.onPointerDown({pointerType:'touch'});tree.props.onDragStart({preventDefault(){blocked=true}});
 assert.equal(selected,1);assert.equal(blocked,true);assert.equal(moved,0);
 tree.props.onPointerDown({pointerType:'mouse'});tree.props.onDragStart({preventDefault(){throw Error('Mouse drag must remain available')}});assert.equal(moved,1);
});
function pointerFixture(){let state=[clip],saved=[];const target={closest:()=>({getBoundingClientRect:()=>({left:100})}),setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){}};
 const mocks={'react':{useRef:v=>({current:v}),useState:v=>[v,()=>{}]},'next/navigation':{useParams:()=>({projectId:'local-qa'})},'@/services/timelineService':{timelineService:{updateItem:(...args)=>{saved.push(args);return Promise.resolve()}}},'@/lib/timelinePointer':require('../lib/timelinePointer')};
 const {useTimelinePointerMove}=load('../composables/useTimelinePointerMove.ts',mocks);
 const controller=useTimelinePointerMove({items:[clip],displayDuration:60,timelineRef:{current:{getBoundingClientRect:()=>({left:100}),querySelectorAll:()=>[{dataset:{trackId:'audio'},getBoundingClientRect:()=>({top:0,bottom:200})}]}},onItemsChange:update=>{state=update(state)}});
 const event=(type,x)=>({type,clientX:x,clientY:100,pointerId:1,currentTarget:target,preventDefault(){},stopPropagation(){}});
 return {controller,event,get state(){return state},saved};}
test('pointer cancellation restores the original clip and does not save data',()=>{const f=pointerFixture();f.controller.handleClipPointerDown(f.event('pointerdown',140),clip);f.controller.handleClipPointerMove(f.event('pointermove',200));assert.equal(f.state[0].startTime,3);assert.equal(f.state[0].trackId,'video');f.controller.handleClipPointerUp(f.event('pointercancel',200));assert.equal(f.state[0].startTime,0);assert.equal(f.saved.length,0)});
test('explicit move handle commits the correct time/track once on release',()=>{const f=pointerFixture();f.controller.handleClipPointerDown(f.event('pointerdown',140),clip);f.controller.handleClipPointerMove(f.event('pointermove',200));f.controller.handleClipPointerUp(f.event('pointerup',200));f.controller.handleClipPointerUp(f.event('lostpointercapture',200));assert.equal(f.state[0].trackId,'audio');assert.equal(f.saved.length,1);assert.deepEqual(f.saved[0],['clip',{startTime:3,trackId:'audio',duration:4},'local-qa'])});
test('ruler panning suppresses a synthesized click while a tap still seeks after scrolling',()=>{const times=[];const {useTimelinePlayhead}=load('../composables/useTimelinePlayhead.ts',{'react':{useRef:v=>({current:v}),useState:v=>[v,()=>{}]}});const c=useTimelinePlayhead({duration:60,onTimeChange:t=>times.push(t)});c.timelineRef.current={getBoundingClientRect:()=>({left:-100,width:1200})};const event=x=>({clientX:x,clientY:10,target:{closest:()=>null}});c.handleRulerPointerDown(event(100));c.handleRulerPointerMove(event(120));c.handleTimelineClick(event(120));assert.equal(times.length,0);c.handleRulerPointerDown(event(220));c.handleTimelineClick(event(220));assert.deepEqual(times,[16])});
