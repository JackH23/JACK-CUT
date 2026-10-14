// Offline harness smoke test. Synthetic inputs are NOT representative evidence.
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {compile}=require('./compileGraph.cjs'),{render}=require('./runProject.cjs'),{compare}=require('./compareProject.cjs');
async function main(){
 const [repository,outputDir]=process.argv.slice(2),root=path.resolve(outputDir);fs.mkdirSync(root,{recursive:true});
 const ffmpeg=process.env.FFMPEG_PATH||'ffmpeg',ffprobe=process.env.FFPROBE_PATH||'ffprobe';
 const image=path.join(root,'source.png'),audio=path.join(root,'source.wav');
 execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=s=320x180,format=rgba,colorchannelmixer=aa=0.65','-frames:v','1','-y',image]);
 execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=0.6','-y',audio]);
 const snapshot={projectId:'dd992cea-76b0-4476-aa42-f7283d421c7c',assets:[{id:'image',media_type:'image',localPath:image},{id:'audio',media_type:'audio',localPath:audio}],items:[
 {item_type:'MEDIA',media_id:'image',start_time:0,duration:.6,media_scale:.713,media_x:17.3,media_y:-11.7,animation_in_preset:'fade-in',animation_in_duration:.45,animation_in_amount:37.5,animation_out_preset:'fade-out',animation_out_duration:.45,animation_out_amount:50},
 {item_type:'MEDIA',media_id:'audio',start_time:0,duration:.6,source_start:0},
 {item_type:'TEXT',text_content:'Harness validation only',start_time:0,duration:.6,text_x:50,text_y:70,font_family:'Arial',animation_in_preset:'fade',animation_in_duration:.2,animation_in_amount:50}]};
 const results={variants:{},productionFixed:false,harnessSmokeOnly:true};
 for(const variant of ['baseline','optimized']){const folder=path.join(root,variant+'-0');const prepared=await compile({repository,bundle:snapshot,workDir:folder,variant,baselineRef:'d21b5c5b505eb3f195a76066f722657601130e81',settings:{threads:1,preset:'medium',encoder:'libx264',prepareConcurrency:2},ffprobe});const job=await render(ffmpeg,prepared,folder,Date.now()+7200000);if(job.exitCode!==0)throw Error('Smoke render failed: '+variant);results.variants[variant]={jobs:[job],completedWithinTwoHours:false};}
 fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(results,null,2));await compare({outputDir:root,snapshot});
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
