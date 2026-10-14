const fs=require('fs'),vm=require('vm'),path=require('path'),cp=require('child_process'),{spawnSync}=cp;
const root=path.resolve(__dirname,'../..');
const dir=path.resolve(process.env.EXPORT_BENCHMARK_DIR || path.join(require('os').tmpdir(),'jackcut-export-benchmark'));
fs.mkdirSync(dir,{recursive:true});
if(process.argv.includes('--baseline')) {
 const ref=process.argv.find(arg=>arg.startsWith('--baseline-ref='))?.split('=')[1] || 'd21b5c5b505eb3f195a76066f722657601130e81';
 for(const file of ['backend/controllers/exportController.js','backend/utils/clipAnimationFilter.js']) {
  let baseline=cp.execFileSync('git',['show',ref+':'+file],{cwd:root,encoding:'utf8'});
  if(file.includes('clipAnimation')) baseline=baseline.replace("require('../../frontend/lib/mediaAnimation')", 'require('+JSON.stringify(root+'/frontend/lib/mediaAnimation')+')').replace("require('./mediaLayout')", 'require('+JSON.stringify(root+'/backend/utils/mediaLayout')+')');
  fs.writeFileSync(dir+'/'+path.basename(file),baseline);
 }
}
let source=fs.readFileSync(root+'/backend/tests/exportMediaGeometry.test.cjs','utf8').split("test('real controller carries")[0].replace("const root=path.resolve(__dirname,'..');",`const root=${JSON.stringify(root+'/backend')};`).replace('writeFileSync(_, content){assContent=content;}',`writeFileSync(file, content){if(file.endsWith('.cmd')) fs.writeFileSync(path.join(${JSON.stringify(dir)},path.basename(file)),content);else assContent=content;}`);
if(process.argv.includes('--baseline')) source=source.replace("fs.readFileSync(path.join(root,'controllers/exportController.js'),'utf8')",`fs.readFileSync(${JSON.stringify(path.join(dir,'exportController.js'))},'utf8')`).replace("if(n==='../utils/mediaStreams')",`if(n==='../utils/clipAnimationFilter')return require(${JSON.stringify(path.join(dir,'clipAnimationFilter.js'))});if(n==='../utils/mediaStreams')`);
const context={require,console:{log(){},error(){}},Buffer,setImmediate,__dirname:root+'/backend/tests',process};vm.createContext(context);vm.runInContext(source+';globalThis.create=create;',context);

