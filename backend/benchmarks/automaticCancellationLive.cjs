/* Isolated live PostgreSQL/API/native-FFmpeg acceptance harness.
 * Creates a new local database and uniquely named media; retains evidence.
 * Never loads production NODE_ENV or uses R2. No existing records are deleted.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),{spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),run='predeploy_'+Date.now(),dir=path.join(__dirname,'results',run);
fs.mkdirSync(dir,{recursive:false});
const local=require('dotenv').parse(fs.readFileSync(path.join(root,'.env')));
assert(['127.0.0.1','localhost','::1'].includes(local.DB_HOST),'Local PostgreSQL only');
const database=run,port=Number(process.env.PREDEPLOY_PORT||5001),scratch=path.join(dir,'scratch');
const env={...process.env,...local,NODE_ENV:'development',STORAGE_DRIVER:'local',DB_NAME:database,PORT:String(port),TEMP_STORAGE_DIR:scratch,FFMPEG_THREADS:'1',EXPORT_MAX_CONCURRENT_RENDERS:'1',EXPORT_CLEANUP_ENABLED:'false',JWT_SECRET:randomUUID(),JWT_EXPIRES_IN:'1h',REFRESH_TOKEN_EXPIRES_IN_DAYS:'1',FFPROBE_PATH:execFileSync('where.exe',['ffprobe'],{encoding:'utf8'}).trim().split(/\r?\n/)[0]};
for(const key of ['DATABASE_URL','R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET_NAME','R2_ENDPOINT'])delete env[key];
const {Client}=require('pg'),admin=new Client({host:local.DB_HOST,port:Number(local.DB_PORT),user:local.DB_USER,password:local.DB_PASSWORD,database:local.DB_NAME,connectionTimeoutMillis:3000});
let backend,other,sequelize,token;
const evidence={run,database,postgresPort:Number(local.DB_PORT),backendPort:port,scratch,scenarios:[],startedAt:new Date().toISOString()};
const save=()=>fs.writeFileSync(path.join(dir,'evidence.json'),JSON.stringify(evidence,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function requireFreePort(port){await new Promise((resolve,reject)=>{const server=require('node:net').createServer();server.once('error',()=>reject(new Error('Refusing occupied local test port '+port)));server.listen({host:'127.0.0.1',port,exclusive:true},()=>server.close(resolve));});}
function start(port,file){const out=fs.openSync(path.join(dir,file),'wx');const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...env,PORT:String(port)},stdio:['ignore',out,out],windowsHide:true});fs.closeSync(out);return child;}
async function ready(p){for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:'+p+'/health')).ok)return;}catch{}await delay(200);}throw Error('Local backend did not start');}
async function api(route,body,p=port){const r=await fetch('http://127.0.0.1:'+p+'/api'+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const json=await r.json();assert(r.ok,route+' HTTP '+r.status+' '+JSON.stringify(json));return json;}
async function terminal(id,limit=900000){const started=Date.now(),states=[];let last;while(Date.now()-started<limit){const row=await api('/exports/'+id);const key=row.status+':'+row.stage+':'+row.progress;if(key!==last){states.push({at:Date.now()-started,status:row.status,stage:row.stage,progress:row.progress,cancelRequested:row.cancelRequested});last=key;if(row.progress%20===0)console.log(JSON.stringify({event:'progress',job:id,...states.at(-1)}));}if(row.status!=='processing')return{row,states,durationMs:Date.now()-started};await delay(500);}throw Error('Terminal deadline exceeded');}
async function rendering(id){for(let i=0;i<240;i++){const row=await api('/exports/'+id);if(row.status!=='processing')throw Error('Render ended before cancellation');if(row.progress>0)return row;await delay(250);}throw Error('No active FFmpeg progress');}
async function clean(){const at=Date.now();for(let i=0;i<100;i++){if(!fs.existsSync(scratch)||fs.readdirSync(scratch).filter(name=>name.startsWith('render-')).length===0)return Date.now()-at;await delay(50);}throw Error('Scratch cleanup did not settle');}
function validate(file,duration){const probe=JSON.parse(execFileSync(env.FFPROBE_PATH,['-v','error','-count_frames','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}));const video=probe.streams.find(s=>s.codec_type==='video');assert.equal(video.width,1920);assert.equal(video.height,1080);assert.equal(video.avg_frame_rate,'30/1');assert.equal(Number(video.nb_read_frames),duration*30);assert(Math.abs(Number(probe.format.duration)-duration)<.1);execFileSync('ffmpeg',['-v','error','-threads','1','-i',file,'-f','null','-'],{stdio:['ignore','ignore','pipe']});return{file,duration:probe.format.duration,frames:video.nb_read_frames,width:video.width,height:video.height,decode:'PASS'};}
async function main(){
 assert([5001,5003].includes(port),'Approved loopback test ports only');await requireFreePort(port);await requireFreePort(port+1);
 await admin.connect();await admin.query('CREATE DATABASE "'+database+'"');await admin.end();Object.assign(process.env,env);
 backend=start(port,'backend.log');await ready(port);
 sequelize=require('../config/database');await sequelize.authenticate();
 const password='Isolated-'+randomUUID(),email=run+'@example.invalid';
 const auth=await api('/auth/register',{name:'Isolated predeployment test',email,password});token=auth.token;
 assert((await api('/auth/me')).user.id===auth.user.id);const login=await api('/auth/login',{email,password});assert(login.token);
 fs.writeFileSync(path.join(dir,'browser-auth.json'),JSON.stringify({email,password,token,refreshToken:auth.refreshToken}),{flag:'wx'});
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'results','optimized-command.json')));
 const Media=require('../models/Media'),ProjectMedia=require('../models/ProjectMedia'),Item=require('../models/TimelineItem'),Track=require('../models/TimelineTrack'),Job=require('../models/ExportJob');
 await Track.create({id:'predeploy-video',name:'Test Video',type:'video',color:'#ffffff',sort_order:0});
 const media=[];
 for(const source of manifest.media){const id=randomUUID(),filename=id+'.png',dest=path.join(root,'uploads','media',filename);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(source.file_path,dest,fs.constants.COPYFILE_EXCL);media.push(await Media.create({id,original_name:filename,file_name:filename,file_path:dest,file_url:'/test',mime_type:'image/png',media_type:'image',file_size:fs.statSync(dest).size}));}
 async function project(name,simple=false){const p=(await api('/projects',{name:run+' '+name})).project;const items=simple?manifest.items.slice(0,2):manifest.items;for(const m of media)await ProjectMedia.create({project_id:p.id,media_id:m.id});for(const item of items){const {id,media_id,...data}=item;await Item.create({...data,project_id:p.id,track_id:'predeploy-video',...(media_id?{media_id:media[Number(media_id.slice(5))].id}:{}),...(simple?{start_time:0,duration:5}: {})});}assert((await api('/projects/'+p.id)).project.id===p.id);return p.id;}
 const simple=await project('simple',true),story=await project('story',process.env.PREDEPLOY_VALIDATE_STATUS_MIGRATION==='true');
 evidence.projectIds={simple,story};evidence.authentication='PASS';evidence.projectListing=(await api('/projects')).projects.length;save();
 async function complete(projectId,label,duration){const start=Date.now(),job=await api('/exports',{projectId});const result=await terminal(job.id);assert.equal(result.row.status,'completed');assert.equal(result.row.progress,100);const row=await Job.findByPk(job.id);assert.equal(row.status,'completed');const validation=validate(row.output_path,duration);const cleanupWaitMs=await clean();const record={label,id:job.id,result:'PASS',elapsedMs:Date.now()-start,states:result.states,validation,cleanupWaitMs};evidence.scenarios.push(record);save();console.log(JSON.stringify({event:'complete',label,id:job.id,elapsedMs:record.elapsedMs}));return record;}
 await complete(simple,'A simple export',5);

 const completed=evidence.scenarios[0];assert(completed.states.every(state=>!state.cancelRequested&&state.stage!=='cancelling'));
 const pendingId=randomUUID();await Job.create({id:pendingId,project_id:story,status:'processing',stage:'cancelling',progress:3,worker_token:randomUUID(),heartbeat_at:new Date(),cancel_requested_at:new Date()});
 const r=await fetch('http://127.0.0.1:'+port+'/api/exports',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({projectId:story})});const rejected=await r.json();assert.equal(r.status,409);assert.equal(rejected.code,'EXPORT_CANCELLATION_PENDING');
 assert.equal(await Job.count({where:{project_id:story}}),1);assert((await Job.findByPk(pendingId)).cancel_requested_at);
 evidence.scenarios.push({label:'Already cancelling job at 3% is rejected without reuse or new renderer',result:'PASS',status:r.status});
 const events=fs.readFileSync(path.join(dir,'backend.log'),'utf8').split(/\r?\n/).filter(l=>l.startsWith('{"component":"export_lifecycle"')).map(JSON.parse);assert(!events.some(e=>e.event==='cancel_request_begin'));assert(events.some(e=>e.event==='create_rejected_cancelling'&&e.jobId===pendingId));
 if(process.env.PREDEPLOY_VALIDATE_STATUS_MIGRATION==='true'){
  await sequelize.query("ALTER TABLE public.export_jobs ADD CONSTRAINT export_jobs_status_check CHECK (status IN ('processing','completed','failed'))");
  await Job.update({heartbeat_at:new Date(Date.now()-60000)},{where:{id:pendingId}});
  const worker=require('../services/exportLifecycle').createExportLifecycle({ExportJob:Job,Op:require('sequelize').Op,sequelize});
  await assert.rejects(worker.reconcile(),e=>e.original?.code==='23514');
  await sequelize.query(fs.readFileSync(path.join(root,'scripts/migrations/20261010-export-jobs-cancelled.sql'),'utf8'));
  await worker.reconcile();assert.equal((await Job.findByPk(pendingId)).status,'cancelled');
  evidence.scenarios.push({label:'Cancelling conflict recovers through migrated CHECK',result:'PASS',id:pendingId});
  const fresh=await complete(story,'Same project new export after migrated cancellation recovery',5);assert.notEqual(fresh.id,pendingId);assert(fresh.states.every(state=>!state.cancelRequested&&state.stage!=='cancelling'));
 }
 evidence.result='PASS';save();console.log(JSON.stringify({event:'finished',dir,result:evidence.result}));

}
main().catch(error=>{evidence.result='FAIL';evidence.error={name:error.name,message:error.message};save();console.error(error.stack);process.exitCode=1;}).finally(async()=>{if(sequelize)await sequelize.close();for(const child of [backend,other])if(child&&!child.killed)child.kill();await admin.end().catch(()=>{});console.log(JSON.stringify({event:'evidence',dir,result:evidence.result}));});

