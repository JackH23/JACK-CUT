// Synthetic fixtures and actual-controller command capture; never opens the application database.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(__dirname,'..'), dir=path.join(__dirname,'results');fs.mkdirSync(dir,{recursive:true});
async function capture(mode='optimized',duration=60,render=false){
 const count=10, length=duration/count,items=[],media=[];
 for(let i=0;i<count;i++){
  const id='scene'+i,file=path.join(dir,id+'.png');
  if(!fs.existsSync(file)){
   const w=i%3===0?1440:2560,h=i%3===0?2560:1440,b=Buffer.alloc(w*h*3);
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){const at=(y*w+x)*3,tile=(Math.floor(x/80)+Math.floor(y/80))%2;
    b[at]=(i*23+35+tile*45)%220;b[at+1]=(i*47+65+Math.floor(y/h*40))%220;b[at+2]=(i*71+90+Math.floor(x/w*40))%220;
    if(x<8||y<8||x>=w-8||y>=h-8){b[at]=255;b[at+1]=255;b[at+2]=255;}
   }
   const ppm=path.join(dir,id+'.ppm');fs.writeFileSync(ppm,Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`),b]));
   execFileSync(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','error','-threads','1','-i',ppm,'-frames:v','1','-threads','1',file]);fs.unlinkSync(ppm);
  }
  media.push({id,file_path:file,media_type:'image'});
  items.push({id,item_type:'MEDIA',media_id:id,start_time:i*length,duration:length,media_scale:i%4===0?.8:1,media_x:i%4===0?25:0,media_y:i%4===0?-12:0,
   animation_in_preset:['zoom-in','slide-left','fade-in','slide-right'][i%4],animation_in_duration:Math.min(1,length/3),animation_in_amount:65,
   animation_out_preset:['fade-out','zoom-out','slide-right','slide-left'][i%4],animation_out_duration:Math.min(1,length/3),animation_out_amount:65});
  items.push({id:'caption'+i,item_type:'TEXT',text_content:`Scene ${String(i+1).padStart(2,'0')} - Storytelling caption`,start_time:i*length,duration:length,
   text_x:50,text_y:80,font_size:22,font_family:'Arial',font_weight:600,text_color:'#ffffff',animation_in_preset:'fade-in',animation_in_duration:.5,animation_in_amount:100,
   animation_out_preset:'fade-out',animation_out_duration:.5,animation_out_amount:100});
 }
 const row={};let cancellationRequestedAt,childClosedAt;let child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();let args;
 const mocks={
  '../models/ExportJob':{create:async v=>Object.assign(row,{cancel_requested_at:null,...v}),findOne:async()=>null,findByPk:async()=>row,update:async v=>{Object.assign(row,v);return[1];}},
  '../models/Project':{sequelize:{transaction:async cb=>cb({LOCK:{UPDATE:'UPDATE'}})},findOne:async()=>({})},
  '../models/TimelineItem':{findAll:async()=>items},'../models/Media':{findAll:async()=>media},'../models/ProjectMedia':{findOne:async()=>({})},
  '../services/storage':{workspace:async()=>dir,materialize:async ref=>ref,referenceFor:key=>'r2:/'+key,persist:async()=> 'r2:/exports/fixture.mp4',cleanup:async()=>{}},
  '../services/fileAccess':{}, 'node:child_process':{spawn:(_,a)=>{args=a;
   if(render){
    args[args.length-1]=path.join(dir,mode+'.mp4');
    fs.writeFileSync(path.join(dir,mode+'-controller-progress.log'),'');fs.writeFileSync(path.join(dir,mode+'-controller-stderr.log'),'');
    child=require('node:child_process').spawn(process.env.FFMPEG_PATH||'ffmpeg',args,{cwd:dir,windowsHide:true});
    const cancel=()=>{cancellationRequestedAt=Date.now();void m.exports.cancelExport({params:{id:row.id},user:{id:'fixture'}},{status(){return this;},json(){}});};
    child.once('close',()=>{childClosedAt=Date.now();});
    if(mode.endsWith('-cancel'))setTimeout(cancel,2500);
    if(mode.endsWith('-cancel-render')){
     let progress='',requested=false;
     child.stdout.on('data',chunk=>{progress+=chunk;if(!requested&&/frame=[1-9]\d*/.test(progress)){requested=true;setTimeout(cancel,1000);}if(progress.length>20000)progress=progress.slice(-10000);});
    }
    child.stdout.on('data',chunk=>{fs.appendFileSync(path.join(dir,mode+'-controller-progress.log'),chunk);});
    child.stderr.on('data',chunk=>{fs.appendFileSync(path.join(dir,mode+'-controller-stderr.log'),chunk);});
   }
   return child;
  }},'node:crypto':{randomUUID:()=> '66ec12e5-244b-43e2-b36e-57bec761ade8'},
 };
 if(mode.startsWith('baseline')){
  const m={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(dir,'baseline-animation.js'),'utf8'),{module:m,exports:m.exports,require:n=>require(path.resolve(root,'utils',n))});mocks['../utils/clipAnimationFilter']=m.exports;
 }
 const filename=mode.startsWith('baseline')?path.join(dir,'baseline-controller.js'):path.join(root,'controllers/exportController.js');
 const m={exports:{}};vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module:m,exports:m.exports,require:n=>Object.hasOwn(mocks,n)?mocks[n]:n.startsWith('.')?require(path.resolve(root,'controllers',n)):require(n),process:{env:{FFMPEG_VIDEO_ENCODER:'libx264'},cwd:()=>root},console:{log(){},error(){}},Buffer});
 await m.exports.createExport({body:{projectId:'76ec12e5-244b-43e2-b36e-57bec761ade8'},user:{id:'fixture'}},{status(){return this;},json(){}});
 for(let i=0;!args&&i<100;i++)await new Promise(r=>setTimeout(r,10));if(!args)throw Error('Command capture failed');
 const assOriginal=args[args.indexOf('-filter_complex')+1].match(/ass='([^']+)'/)[1];
 const ass=path.join(dir,mode+'.ass');fs.copyFileSync(path.join(dir,'66ec12e5-244b-43e2-b36e-57bec761ade8.ass'),ass);
 args[args.indexOf('-filter_complex')+1]=args[args.indexOf('-filter_complex')+1].replace(`ass='${assOriginal}'`,`ass='${mode}.ass'`);
 args[args.length-1]=path.join(dir,mode+'.mp4');
 if(render){
   const states=[];let previous;
   while(row.status==='processing'){
    if(row.progress!==previous){previous=row.progress;states.push({progress:row.progress,stage:row.stage});}
    await new Promise(r=>setTimeout(r,100));
   }
   states.push({progress:row.progress,stage:row.stage,status:row.status});
   fs.writeFileSync(path.join(dir,mode+'-controller-state.json'),JSON.stringify({status:row.status,error:row.error_message,outputReference:row.output_path,states,metrics:row.metrics,cancellationRequestedAt,childClosedAt,cancelToCloseMs:cancellationRequestedAt?childClosedAt-cancellationRequestedAt:undefined},null,2));
   if(row.status!==((mode.endsWith('-cancel')||mode.endsWith('-cancel-render'))?'cancelled':'completed'))throw Error('Controller export failed: '+row.error_message);
  }else{child.emit('close',1);await new Promise(r=>setImmediate(r));}
 const manifest={mode,duration,width:1920,height:1080,fps:30,imageCount:count,subtitleCount:count,args,items,media,ffmpegVersion:execFileSync(process.env.FFMPEG_PATH||'ffmpeg',['-version'],{encoding:'utf8'}).split('\n')[0]};
 fs.writeFileSync(path.join(dir,mode+'-command.json'),JSON.stringify(manifest,null,2));return manifest;
}
module.exports={capture};
if(require.main===module)capture(process.argv[2]||'optimized',Number(process.argv[3]||60),process.argv[4]==='render').then(m=>console.log(JSON.stringify({mode:m.mode,duration:m.duration,inputs:m.media.length}))).catch(e=>{console.error(e);process.exitCode=1;});
