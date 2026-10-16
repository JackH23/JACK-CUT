"use client";
import { useEffect, useRef } from "react";
// Thumbnails must leave connections available for synchronized preview media.
const queue: Array<() => void> = [];
let loading = 0;
function drain() { while (loading < 2 && queue.length) { loading++; queue.shift()!(); } }
export default function VideoThumbnail({src,className}:{src:string;className:string}) {
 const ref=useRef<HTMLVideoElement>(null);
 useEffect(()=>{
  const media=ref.current;if(!media)return;
  let disposed=false, queued=false, release: (()=>void)|undefined;
  const start=()=>{
   if(disposed){loading--;drain();return;}
   let complete=false;
   const finish=()=>{if(complete)return;complete=true;clearTimeout(timer);media.removeEventListener("loadeddata",finish);media.removeEventListener("error",finish);loading--;drain();};
   const timer=setTimeout(()=>{media.removeAttribute("src");media.load();finish();},15000);
   release=finish;
   media.addEventListener("loadeddata",finish);media.addEventListener("error",finish);
   media.src=src;media.load();
  };
  const observer=new IntersectionObserver(entries=>{if(!queued&&entries.some(e=>e.isIntersecting)){queued=true;queue.push(start);drain();observer.disconnect();}});
  observer.observe(media);
  return()=>{disposed=true;observer.disconnect();const index=queue.indexOf(start);if(index>=0)queue.splice(index,1);media.removeAttribute("src");media.load();release?.();};
 },[src]);
 return <video ref={ref} preload="metadata" muted playsInline draggable={false} className={className} />;
}
