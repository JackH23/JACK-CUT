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
 const realComponent=load('app/projects/page.tsx',{react:React,'react/jsx-runtime':jsxRuntime,'next/link':()=>null,'lucide-react':{LoaderCircle:()=>null,Trash2:()=>null},'@/composables/useProjectsPage':{useProjectsPage:()=>props},'@/components/shared/LoadingSkeleton':()=>null}).default;
 const html=renderToStaticMarkup(React.createElement(realComponent));
 assert.match(html,/inert=""/);assert.match(html,/role="alertdialog"/);assert.ok(html.indexOf('Active export prevents deletion')>html.indexOf('role="alertdialog"'));assert.match(html,/disabled=""/);assert.match(html,/bg-\[#191b25\]/);
});
for(const job of [{id:'one',status:'completed',downloadUrl:null},{id:'one',status:'completed',downloadAvailable:false,downloadUrl:'/file'}])test('expired completed export does not create a fallback download URL '+JSON.stringify(job),()=>{
 const useExport=load('composables/useExportVideo.ts',{react:{useReducer:()=>[{job},()=>{}],useRef:v=>({current:v}),useEffect(){},useCallback:fn=>fn},axios,'@/services/exportService':{exportService:{getDownloadUrl:()=>{assert.fail('Expired URL fallback');}}},'@/reducers/exportReducer':{exportReducer(){},initialExportState:{}}}).useExportVideo;
 assert.equal(useExport().downloadUrl,null);
});
