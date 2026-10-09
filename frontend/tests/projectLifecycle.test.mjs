import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
const root=path.resolve(import.meta.dirname,'..');
function load(file,deps,globals={}) {
 const loaded={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports','process',...Object.keys(globals),code)(name=>{assert.ok(name in deps,name);return deps[name];},loaded,loaded.exports,{env:{NEXT_PUBLIC_API_URL:'http://localhost:5001'}},...Object.values(globals));
 return loaded.exports;
}
function hooks() {
 const cells=[],effects=[];let cursor=0;
 const react={
  useState(initial){const i=cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return[cells[i],next=>{cells[i]=typeof next==='function'?next(cells[i]):next;}];},
  useReducer(reducer,initial){const i=cursor++;if(!(i in cells))cells[i]=initial;return[cells[i],action=>{cells[i]=reducer(cells[i],action);}];},
  useRef(initial){const i=cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
  useCallback:fn=>fn,
  useEffect(fn,deps){const i=cursor++;if(!cells[i]||deps.some((dep,j)=>!Object.is(dep,cells[i].deps[j]))){cells[i]?.cleanup?.();effects.push(()=>{cells[i]={deps,cleanup:fn()};});}},
 };
 return{react,render:fn=>{cursor=0;const result=fn();effects.splice(0).forEach(effect=>effect());return result;}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const axios={isAxiosError:error=>Boolean(error?.axiosError)};
function projectHook(service={}) {
 const runner=hooks(),routes=[],router={replace:route=>routes.push(['replace',route]),push:route=>routes.push(['push',route])};
 const reducer=load('reducers/projectsReducer.ts',{});
 const useProjects=load('composables/useProjectsPage.ts',{react:runner.react,'next/navigation':{useRouter:()=>router},axios,'@/services/projectService':{projectService:{getAll:async()=>[{id:'one',name:'One'}],...service}},'@/reducers/projectsReducer':reducer}).useProjectsPage;
 return{render:()=>runner.render(useProjects),routes};
}
test('project load and modal cancel never send DELETE',async()=>{
 let deletes=0;const h=projectHook({delete:async()=>{deletes++;}});h.render();await settle();let view=h.render();assert.equal(view.projects.length,1);
 view.requestDelete(view.projects[0]);view=h.render();assert.equal(view.projectToDelete.id,'one');view.cancelDelete();view=h.render();assert.equal(view.projectToDelete,null);assert.equal(deletes,0);
});
test('confirm waits for success, blocks duplicate requests and disables deletion until settlement',async()=>{
 let release,deletes=0;const h=projectHook({delete:()=>{deletes++;return new Promise(resolve=>{release=resolve;});}});h.render();await settle();let view=h.render();view.requestDelete(view.projects[0]);view=h.render();
 const request=view.confirmDelete();await view.confirmDelete();view=h.render();assert.equal(view.deleting,true);assert.equal(view.projects.length,1);assert.equal(deletes,1);view.cancelDelete();assert.ok(h.render().projectToDelete);
 release({});await request;view=h.render();assert.equal(view.projects.length,0);assert.equal(view.projectToDelete,null);assert.equal(view.deleting,false);
});
for(const status of [401,403,404,409,500])test('project deletion HTTP '+status+' retains the project and handles error/session',async()=>{
 const h=projectHook({delete:async()=>{throw{axiosError:true,response:{status,data:{message:'Failure '+status}}};}});h.render();await settle();let view=h.render();view.requestDelete(view.projects[0]);view=h.render();await view.confirmDelete();view=h.render();assert.equal(view.projects.length,1);assert.equal(view.deleting,false);
 if(status===401)assert.deepEqual(h.routes,[['replace','/login']]);else{assert.equal(view.error,'Failure '+status);assert.ok(view.projectToDelete);}
});
test('create trims name, blocks duplicate requests and navigates on success',async()=>{
 let release,creates=0;const h=projectHook({create:name=>{assert.equal(name,'Video');creates++;return new Promise(resolve=>{release=resolve;});}});h.render();await settle();let view=h.render();view.setName(' Video ');view=h.render();const event={preventDefault(){}};const request=view.handleCreate(event);await view.handleCreate(event);assert.equal(creates,1);release({id:'new'});await request;assert.deepEqual(h.routes,[['push','/editor/new']]);
});
test('list and create HTTP 401 route to login',async()=>{
 const cause={axiosError:true,response:{status:401}};const list=projectHook({getAll:async()=>{throw cause;}});list.render();await settle();assert.deepEqual(list.routes,[['replace','/login']]);
 const create=projectHook({create:async()=>{throw cause;}});create.render();await settle();let view=create.render();view.setName('Video');view=create.render();await view.handleCreate({preventDefault(){}});assert.deepEqual(create.routes,[['replace','/login']]);
});
test('project service uses shared authenticated API with encoded IDs',async()=>{
 const calls=[];const api={get:async url=>{calls.push(['GET',url]);return{data:{project:{id:'one'},projects:[]}};},post:async(url,body)=>{calls.push(['POST',url,body]);return{data:{project:{id:'one'}}};},delete:async url=>{calls.push(['DELETE',url]);return{data:{projectId:'one'}};}};
 const service=load('services/projectService.ts',{'./api':{api}}).projectService;await service.getAll();await service.getProjectById('one /');await service.create('Video');await service.delete('one /');
 assert.deepEqual(calls,[['GET','/projects'],['GET','/projects/one%20%2F'],['POST','/projects',{name:'Video'}],['DELETE','/projects/one%20%2F']]);
});
test('delete errors are visible inside the modal and controls are disabled without changing layout',()=>{
 const props={name:'',setName(){},projects:[{id:'one',name:'One'}],loading:false,creating:false,error:'Active export prevents deletion',handleCreate(){},projectToDelete:{id:'one',name:'One'},deleting:true,requestDelete(){},cancelDelete(){},confirmDelete(){}};
 const componentDeps={react:React,'react/jsx-runtime':jsxRuntime,'next/link':()=>null,'lucide-react':{ArrowLeft:()=>null,ArrowRight:()=>null,Clapperboard:()=>null,FolderOpen:()=>null,Plus:()=>null,Video:()=>null,LoaderCircle:()=>null,Trash2:()=>null}};
 const components=Object.fromEntries(['ProjectsHeader','CreateProject','ExistingProjects','DeleteProjectModal'].map(name=>['@/components/projects/'+name,load('components/projects/'+name+'.tsx',componentDeps).default]));
 const realComponent=load('app/projects/page.tsx',{react:React,'react/jsx-runtime':jsxRuntime,'next/link':()=>null,'next/navigation':{useSearchParams:()=>new URLSearchParams()},'lucide-react':{ArrowLeft:()=>null,ArrowRight:()=>null,Clapperboard:()=>null,FolderOpen:()=>null,Plus:()=>null,Video:()=>null,LoaderCircle:()=>null,Trash2:()=>null},'@/composables/useProjectsPage':{useProjectsPage:()=>props},'@/components/shared/LoadingSkeleton':()=>null,...components}).default;
 const html=renderToStaticMarkup(React.createElement(realComponent));
 assert.match(html,/inert=""/);assert.match(html,/role="alertdialog"/);assert.ok(html.indexOf('Active export prevents deletion')>html.indexOf('role="alertdialog"'));assert.match(html,/disabled=""/);assert.match(html,/bg-\[#191b25\]/);
});
for(const job of [{id:'one',status:'completed',downloadUrl:null},{id:'one',status:'completed',downloadAvailable:false,downloadUrl:'/file'}])test('expired completed export does not create a fallback download URL '+JSON.stringify(job),()=>{
 const useExport=load('composables/useExportVideo.ts',{react:{useReducer:()=>[{job},()=>{}],useRef:v=>({current:v}),useEffect(){},useCallback:fn=>fn},axios,'@/services/exportService':{exportService:{getDownloadUrl:()=>{assert.fail('Expired URL fallback');}}},'@/reducers/exportReducer':{exportReducer(){},initialExportState:{}}}).useExportVideo;
 assert.equal(useExport().downloadUrl,null);
});

function exportPollingHarness(service) {
 const runner=hooks(),timers=new Map(); let nextTimer=0;
 const reducer=load('reducers/exportReducer.ts',{});
 const useExport=load('composables/useExportVideo.ts',{
  react:runner.react,axios,'@/services/exportService':{exportService:service},'@/reducers/exportReducer':reducer,
 },{setTimeout:fn=>{const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)}).useExportVideo;
 return{render:()=>runner.render(useExport),timers, tick:async()=>{const [id,fn]=timers.entries().next().value;timers.delete(id);await fn();}};
}
for(const status of ['cancelled','failed','completed'])test('export polling stops for '+status+' and keeps appropriate error/download state',async()=>{
 let polls=0;
 const h=exportPollingHarness({
  create:async()=>({id:'export',status:'processing'}),
  get:async()=>{polls++;return{id:'export',status,error:status==='failed'?'Real FFmpeg failure':null,downloadUrl:status==='completed'?'/download':null};},
  getDownloadUrl:()=>'/fallback',
 });
 let view=h.render();await view.startExport('project');view=h.render();assert.equal(h.timers.size,1);
 await h.tick();view=h.render();assert.equal(h.timers.size,0);assert.equal(polls,1);
 assert.equal(view.exporting,false);assert.equal(view.exportJob.status,status);
 assert.equal(view.exportError,status==='failed'?'Real FFmpeg failure':null);
 assert.equal(view.downloadUrl,status==='completed'?'http://localhost:5001/download':null);
});
for(const reject of [false,true])test('late cancellation '+(reject?'error':'acknowledgement')+' cannot overwrite a polled terminal state',async()=>{
 let settleCancel;
 const h=exportPollingHarness({
  create:async()=>({id:'export',status:'processing'}),
  cancel:()=>new Promise((resolve,rejectPromise)=>{settleCancel=()=>reject?rejectPromise(Error('late failure')):resolve({status:'processing'});}),
  get:async()=>({id:'export',status:'cancelled',error:null,downloadUrl:null}),getDownloadUrl:()=>'/fallback',
 });
 await h.render().startExport('project');let view=h.render();const cancellation=view.cancelExport();h.render();
 await h.tick();view=h.render();assert.equal(view.exportJob.status,'cancelled');
 settleCancel();await cancellation;view=h.render();assert.equal(view.cancelling,false);assert.equal(view.exportError,null);assert.equal(h.timers.size,0);
});
test('reducer ignores cancellation callbacks after completion',()=>{
 const {exportReducer}=load('reducers/exportReducer.ts',{});
 const state={job:{id:'export',status:'completed'},loading:false,cancelling:false,error:null};
 assert.equal(exportReducer(state,{type:'EXPORT_CANCEL_REQUESTED'}),state);
 assert.equal(exportReducer(state,{type:'EXPORT_CANCEL_ERROR',payload:'late'}),state);
});
test('editor renders Export cancelled without error/success modal or download button',()=>{
 const empty=()=>null;
 const deps={
  '@/lib/export':load('lib/export.ts',{}),
  'next/link':{__esModule:true,default:empty},
  react:{...React,use:()=>({projectId:'project'})},
  '@/composables/useEditorProject':{useEditorProject:()=>({project:{id:'project',name:'Project'},error:null})},
  '@/composables/useEditorWorkspace':{useEditorWorkspace:()=>({exportJob:{id:'export',status:'cancelled'},exporting:false,cancelling:false,exportError:null,timelineError:null,downloadUrl:null,showExportSuccess:false,timelineItems:[]})},
  'react/jsx-runtime':jsxRuntime,
 };
 const imports=fs.readFileSync(path.join(root,'app/editor/[projectId]/page.tsx'),'utf8').matchAll(/from "(@\/components\/[^"]+)"/g);
 for(const [,name] of imports)deps[name]={__esModule:true,default:name.endsWith('ErrorModal')?()=>React.createElement('div',null,'Unexpected error modal'):name.endsWith('ExportSuccessModal')?()=>React.createElement('div',null,'Unexpected success modal'):empty};
 const Page=load('app/editor/[projectId]/page.tsx',deps).default;
 const html=renderToStaticMarkup(React.createElement(Page,{params:Promise.resolve({projectId:'project'})}));
 assert.match(html,/role="status"[^>]*>Export cancelled/);
 assert.doesNotMatch(html,/Something went wrong|Unexpected .* modal|Download MP4/);
});
for (const kind of ['Login', 'Register']) test(kind + ' authenticated success continues to home', async () => {
  const runner = hooks(), routes = [], router = { replace: route => routes.push(route) };
  const reducerName = kind.toLowerCase();
  const serviceName = reducerName;
  const hook = load('composables/use' + kind + '.ts', {
    react: runner.react,
    'next/navigation': { useRouter: () => router },
    axios,
    '@/services/authService': { authService: { [serviceName]: async () => ({ id: 'user' }) } },
    ['@/reducers/' + reducerName + 'Reducer']: load('reducers/' + reducerName + 'Reducer.ts', {}),
  })['use' + kind];
  let view = runner.render(hook);
  view.setEmail('test@example.com');
  view.setPassword('verification-password');
  if (kind === 'Register') {
    view.setName('Test');
    view.setConfirmPassword('verification-password');
  }
  view = runner.render(hook);
  await view.handleSubmit({ preventDefault() {} });
  view = runner.render(hook);
  assert.equal(view.success, true);
  view.continueToHome();
  assert.deepEqual(routes, ['/home']);
});

test('editor unauthorized project redirects to login without exposing project data', async () => {
  const runner = hooks(), routes = [], router = { replace: route => routes.push(route) };
  const hook = load('composables/useEditorProject.ts', {
    react: runner.react,
    axios,
    'next/navigation': { useRouter: () => router },
    '@/services/projectService': { projectService: { getProjectById: async () => {
      throw { axiosError: true, response: { status: 401 } };
    } } },
  }).useEditorProject;
  runner.render(() => hook('one'));
  await settle();
  assert.equal(runner.render(() => hook('one')).project, null);
  assert.deepEqual(routes, ['/login']);
});

test('terminal cancellation response immediately stops polling and closes export state',async()=>{
 const h=exportPollingHarness({create:async()=>({id:'export',status:'processing',stage:'preparing'}),cancel:async()=>({id:'export',status:'cancelled'}),get:()=>assert.fail('No terminal polling'),getDownloadUrl:()=>'/fallback'});
 await h.render().startExport('project');let view=h.render();await view.cancelExport();view=h.render();
 assert.equal(view.exportJob.status,'cancelled');assert.equal(view.exporting,false);assert.equal(view.cancelling,false);assert.equal(h.timers.size,0);
});
test('cancellation from another backend instance is displayed while awaiting confirmation',async()=>{
 const h=exportPollingHarness({create:async()=>({id:'export',status:'processing'}),get:async()=>({id:'export',status:'processing',stage:'cancelling',cancelRequested:true}),getDownloadUrl:()=>'/fallback'});
 await h.render().startExport('project');h.render();await h.tick();const view=h.render();assert.equal(view.cancelling,true);assert.equal(view.exporting,true);assert.equal(h.timers.size,1);
});
test('export stages describe actual preparation, renderer startup, rendering and upload',()=>{
 const {exportStageLabel}=load('lib/export.ts',{});for(const [stage,label] of Object.entries({preparing:'Preparing media',starting:'Starting renderer',rendering:'Rendering video',uploading:'Uploading MP4',cancelled:'Cancelled',failed:'Failed',completed:'Completed',cancelling:'Cancelling'}))assert.equal(exportStageLabel(stage),label);
});

test('late in-flight poll cannot reopen a cancelled export',async()=>{
 let release;const h=exportPollingHarness({create:async()=>({id:'export',status:'processing'}),cancel:async()=>({id:'export',status:'cancelled'}),get:()=>new Promise(resolve=>{release=resolve;}),getDownloadUrl:()=>'/fallback'});
 await h.render().startExport('project');h.render();const poll=h.tick();await h.render().cancelExport();h.render();
 release({id:'export',status:'processing',progress:80});await poll;const view=h.render();assert.equal(view.exportJob.status,'cancelled');assert.equal(h.timers.size,0);
});

test('transient status failures while cancelling do not open an error modal or stop confirmation polling',async()=>{
 const h=exportPollingHarness({create:async()=>({id:'export',status:'processing'}),cancel:async()=>({id:'export',status:'processing',cancelRequested:true}),get:async()=>{throw{axiosError:true,response:{status:503,data:{message:'Temporary outage'}}};},getDownloadUrl:()=>'/fallback'});
 await h.render().startExport('project');h.render();await h.render().cancelExport();h.render();
 for(let i=0;i<7;i++){await h.tick();const view=h.render();assert.equal(view.exportError,null);assert.equal(view.cancelling,true);assert.equal(h.timers.size,1);}
});

test('rapid repeated cancel clicks send one request, stop polling on confirmation, and permit another export',async()=>{
 let cancels=0,creates=0,release;
 const h=exportPollingHarness({create:async()=>({id:'export'+(++creates),status:'processing'}),cancel:()=>{cancels++;return new Promise(resolve=>{release=resolve;});},get:async()=>({id:'export1',status:'cancelled',error:null}),getDownloadUrl:()=>'/fallback'});
 await h.render().startExport('project');h.render();const first=h.render().cancelExport();await h.render().cancelExport();assert.equal(cancels,1);
 h.render();await h.tick();let view=h.render();assert.equal(view.exportJob.status,'cancelled');assert.equal(h.timers.size,0);assert.equal(view.exportError,null);
 await view.startExport('project');view=h.render();assert.equal(creates,2);assert.equal(view.exportJob.id,'export2');
 release({id:'export1',status:'processing',cancelRequested:true});await first;view=h.render();assert.equal(view.exportJob.id,'export2');assert.equal(view.cancelling,false);
});

for(const fail of [false,true])test('cancel confirmation aborts an in-flight poll and ignores its late '+(fail?'error':'status'),async()=>{
 let release,signal;
 const h=exportPollingHarness({create:async()=>({id:'export',status:'processing'}),cancel:async()=>({id:'export',status:'cancelled'}),get:(_,s)=>{signal=s;return new Promise((resolve,reject)=>{release=()=>fail?reject({axiosError:true,response:{status:500}}):resolve({id:'export',status:'processing'});});},getDownloadUrl:()=>'/fallback'});
 await h.render().startExport('project');h.render();const pending=h.tick();await h.render().cancelExport();h.render();assert.equal(signal.aborted,true);
 release();await pending;const view=h.render();assert.equal(view.exportJob.status,'cancelled');assert.equal(view.exportError,null);assert.equal(h.timers.size,0);
});

test('cancel request transport timeout waits for confirmed cancellation without resending',async()=>{
 let cancels=0;const h=exportPollingHarness({create:async()=>({id:'export',status:'processing'}),cancel:async()=>{cancels++;throw{axiosError:true,code:'ECONNABORTED'};},get:async()=>({id:'export',status:'cancelled',error:null}),getDownloadUrl:()=>'/fallback'});
 await h.render().startExport('project');h.render();await h.render().cancelExport();let view=h.render();assert.equal(view.cancelling,true);assert.equal(view.exportError,null);await view.cancelExport();assert.equal(cancels,1);
 await h.tick();view=h.render();assert.equal(view.exportJob.status,'cancelled');assert.equal(view.exportError,null);assert.equal(h.timers.size,0);
});

test('remote cancellation stays cancelling through polling outages and cannot send another cancel',async()=>{
 let gets=0;const h=exportPollingHarness({create:async()=>({id:'export',status:'processing'}),cancel:()=>assert.fail('Already requested remotely'),get:async()=>{if(++gets===1)return{id:'export',status:'processing',cancelRequested:true};if(gets<8)throw{axiosError:true,response:{status:503}};return{id:'export',status:'cancelled'};},getDownloadUrl:()=>'/fallback'});
 await h.render().startExport('project');h.render();await h.tick();await h.render().cancelExport();
 for(let i=0;i<7;i++){await h.tick();assert.equal(h.render().exportError,null);}assert.equal(h.render().exportJob.status,'cancelled');assert.equal(h.timers.size,0);
});

test('export API passes the polling abort signal and encodes job IDs',async()=>{
 const calls=[],signal=new AbortController().signal;
 const service=load('services/exportService.ts',{'./api':{api:{get:async(url,config)=>{calls.push({url,config});return{data:{id:'one',status:'cancelled'}};},post:async(url,body,config)=>{calls.push({url,body,config});return{data:{id:'one',status:'cancelled'}};}}}}).exportService;
 await service.get('one /',signal);await service.cancel('one /');assert.equal(calls[0].config.signal,signal);assert.match(calls[0].url,/one%20%2F$/);assert.match(calls[1].url,/one%20%2F\/cancel$/);assert.equal(calls.length,2);
});