const ffmpeg=process.env.FFMPEG_PATH || 'ffmpeg';
async function main(){
 const mode=process.argv[2]||'before',long=process.argv.includes('--long');
 const selectedCase=process.argv.find(arg=>arg.startsWith('--case='))?.split('=')[1];
 const results=selectedCase && fs.existsSync(dir+'/'+mode+'-results.json')?JSON.parse(fs.readFileSync(dir+'/'+mode+'-results.json')):[];
 const matrix=process.argv.includes('--matrix');
 for(const preset of long?['mixed-600']:matrix?['fade0','fade1','fade25','fade50','fade75','fade100','legacy','transformed','overlap','video','fx']:['fade-in','zoom-in','slide-right','large']){
  if(selectedCase && selectedCase!==preset)continue;
  const duration=long?600:matrix?.6:3, count=long?3:preset==='large'?24:1;
  const items=Array.from({length:count},(_,i)=>({item_type:'MEDIA',media_id:'source',start_time:i*duration/count,duration:duration/count,media_scale:1,animation_in_preset:preset==='large'||long?'fade-in':preset,animation_in_duration:Math.min(.7,duration/count),animation_in_amount:50,animation_out_preset:'fade-out',animation_out_duration:.7,animation_out_amount:50}));
  if(long)items.forEach((item,i)=>item.animation_in_preset=['fade-in','zoom-in','slide-right'][i]);
  if(matrix){items[0].animation_in_preset='fade-in';items[0].animation_in_amount=Number(preset.replace('fade',''))||50;items[0].animation_out_amount=items[0].animation_in_amount;if(preset==='fade0')items[0].animation_in_amount=items[0].animation_out_amount=0;if(preset==='legacy'){delete items[0].animation_in_preset;delete items[0].animation_out_preset;items[0].animation_preset='fade-out';items[0].animation_amount=50;}if(preset==='transformed')Object.assign(items[0],{media_scale:.713,media_x:17.3,media_y:-11.7});if(preset==='overlap')items[0].animation_in_duration=items[0].animation_out_duration=2.3;}
  if(matrix){if(preset==='legacy'){for(const key of ['animation_in_preset','animation_in_duration','animation_in_amount','animation_out_preset','animation_out_duration','animation_out_amount'])delete items[0][key];}else items[0].animation_in_duration=items[0].animation_out_duration=preset==='overlap'?.45:.2;}
  if(preset==='fx')items[0].effect_preset='cinematic';
  items.push({item_type:'TEXT',text_content:'JACK-CUT export validation',start_time:0,duration,text_x:50,text_y:70,font_family:'Arial',animation_in_preset:'fade',animation_in_duration:1,animation_in_amount:50});
  const {args,assContent}=await context.create({mediaType:preset==='video'?'video':'image',hasAudio:false,items});
  const image=dir+'/source.png';if(!fs.existsSync(image)){
   const g=spawnSync(ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=s=1920x1080,format=rgba,colorchannelmixer=aa=0.65','-frames:v','1',image]);if(g.status)throw Error(g.stderr.toString());
  }
  const ass=dir+'/'+preset+'.ass';fs.writeFileSync(ass,assContent);
  let input=image;if(preset==='video'){input=dir+'/transparent.mov';if(!fs.existsSync(input)){const r=spawnSync(ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=s=1920x1080:r=30:d=0.6,format=argb,colorchannelmixer=aa=0.65','-c:v','qtrle',input]);if(r.status)throw Error(r.stderr.toString());}}
  const actual=args.map(v=>v.endsWith('/uploads/media/source.mp4')?input:v);
  actual[actual.indexOf('-filter_complex')+1]=actual[actual.indexOf('-filter_complex')+1].replace(/ass='[^']*'/,`ass='${preset}.ass'`).replace(/sendcmd=f='[^']*\/(fade-\d+\.cmd)'/g,(_,file)=>{const name=mode+'-'+preset+'-'+file;fs.copyFileSync(dir+'/'+file,dir+'/'+name);return `sendcmd=f='${name}'`;});
  // Replace the silent base audio with a measurable tone; retain controller audio graph.
  const ai=actual.findIndex(v=>v.startsWith('anullsrc'));if(ai>=0)actual[ai]=`sine=frequency=440:sample_rate=48000:duration=${duration}`;
  const output=dir+'/'+mode+'-'+preset+'.mp4';actual[actual.length-1]=output;
  fs.writeFileSync(dir+'/'+mode+'-'+preset+'-args.json',JSON.stringify(actual,null,2));
  const started=Date.now();const run=spawnSync(ffmpeg,['-hide_banner','-benchmark',...actual],{cwd:dir,encoding:'utf8',maxBuffer:10000000});
  fs.writeFileSync(dir+'/'+mode+'-'+preset+'.log',run.stderr);
  if(run.status)throw Error(run.stderr.slice(-4000));
  const row={mode,preset,duration,seconds:(Date.now()-started)/1000,benchmark:run.stderr.match(/bench:.*maxrss.*/)?.[0],output};const prior=results.findIndex(r=>r.preset===preset);if(prior>=0)results[prior]=row;else results.push(row);console.log(JSON.stringify(row));fs.writeFileSync(dir+'/'+mode+'-results.json',JSON.stringify(results,null,2));
 }
}
main().then(()=>process.exit()).catch(e=>{console.error(e);process.exit(1);});
