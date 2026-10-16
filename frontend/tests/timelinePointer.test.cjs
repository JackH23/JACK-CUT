const test=require('node:test');const assert=require('node:assert/strict');const {pointerTime,snapClipStart,hasOverlap}=require('../lib/timelinePointer');
const clip={id:'a',startTime:0,duration:4,trackId:'video'};
test('pointer position uses the 20px/s canvas after sticky headers and horizontal scrolling',()=>{assert.equal(pointerTime(300,-100,20,60,4),19);assert.equal(pointerTime(300,100,20,60,4),9)});
test('pointer seeks clamp to the timeline and moves preserve source duration',()=>{assert.equal(pointerTime(-200,100,0,60),0);assert.equal(pointerTime(3000,100,0,60,4),56)});
test('clip start and end snap to adjacent edges at the existing threshold',()=>{const items=[{id:'b',startTime:10,duration:4,trackId:'other'}];assert.equal(snapClipStart(9.5,clip,items,60).start,10);assert.equal(snapClipStart(6.5,clip,items,60).start,6)});
test('touch move does not snap distant clips or beyond the timeline',()=>{assert.equal(snapClipStart(20,clip,[{id:'b',startTime:10,duration:2}],60).start,20)});
test('overlap protection permits touching endpoints and ignores other tracks',()=>{const items=[{id:'b',startTime:4,duration:3,trackId:'video'}];assert.equal(hasOverlap(clip,items),false);assert.equal(hasOverlap({...clip,startTime:1},items),true);assert.equal(hasOverlap({...clip,startTime:1,trackId:'audio'},items),false)});
