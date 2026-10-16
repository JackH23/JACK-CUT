import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(fs.readFileSync(new URL('../lib/playbackCoordinator.ts', import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const trace = {exports:{}}; new Function('exports',ts.transpileModule(fs.readFileSync(new URL('../lib/playbackTrace.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(trace.exports);
const loaded = {exports:{}}; new Function('exports','require',code)(loaded.exports,()=>trace.exports);
const {PlaybackCoordinator} = loaded.exports;
function media() { let time=0; return {playbackRate:1,duration:300,readyState:4,seeking:false,paused:true,ended:false,error:null,seeks:[],plays:0,loads:0,get currentTime(){return time},set currentTime(value){time=value;this.seeks.push(value);this.seeking=true},play(){this.plays++;this.paused=false;return Promise.resolve()},pause(){this.paused=true},load(){this.loads++;this.error=null}}; }
const flush = () => new Promise(resolve=>setImmediate(resolve));
test('buffering freezes the timeline and never chases the moving playhead',()=>{
 const c=new PlaybackCoordinator(), a=media(),v=media();c.seek(50);c.register(a,0,150,'wav');c.register(v,-30,60,'video');c.setPlaying(true);c.tick(0,150);
 for(let i=1;i<100;i++)c.tick(i*16,150);
 assert.equal(c.position,50);assert.deepEqual(a.seeks,[50]);assert.deepEqual(v.seeks,[20]);assert.equal(a.plays,0);
 a.seeking=v.seeking=false;c.tick(1600,150);assert.equal(a.plays,1);assert.equal(v.plays,1);
 a.currentTime=50.2;v.currentTime=20.2;a.seeking=v.seeking=false;c.tick(1700,150);assert.equal(c.position,50.2);
 v.readyState=1;c.tick(1800,150);assert.equal(a.paused,true);assert.equal(c.position,50.2);
 v.readyState=4;c.tick(1900,150);assert.equal(a.plays,2);
});
test('a scrub during a seek queues only the latest destination',()=>{
 const c=new PlaybackCoordinator(),a=media();c.register(a,0,100,'audio');c.seek(20);c.tick(0,100);c.seek(40);c.seek(10);c.tick(16,100);assert.deepEqual(a.seeks,[20]);a.seeking=false;c.tick(32,100);assert.deepEqual(a.seeks,[20,10]);assert.equal(c.position,10);
});
test('same media adjacent clips re-register without resetting the source unnecessarily',()=>{
 const c=new PlaybackCoordinator(),v=media();const off=c.register(v,0,10,'clip1');c.setPlaying(true);c.tick(0,30,10);v.currentTime=10;v.seeking=false;c.tick(16,30,10);assert.equal(c.position,10);off();c.register(v,0,20,'clip2');c.tick(32,30,20);assert.deepEqual(v.seeks,[10]);assert.equal(v.plays,2);
});
test('clip boundaries are not skipped even when a media clock runs ahead',()=>{
 const c=new PlaybackCoordinator(),a=media();c.register(a,0,100,'audio');c.setPlaying(true);c.tick(0,100,5);a.currentTime=8;a.seeking=false;c.tick(16,100,5);assert.equal(c.position,5);
});
test('removed audio is paused and stale play rejection cannot poison the next clip',async()=>{
 const c=new PlaybackCoordinator(),a=media();let reject;a.play=()=>{a.paused=false;return new Promise((_,r)=>reject=r)};const off=c.register(a,0,100,'old');c.setPlaying(true);c.tick(0,100);off();reject(new Error('blocked'));await flush();assert.equal(a.paused,true);assert.equal(c.error,null);
});
test('play rejection exposes a recoverable error',async()=>{
 const c=new PlaybackCoordinator(),a=media();a.play=()=>Promise.reject(new Error('blocked'));c.register(a,0,100,'WAV');c.setPlaying(true);c.tick(0,100);await flush();assert.match(c.error,/WAV.*blocked/);a.play=()=>Promise.resolve();c.retry();c.tick(16,100);assert.equal(c.error,null);
});
test('timeout can recover without discarding healthy late buffered data',()=>{
 const c=new PlaybackCoordinator(),a=media();a.readyState=1;c.register(a,0,100,'audio');c.setPlaying(true);c.tick(0,100);c.tick(30001,100);assert.match(c.error,/buffer/);a.readyState=4;c.retry();c.tick(30016,100);assert.equal(a.loads,0);assert.equal(c.error,null);assert.equal(a.plays,1);
});
test('native media failure reloads only on explicit retry',()=>{
 const c=new PlaybackCoordinator(),a=media();c.register(a,0,100,'audio');a.error={code:2};c.tick(0,100);assert.match(c.error,/media error 2/);c.retry();assert.equal(a.loads,1);assert.equal(c.error,null);
});
test('background suspension freezes media and empty timeline return cannot jump',()=>{
 const c=new PlaybackCoordinator(),a=media();c.register(a,0,100,'audio');c.setPlaying(true);c.tick(0,100);c.setSuspended(true);assert.equal(a.paused,true);c.tick(100000,100);assert.equal(c.position,0);c.setSuspended(false);c.tick(200000,100);assert.equal(c.position,0);
 const empty=new PlaybackCoordinator();empty.setPlaying(true);empty.tick(0,100);empty.tick(100000,100);assert.equal(empty.position,.1);
});
test('late buffer arrival resumes automatically after timeout',()=>{
 const c=new PlaybackCoordinator(),a=media();a.readyState=1;c.register(a,0,100,'audio');c.setPlaying(true);c.tick(0,100);c.tick(30001,100);assert.ok(c.error);a.readyState=4;c.tick(40000,100);assert.equal(c.error,null);assert.equal(a.plays,1);assert.equal(a.loads,0);
});
test('a leading decoder waits for the slower audio clock without repeated seeks',async()=>{
 const c=new PlaybackCoordinator(),v=media(),a=media();c.register(v,0,100,'video');c.register(a,0,100,'audio');c.setPlaying(true);c.tick(0,100);
 v.currentTime=2;a.currentTime=.1;v.seeking=a.seeking=false;c.tick(16,100);assert.equal(v.paused,true);assert.equal(a.paused,false);assert.equal(c.position,.1);c.tick(32,100);assert.equal(v.plays,1);assert.deepEqual(v.seeks,[2]);
 await flush();a.currentTime=1.95;a.seeking=false;c.tick(48,100);assert.equal(v.plays,2);
});

test('metadata arriving after timeout still applies the queued seek once',()=>{
 const c=new PlaybackCoordinator(),a=media();c.seek(50);a.readyState=0;c.register(a,0,100,'audio');c.setPlaying(true);c.tick(0,100);c.tick(30001,100);a.readyState=1;c.tick(40000,100);assert.deepEqual(a.seeks,[50]);a.seeking=false;a.readyState=4;c.tick(40016,100);assert.equal(c.error,null);assert.equal(a.plays,1);
});
test('paused HAVE_CURRENT_DATA recovers with buffer headroom without canplay',()=>{
 const c=new PlaybackCoordinator(),v=media(),a=media();let ahead=6;
 v.buffered={length:1,start:()=>0,end:()=>v.currentTime+ahead};
 c.register(v,0,100,'video');c.register(a,0,100,'wav');c.setPlaying(true);c.tick(0,100);
 ahead=.1;v.readyState=2;c.tick(16,100);assert.equal(v.paused,true);assert.equal(a.paused,true);
 ahead=.4;c.tick(32,100);assert.equal(v.plays,1);assert.equal(c.position,0);
 ahead=5.1;c.tick(48,100);assert.equal(v.plays,2);assert.equal(a.plays,2);assert.equal(v.readyState,2);
 ahead=.8;c.tick(64,100);assert.equal(v.paused,false);assert.equal(a.paused,false);assert.equal(v.plays,2);
 assert.deepEqual(v.seeks,[]);
});
test('resume threshold is bounded by the remaining clip interval',()=>{
 const c=new PlaybackCoordinator(),v=media();v.duration=.5;v.readyState=2;
 v.buffered={length:1,start:()=>0,end:()=>.5};c.register(v,0,.5,'short');c.setPlaying(true);c.tick(0,.5);
 assert.equal(v.plays,1);
});
test('ordinary 123ms decoder drift adjusts rate without interrupting playback',()=>{
 const c=new PlaybackCoordinator(),v=media(),a=media();c.register(v,0,100,'video');c.register(a,0,100,'wav');c.setPlaying(true);c.tick(0,100);
 for(let i=1;i<40;i++){a.currentTime=i;v.currentTime=i+.123;a.seeking=v.seeking=false;c.tick(i*16,100);assert.equal(v.paused,false);assert.equal(a.paused,false);}
 assert.equal(v.plays,1);assert.equal(a.plays,1);assert.ok(v.playbackRate<1);assert.equal(a.playbackRate,1);
});
test('large drift holds until a stable release threshold',async()=>{
 const c=new PlaybackCoordinator(),v=media(),a=media();c.register(v,0,100,'video');c.register(a,0,100,'wav');c.setPlaying(true);c.tick(0,100);await flush();
 v.currentTime=1;a.currentTime=.5;a.seeking=v.seeking=false;c.tick(16,100);assert.equal(v.paused,true);
 a.currentTime=.8;a.seeking=false;c.tick(32,100);assert.equal(v.paused,true);assert.equal(v.plays,1);
 a.currentTime=.95;a.seeking=false;c.tick(48,100);assert.equal(v.paused,false);assert.equal(v.plays,2);
});
test('steady clocks do not repeatedly write the native playback rate',()=>{
 const c=new PlaybackCoordinator(),v=media(),a=media();let writes=0,rate=1;
 Object.defineProperty(v,'playbackRate',{get:()=>rate,set:value=>{rate=value;writes++;}});
 c.register(v,0,100,'video');c.register(a,0,100,'wav');c.setPlaying(true);
 for(let i=0;i<100;i++){v.currentTime=i/10;a.currentTime=i/10;v.seeking=a.seeking=false;c.tick(i*16,100);}
 assert.equal(writes,0);
});
test('native waiting freezes both clocks despite a misleading buffered range',()=>{
 const c=new PlaybackCoordinator(),v=media(),a=media();const listeners=new Map();let ahead=8;
 v.buffered={length:1,start:()=>0,end:()=>v.currentTime+ahead};v.addEventListener=(name,fn)=>listeners.set(name,fn);v.removeEventListener=name=>listeners.delete(name);
 const unregister=c.register(v,0,100,'video');c.register(a,0,100,'wav');c.setPlaying(true);c.tick(0,100);
 v.readyState=2;ahead=1.4;listeners.get('waiting')();c.tick(16,100);assert.equal(v.paused,true);assert.equal(a.paused,true);assert.equal(c.position,0);
 ahead=5.2;c.tick(32,100);assert.equal(v.plays,1);
 ahead=6.5;c.tick(48,100);assert.equal(v.plays,2);assert.equal(a.plays,2);assert.deepEqual(v.seeks,[]);
 unregister();assert.equal(listeners.size,0);
});
test('an ended decoder within endpoint tolerance releases the clip boundary',()=>{
 const c=new PlaybackCoordinator(),v=media();v.duration=9.98;c.register(v,0,10,'rounded clip');c.setPlaying(true);c.tick(0,20,10);v.currentTime=9.98;v.seeking=false;v.ended=true;c.tick(16,20,10);assert.equal(c.position,10);
});
test('waiting near the end can recover with all remaining media buffered',()=>{
 const c=new PlaybackCoordinator(),v=media();const listeners=new Map();let ahead=2;
 v.duration=2;v.readyState=2;v.buffered={length:1,start:()=>0,end:()=>ahead};v.addEventListener=(n,f)=>listeners.set(n,f);
 c.register(v,0,2,'short');c.setPlaying(true);v.readyState=4;c.tick(0,2);ahead=1.4;v.readyState=2;listeners.get('waiting')();c.tick(16,2);ahead=2;c.tick(32,2);assert.equal(v.paused,false);
});

test('loop seeks to zero with playback intent preserved; disabled loop stops',()=>{
 const c=new PlaybackCoordinator();c.toggleLoop();c.seek(.99);c.setPlaying(true);c.tick(0,1);c.tick(20,1);assert.equal(c.position,0);assert.equal(c.playing,true);c.toggleLoop();c.seek(.99);c.tick(40,1);c.tick(60,1);assert.equal(c.position,1);assert.equal(c.playing,false);
});
test('image loading holds synchronized audio and recovers automatically',()=>{
 const c=new PlaybackCoordinator(),a=media(),image={complete:false,naturalWidth:0};c.register(a,0,10,'audio');const off=c.registerImage(image,'still');c.setPlaying(true);c.tick(0,10);assert.equal(c.isBuffering,true);assert.equal(a.paused,true);assert.equal(c.position,0);image.complete=true;image.naturalWidth=100;c.tick(16,10);assert.equal(a.paused,false);assert.equal(c.isBuffering,false);c.setPlaying(false);assert.equal(c.isBuffering,false);off();
});
test('failed image exposes a useful recoverable error',()=>{
 const c=new PlaybackCoordinator();const image={complete:true,naturalWidth:0,src:'still.png'};const off=c.registerImage(image,'missing still');c.tick(0,10);assert.match(c.error,/missing still/);off();c.retry();c.tick(16,10);assert.equal(c.error,null);
});

test('intentional pause time does not consume the buffering timeout',()=>{
 const c=new PlaybackCoordinator(),v=media();v.readyState=0;c.register(v,0,100,'video');c.setPlaying(true);c.tick(0,100);c.setPlaying(false);c.tick(60000,100);c.setPlaying(true);c.tick(60016,100);assert.equal(c.error,null);assert.equal(c.isBuffering,true);
});

test('fully empty intervals advance on the coordinator clock and pause freezes them',()=>{
 const c=new PlaybackCoordinator();c.seek(27);c.setPlaying(true);c.tick(0,80,30);for(let n=1;n<=40;n++)c.tick(n*100,80,30);assert.equal(c.position,30);c.setPlaying(false);c.tick(9000,80,40);assert.equal(c.position,30);c.setPlaying(true);c.tick(10000,80,40);c.tick(10100,80,40);assert.equal(c.position,30.1);
});
