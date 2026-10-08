import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function fixture(refresh) {
 const callbacks={},calls=[],tokens=new Map([['accessToken','old'],['refreshToken','refresh']]);
 const api=async request=>{calls.push(request);return{data:'retried'};};api.interceptors={request:{use:fn=>callbacks.request=fn},response:{use:(_,fn)=>callbacks.error=fn}};
 let refreshes=0;const axios={create:()=>api,isAxiosError:error=>Boolean(error?.axiosError),post:async()=>{refreshes++;return refresh();}};
 const loaded={exports:{}};const code=ts.transpileModule(fs.readFileSync(new URL('../services/api.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 new Function('require','module','exports','process','localStorage',code)(name=>{assert.equal(name,'axios');return axios;},loaded,loaded.exports,{env:{NEXT_PUBLIC_API_URL:'http://localhost:5001'}},{getItem:key=>tokens.get(key),setItem:(key,value)=>tokens.set(key,value),removeItem:key=>tokens.delete(key)});
 return{callbacks,calls,tokens,refreshes:()=>refreshes};
}
const unauthorized=()=>({axiosError:true,response:{status:401},config:{url:'/projects/one',headers:{}}});
test('shared API adds bearer token to project deletion requests',()=>{
 const h=fixture(async()=>({}));const request=h.callbacks.request({headers:{},method:'DELETE',url:'/projects/one'});assert.equal(request.headers.Authorization,'Bearer old');
});
for(const status of [400,401,403])test('refresh rejection '+status+' preserves original 401 for login redirect',async()=>{
 const h=fixture(async()=>{throw{axiosError:true,response:{status}};});const error=unauthorized();await assert.rejects(h.callbacks.error(error),failure=>failure===error);assert.equal(h.tokens.size,0);
});
test('concurrent 401 requests share one refresh and retry with rotated tokens',async()=>{
 let release;const h=fixture(()=>new Promise(resolve=>{release=resolve;}));const first=h.callbacks.error(unauthorized()),second=h.callbacks.error(unauthorized());assert.equal(h.refreshes(),1);release({data:{token:'new',refreshToken:'rotated'}});await Promise.all([first,second]);assert.equal(h.calls.length,2);assert.ok(h.calls.every(call=>call.headers.Authorization==='Bearer new'));assert.equal(h.tokens.get('refreshToken'),'rotated');
});
test('refresh network failure preserves session and API does not endlessly retry',async()=>{
 const network={axiosError:true};const h=fixture(async()=>{throw network;});await assert.rejects(h.callbacks.error(unauthorized()),failure=>failure===network);assert.equal(h.tokens.get('refreshToken'),'refresh');const error=unauthorized();error.config._retry=true;await assert.rejects(h.callbacks.error(error),failure=>failure===error);assert.equal(h.refreshes(),1);
});
