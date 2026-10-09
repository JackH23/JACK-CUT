const {test}=require('node:test'),assert=require('node:assert/strict');
const {createRenderSlots}=require('../services/renderSlots');
test('memory budget defaults to one active renderer; release admits the next job',async()=>{
 const slots=createRenderSlots(1),release=await slots.acquire();let nextStarted=false;
 const next=slots.acquire().then(release=>{nextStarted=true;return release;});await new Promise(r=>setImmediate(r));assert.equal(nextStarted,false);
 release();const releaseNext=await next;assert.equal(nextStarted,true);release();releaseNext();
});
test('cancelling a queued export removes it and never consumes a render slot',async()=>{
 const slots=createRenderSlots(1),release=await slots.acquire(),abort=new AbortController();
 const queued=slots.acquire(abort.signal);abort.abort();await assert.rejects(queued,/waiting for a renderer/);
 release();const admitted=await slots.acquire();admitted();
});
test('explicit concurrency is bounded and release is idempotent',async()=>{
 const slots=createRenderSlots(2),a=await slots.acquire(),b=await slots.acquire();let next=false;
 const c=slots.acquire().then(release=>{next=true;return release;});await new Promise(r=>setImmediate(r));assert.equal(next,false);a();a();const release=await c;assert.equal(next,true);b();release();
});

test('non-finite concurrency settings retain a single-renderer memory budget',async()=>{
 const slots=createRenderSlots(Infinity),release=await slots.acquire();let admitted=false;
 const queued=slots.acquire().then(next=>{admitted=true;return next;});
 await new Promise(r=>setImmediate(r));assert.equal(admitted,false);
 release();(await queued)();
});
