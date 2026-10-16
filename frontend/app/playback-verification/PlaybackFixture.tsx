"use client";
import { useState } from "react";
import PreviewMonitor from "@/components/editor/PreviewMonitor";
import type { TimelineItem } from "@/types/timeline";
import type { MediaFile } from "@/lib/media";
const noop = () => {};
const file = (type: MediaFile["type"], name: string): MediaFile => ({id:type, name, type, url:"/playback-fixtures/"+name, size:0, mimeType:type+"/"+(type==="image"?"svg+xml":type==="video"?"mp4":"wav"),durationSeconds:type==="video"?12:80});
const video=file("video","clock.mp4"), image=file("image","still.svg"), audio=file("audio","tone.wav");
const clip=(id:string,startTime:number,duration:number,f?:MediaFile):TimelineItem=>({id,type:f?"media":"text",file:f,trackId:f?.type==="audio"?"audio":"visual",startTime,duration,sourceStart:0,startPosition:0,width:10,effectPreset:f?.type==="image"?"vintage":"none",...(!f?{text:"Animated text "+id,fontSize:24,animationInPreset:"slide-left",animationInDuration:4,animationInAmount:50,animationOutPreset:"fade-out",animationOutDuration:3,animationOutAmount:100}: {})});
const mixed=[clip("v0",0,10,video),clip("i1",10,10,image),clip("text-only",20,7),clip("v3",30,10,video),clip("i4",40,10,image),clip("v5",50,10,video),clip("i6",60,10,image),clip("v7",70,10,video),clip("sound1",0,25,audio),clip("sound2",30,50,audio),clip("over-image",10,10),clip("title",0,10),clip("title2",40,10),clip("title3",60,10)];
export default function PlaybackFixture(){
 const [mode,setMode]=useState("mixed");const [time,setTime]=useState(0);
 const items=mode==="mixed"?mixed:mode==="video"?[clip("only-video",0,10,video)]:mode==="image"?[clip("only-image",0,10,image)]:mode==="text"?[clip("only-text",0,10)]:[clip("still",0,10,image),clip("sound",0,10,audio),clip("text",0,10)];
 const duration=mode==="mixed"?80:10;
 const active=items.find(i=>i.type==="media"&&i.file?.type!=="audio"&&time>=i.startTime&&time<i.startTime+i.duration)??null;
 return <main className="flex h-screen flex-col bg-black text-white"><div>Separate local playback fixture — no saved timeline or API writes. <select aria-label="Fixture mode" value={mode} onChange={e=>{setMode(e.target.value);setTime(0)}}>{["mixed","video","image","text","image-audio-text"].map(v=><option key={v}>{v}</option>)}</select><output aria-label="Fixture time">{time.toFixed(3)}</output></div><PreviewMonitor key={mode} selectedItemId={null} onSelectItem={noop} onUpdateMediaTransform={noop} file={active?.file??null} activeItem={active} items={items} duration={duration} playheadTime={time} onPlayheadTimeChange={setTime} onPlayingChange={noop} onUpdateText={noop} onUpdateTextPosition={noop} onUpdateTextFontSize={noop}/></main>;
}
