const {test}=require('node:test');
const assert=require('node:assert/strict');
const {getMediaAnimationState:state,getMediaAnimationSettings:settings,getMediaAnimationExpressions:expressions}=require('../lib/mediaAnimation');
const {getClipAnimationFilters}=require('../../backend/utils/clipAnimationFilter');
const clip=(extra={})=>({duration:4,animationInPreset:'none',animationInDuration:1,animationInAmount:50,animationOutPreset:'none',animationOutDuration:1,animationOutAmount:50,...extra});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9, a+' != '+b);
test('amount-dependent fades and phase endpoints',()=>{
 for(const amount of [0,50,100]){const s=amount/100,c=clip({animationInPreset:'fade-in',animationInDuration:.5,animationInAmount:amount,animationOutPreset:'fade-out',animationOutDuration:1.5,animationOutAmount:amount});close(state(c,0).opacity,1-s);close(state(c,.25).opacity,1-s/2);close(state(c,.5).opacity,1);close(state(c,2.5).opacity,1);close(state(c,3.25).opacity,1-s/2);close(state(c,4).opacity,1-s);}
});
test('centered zoom and outward slide directions',()=>{
 const z=clip({animationInPreset:'zoom-in',animationOutPreset:'zoom-out',animationOutDuration:2});close(state(z,0).scale,.875);close(state(z,1).scale,1);close(state(z,3).scale,.9375);close(state(z,4).scale,.875);
 for(const [preset,sign] of [['slide-left',1],['slide-right',-1]]){const c=clip({animationInPreset:preset,animationOutPreset:preset});close(state(c,0).offset,sign*50);close(state(c,.5).offset,sign*25);close(state(c,1).offset,0);close(state(c,3).offset,0);close(state(c,3.5).offset,-sign*25);close(state(c,4).offset,-sign*50);}
});
test('overlapping effects both contribute continuously',()=>{
 const c=clip({duration:2,animationInPreset:'zoom-in',animationInDuration:1.5,animationOutPreset:'fade-out',animationOutDuration:1.5,animationOutAmount:100});close(state(c,1).scale,23/24);close(state(c,1).opacity,2/3);for(const t of [.5,1.5])assert.ok(Math.abs(state(c,t-1e-7).opacity-state(c,t+1e-7).opacity)<1e-6);
 const zz=clip({duration:2,animationInPreset:'zoom-in',animationInDuration:1.5,animationOutPreset:'zoom-out',animationOutDuration:1.5});close(state(zz,1).scale,(23/24)**2);
});
test('short clips clamp durations; zero duration disables effect',()=>{
 const c=clip({duration:.4,animationInPreset:'fade-in',animationInDuration:3,animationInAmount:100});close(settings(c).animationInDuration,.4);close(state(c,.2).opacity,.5);close(state({...c,animationInDuration:0},0).opacity,1);assert.deepEqual(getClipAnimationFilters(clip()),[]);
});
test('untouched legacy trajectories are preserved',()=>{
 const presets=['none','fade-in','fade-out','zoom-in','zoom-out','slide-left','slide-right'];for(const p of presets)for(const t of [0,.25,.5,1,3.5,4]){const c={duration:4,animationPreset:p,animationAmount:50},v=state(c,t);if(p==='zoom-out')close(v.scale,1+.125*(1-Math.min(t,1)));if(p==='slide-left')close(v.offset,50*(1-Math.min(t,1)));if(p==='slide-right')close(v.offset,-50*(1-Math.min(t,1)));if(p==='fade-out')close(v.opacity,1-.5*(1-Math.min(4-t,1)));}
});
test('FFmpeg expressions equal numeric preview across the timeline',()=>{
 const clamp=(x,a,b)=>Math.min(Math.max(x,a),b);
 for(const inPreset of ['none','fade-in','zoom-in','slide-left','slide-right'])for(const outPreset of ['none','fade-out','zoom-out','slide-left','slide-right'])for(const amount of [0,50,100]){const c=clip({duration:2,animationInPreset:inPreset,animationInDuration:1.5,animationInAmount:amount,animationOutPreset:outPreset,animationOutDuration:1.25,animationOutAmount:amount}),e=expressions(c);for(const t of [0,.25,.75,1,1.5,2]){const n=state(c,t);for(const key of ['opacity','scale','offset'])close(Function('T','clip','return '+e[key])(t,clamp),n[key]);}}
});
