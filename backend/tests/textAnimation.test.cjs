const test=require('node:test'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'../..');
const {getTextAnimationState:state,getTextAnimationStyle:style}=require(root+'/frontend/lib/textAnimation');
const {getMediaAnimationState:media}=require(root+'/frontend/lib/mediaAnimation');
const {getTextAnimationSegments:segments,getTextAnimationTags:tags}=require(root+'/backend/utils/textAnimationAss');
const clip=extra=>({start:2.17,duration:4,textX:27,textY:72,animationInPreset:'none',animationInDuration:1,animationInAmount:50,animationOutPreset:'none',animationOutDuration:1,animationOutAmount:50,...extra});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
for(const input of ['none','fade-in','zoom-in','slide-left','slide-right'])for(const output of ['none','fade-out','zoom-out','slide-left','slide-right'])for(const amount of [0,50,100])test(`text ${input}/${output} amount ${amount}: shared math and ASS frame timing`,()=>{
 const c=clip({duration:2.4,animationInPreset:input,animationOutPreset:output,animationInDuration:1.8,animationOutDuration:1.8,animationInAmount:amount,animationOutAmount:amount});
 const all=segments(c); for(let n=Math.ceil(c.start*30);n/30<c.start+c.duration;n++){
  const t=n/30,s=all.find(x=>x.start<=t&&t<x.end);assert.ok(s);assert.deepEqual(state(c,t-c.start),media(c,t-c.start));assert.deepEqual(s.state,state(c,t-c.start));
  const tag=tags(c,s.state,1920,1080);assert.ok(tag.startsWith('\\pos('));assert.ok(!tag.startsWith('\\\\'));const [x,y]=/pos\(([^,]+),([^\)]+)/.exec(tag).slice(1).map(Number);close(x,27/100*1920+s.state.offset/100*1920);close(y,.72*1080);
 }
});
test('static ASS remains one event; amount zero has no visual effect',()=>{for(const extra of [{},{animationInPreset:'zoom-in',animationInAmount:0}]){const all=segments(clip(extra));assert.equal(all.length,1);assert.equal(all[0].animated,false)}});
test('text preview translates in canvas units and scales about own center',()=>{const c=clip({animationInPreset:'slide-left',animationInAmount:100});assert.equal(style(c,0).transform,'translateX(100cqw) scale(1)');assert.equal(style(c,1).transform,'translateX(0cqw) scale(1)');assert.equal(style(c,.5).transformOrigin,'center');});
test('short clips clamp durations, deterministic out-of-order scrubbing never changes layout',()=>{const c=clip({duration:.3,animationInDuration:5,animationOutDuration:5,animationInPreset:'zoom-in',animationOutPreset:'fade-out',animationOutAmount:100}),before=JSON.stringify(c);for(const t of [.2,0,.3,.1,-1,7])for(const x of Object.values(state(c,t)))assert.ok(Number.isFinite(x));assert.equal(JSON.stringify(c),before);});
