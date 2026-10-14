// Harness validation only; this tiny fixture is never production evidence.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {capture}=require('./captureProject.cjs');
const {verifyBundle}=require('./compileGraph.cjs');
const {checkProfile}=require('./runProject.cjs');
const projectId='dd992cea-76b0-4476-aa42-f7283d421c7c',jobId='3a3b2e9a-b187-4cc9-b6a7-fe23d2d82eda';
const mediaId='10000000-0000-4000-8000-000000000001';
test('capture is GET-only, retains render fields, excludes credentials and tickets, detects tampering',async()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'jackcut-readonly-')),directory=path.join(parent,'bundle');
 const item={id:'20000000-0000-4000-8000-000000000001',projectId,itemType:'MEDIA',mediaId,startTime:1.25,duration:2.5,sourceStart:.75,mediaScale:.713,mediaX:17.3,mediaY:-11.7,effectPreset:'cinematic',trackId:'V2',animationInPreset:'fade-in',animationInDuration:2,animationInAmount:37.5,animationOutPreset:'fade-out',animationOutDuration:2,animationOutAmount:50};
 const data={['/api/projects/'+projectId]:{project:{id:projectId}},['/api/exports/'+jobId]:{id:jobId,status:'failed'},['/api/timeline/items?projectId='+projectId]:{total:1,items:[item]},['/api/media?projectId='+projectId]:{media:[{id:mediaId,type:'image',size:3,mimeType:'image/png',url:'https://example.invalid/?ticket=SECRET_TICKET'}]}};
 const fetchImpl=async(url,options)=>{assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer SECRET_TOKEN');const route=url.pathname+url.search;return new Response(route.endsWith('/content')?new Uint8Array([1,2,3]):JSON.stringify(data[route]),{status:200});};
 await capture({apiOrigin:'https://example.invalid',projectId,jobId,directory,token:'SECRET_TOKEN',fetchImpl});
 const encoded=fs.readFileSync(path.join(directory,'snapshot.json'),'utf8');assert.doesNotMatch(encoded,/SECRET_|ticket=/);
 const {snapshot}=await verifyBundle(directory);assert.equal(snapshot.items[0].animation_in_amount,37.5);assert.equal(snapshot.items[0].media_scale,.713);assert.equal(snapshot.items[0].source_start,.75);
 fs.appendFileSync(snapshot.assets[0].localPath,'tampered');await assert.rejects(verifyBundle(directory),/checksum/);
});
test('unverified production profile cannot run',()=>{assert.throws(()=>checkProfile({exportTimeoutMs:7200000},{},{items:[]}),/Production comparison blocked/);assert.throws(()=>checkProfile({exportTimeoutMs:1},{},{items:[]}),/7200000/);});

