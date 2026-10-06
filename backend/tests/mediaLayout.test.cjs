const {test}=require('node:test');
const assert=require('node:assert/strict');
const {getMediaRectangle,getMediaParentTransform}=require('../utils/mediaLayout');
const {getClipAnimationFilters,getClipAnimationWindow}=require('../utils/clipAnimationFilter');
const {getMediaAnimationState}=require('../../frontend/lib/mediaAnimation');
const canvas={width:640,height:360}, output={width:1920,height:1080};
const source={width:740,height:557};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
// Independent derivation of object-contain + nested CSS transforms used by preview.
function preview(c,src,anim={scale:1,offset:0}) {
 const ratio=src.width/src.height, fitW=Math.min(640,360*ratio),fitH=fitW/ratio;
 const w=fitW*(c.mediaScale??1)*anim.scale,h=fitH*(c.mediaScale??1)*anim.scale;
 const cx=320+(c.mediaX??0)+640*(c.mediaScale??1)*anim.offset/100,cy=180+(c.mediaY??0);
 return {left:cx-w/2,top:cy-h/2,right:cx+w/2,bottom:cy+h/2,width:w,height:h,centerX:cx,centerY:cy};
}
const cases=[
 ['centered 100%',{}],['scale above 100%',{mediaScale:1.3362}],['scale below 100%',{mediaScale:.55}],
 ['moved left',{mediaX:-65}],['moved right',{mediaX:65}],['moved up',{mediaY:-40}],['moved down',{mediaY:40}],
 ['resized left',{mediaScale:.8,mediaX:47.827648}],['resized right',{mediaScale:.8,mediaX:-47.827648}],
 ['resized top',{mediaScale:.8,mediaY:36}],['resized bottom',{mediaScale:.8,mediaY:-36}],
 ['portrait',{}, {width:480,height:960}],['landscape',{}, {width:1600,height:900}],['square',{}, {width:800,height:800}],
 ['partly outside',{mediaScale:1.4,mediaX:300,mediaY:-120}],
 ['snapped left',{mediaScale:.55,mediaX:-320+740/557*360*.55/2}],
 ['snapped right',{mediaScale:.55,mediaX:320-740/557*360*.55/2}],
 ['snapped top',{mediaScale:.55,mediaY:-180+360*.55/2}],
 ['snapped bottom',{mediaScale:.55,mediaY:180-360*.55/2}],
];
for(const [name,clip,src=source] of cases)test(name+' scales preview geometry exactly into output',()=>{
 const expected=preview(clip,src),actual=getMediaRectangle(clip,output,src);
 for(const key of Object.keys(expected))close(actual[key],expected[key]*3);
 close(actual.width/actual.height,src.width/src.height);
});
test('persisted base transforms survive all animation phases and amounts',()=>{
 for(const preset of ['fade-in','fade-out','zoom-in','zoom-out','slide-left','slide-right'])for(const amount of [0,50,100])for(const time of [0,.5,1,2,3,3.5,4]){
  const isOut=['fade-out','zoom-out'].includes(preset);
  const c={duration:4,mediaScale:.55,mediaX:-65,mediaY:40,animationInPreset:isOut?'none':preset,animationInDuration:1,animationInAmount:amount,animationOutPreset:isOut?preset:'none',animationOutDuration:1,animationOutAmount:amount};
  const a=getMediaAnimationState(c,time),p=preview(c,source,a),o=getMediaRectangle(c,output,source,a);
  for(const key of Object.keys(p))close(o[key],p[key]*3);
 }
});
test('slide uses scaled parent canvas, not intrinsic media width',()=>{
 const c={mediaScale:.55,mediaX:10,mediaY:20};
 const r=getMediaRectangle(c,output,source,{scale:1,offset:50});close(r.centerX,960+30+1920*.55*.5);
});
test('GEQ inverse sample composes persisted scale and both center offsets',()=>{
 const c={duration:4,mediaScale:.55,mediaX:-65,mediaY:40,animationInPreset:'zoom-in',animationInDuration:1,animationInAmount:100,animationOutPreset:'fade-out',animationOutDuration:1,animationOutAmount:50};
 const f=getClipAnimationFilters(c).join(',');assert.match(f,/st\(1,1\/\(\(0\.55\)\*/);assert.ok(f.includes('/100+(-195)'));assert.ok(f.includes('(H-1)/2+(120)'));assert.equal(f.match(/geq=/g).length,1);assert.equal(getClipAnimationWindow(c),'lt(t,1)+gte(t,3)');
});
test('none and amount zero retain the fast static branch',()=>{
 const c={duration:4,mediaScale:.55,mediaX:80,animationInPreset:'none',animationOutPreset:'none'};assert.deepEqual(getClipAnimationFilters(c),[]);assert.equal(getClipAnimationWindow(c),'0');
 assert.deepEqual(getClipAnimationFilters({...c,animationInPreset:'slide-left',animationInAmount:0}),[]);
 const p=getMediaParentTransform(c,1920,1080);close(p.centerX,1200);close(p.width,1056);
});
