// Verify generated MP4s, image identity and subtitle pixels, and compare every frame.
const fs=require('node:fs'),path=require('node:path'),{spawnSync,execFileSync}=require('node:child_process');
const dir=path.join(__dirname,'results'),ffmpeg=process.env.FFMPEG_PATH||'ffmpeg',probe=process.env.FFPROBE_PATH||'ffprobe';
function check(name){
 const file=path.join(dir,name+'.mp4'),manifest=JSON.parse(fs.readFileSync(path.join(dir,name+'-command.json'),'utf8'));
 const metadata=JSON.parse(execFileSync(probe,['-v','error','-count_frames','-show_streams','-show_format','-of','json',file],{encoding:'utf8',maxBuffer:4*1024*1024}));
 const video=metadata.streams.find(s=>s.codec_type==='video');if(!video||video.width!==1920||video.height!==1080||Number(video.nb_read_frames)!==1800)throw Error(name+': incorrect dimensions/frame count');
 if(Math.abs(Number(metadata.format.duration)-60)>.08||!metadata.streams.some(s=>s.codec_name==='aac'))throw Error(name+': duration/audio missing');
 const decoded=spawnSync(ffmpeg,['-threads','1','-v','info','-i',file,'-vf','blackdetect=d=0.001:pix_th=0.005:pic_th=0.99999','-f','null','-'],{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
 if(decoded.status!==0)throw Error(decoded.stderr);if(/black_start:/.test(decoded.stderr))throw Error(name+': fully black frames');
 const select=Array.from({length:10},(_,i)=>`eq(n,${i*180+90})`).join('+');
 const samples=execFileSync(ffmpeg,['-threads','1','-v','error','-i',file,'-vf',`select='${select}',scale=640:360`,'-fps_mode','passthrough','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{maxBuffer:16*1024*1024});
 const frameBytes=640*360*3;if(samples.length!==10*frameBytes)throw Error('Missing sampled scenes');
 const scenes=[];
 for(let i=0;i<10;i++){
  const item=manifest.items.find(v=>v.id==='scene'+i),frame=samples.subarray(i*frameBytes,(i+1)*frameBytes);
  const cx=Math.round((960+(item.media_x||0)*3)/3),cy=Math.round((540+(item.media_y||0)*3)/3),a=((cy+13)*640+cx+17)*3;
  const w=i%3===0?1440:2560,h=i%3===0?2560:1440,fit=Math.min(1920/w,1080/h)*(item.media_scale||1),sx=w/2+51/fit,sy=h/2+39/fit,tile=(Math.floor(sx/80)+Math.floor(sy/80))%2;
  const expected=[(i*23+35+tile*45)%220,(i*47+65+Math.floor(sy/h*40))%220,(i*71+90+Math.floor(sx/w*40))%220];
  const rgb=Array.from(frame.subarray(a,a+3));if(rgb.some((v,c)=>Math.abs(v-expected[c])>28))throw Error(name+': incorrect image '+i+' '+rgb+' expected '+expected);
  // Caption stroke pixels must occur in its central band, away from image borders.
  let white=0;for(let y=264;y<307;y++)for(let x=160;x<480;x++){const a=(y*640+x)*3;if(frame[a]>230&&frame[a+1]>230&&frame[a+2]>230)white++;}
  if(white<60)throw Error(name+': caption missing for scene '+(i+1));
  scenes.push({scene:i+1,rgb,captionWhitePixels:white});
 }
 execFileSync(ffmpeg,['-threads','1','-y','-v','error','-i',file,'-vf',`select='${select}',scale=384:216,tile=2x5`,'-frames:v','1','-threads','1',path.join(dir,name+'-contact-sheet.png')]);
 return{name,frameCount:Number(video.nb_read_frames),duration:Number(metadata.format.duration),playable:true,blackFrames:false,scenes};
}
const result={baseline:check('baseline'),optimized:check('optimized')};
const comparison=spawnSync(ffmpeg,['-threads','1','-v','info','-i',path.join(dir,'baseline.mp4'),'-threads','1','-i',path.join(dir,'optimized.mp4'),'-filter_complex_threads','1','-lavfi','[0:v][1:v]ssim=stats_file=ssim.log','-f','null','-'],{cwd:dir,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
if(comparison.status!==0)throw Error(comparison.stderr);
result.ssim=comparison.stderr.match(/SSIM Y:[^\r\n]+/)?.[0];
const frames=fs.readFileSync(path.join(dir,'ssim.log'),'utf8').trim().split('\n').map(line=>Number(line.match(/All:([\d.]+)/)[1]));
result.minimumFrameSSIM=Math.min(...frames);result.meanFrameSSIM=frames.reduce((a,b)=>a+b,0)/frames.length;
if(frames.length!==1800||result.minimumFrameSSIM<.97)throw Error('Visual equivalence below required threshold: '+result.minimumFrameSSIM);
fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
