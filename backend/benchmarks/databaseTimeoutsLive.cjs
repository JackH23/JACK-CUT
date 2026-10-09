/* Live regression: creates and retains a new loopback-only PostgreSQL database.
 * No production URLs, R2, existing rows or schemas are used or removed.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const local=require('dotenv').parse(fs.readFileSync(path.resolve(__dirname,'../.env')));
assert(['localhost','127.0.0.1','::1'].includes(local.DB_HOST),'Loopback PostgreSQL only');
const database='dbbudget_'+Date.now(),dir=path.join(__dirname,'results',database);fs.mkdirSync(dir);
const evidence={database,scenarios:[],result:'RUNNING'};const save=()=>fs.writeFileSync(path.join(dir,'evidence.json'),JSON.stringify(evidence,null,2));save();
Object.assign(process.env,{NODE_ENV:'development',DB_HOST:local.DB_HOST,DB_PORT:local.DB_PORT,DB_USER:local.DB_USER,DB_PASSWORD:local.DB_PASSWORD,DB_NAME:database,DB_LOCK_TIMEOUT_MS:'200',DB_STATEMENT_TIMEOUT_MS:'500'});delete process.env.DATABASE_URL;
const {Client}=require('pg');const admin=new Client({host:local.DB_HOST,port:Number(local.DB_PORT),user:local.DB_USER,password:local.DB_PASSWORD,database:local.DB_NAME,connectionTimeoutMillis:3000});
let db;
async function main(){
 await admin.connect();await admin.query('CREATE DATABASE "'+database+'"');await admin.end();
 db=require('../config/database');const Job=require('../models/ExportJob');const {Op}=require('sequelize');
 await db.query('CREATE TABLE projects (id UUID PRIMARY KEY)');await Job.sync();
 const traces=[];const worker=require('../services/exportLifecycle').createExportLifecycle({ExportJob:Job,Op,sequelize:db,env:{EXPORT_LEASE_TIMEOUT_MS:'5000'},trace:(event,job={},detail={})=>traces.push({event,id:job.id,...detail,error:detail.error?{code:detail.error.original?.code}:undefined})});
 async function fresh(){const id=randomUUID(),workerToken=randomUUID();await Job.create({id,worker_token:workerToken,heartbeat_at:new Date(),status:'processing'});return{id,workerToken,createdAt:Date.now(),status:'processing',progress:42};}
 async function lock(job){const t=await db.transaction();await db.query('SELECT id FROM export_jobs WHERE id=:id FOR UPDATE',{replacements:{id:job.id},transaction:t});return t;}
 async function rejectCode(action,code){const at=Date.now();await assert.rejects(action,e=>e.original?.code===code);const elapsedMs=Date.now()-at;assert(elapsedMs<2500);return elapsedMs;}
 const [settings]=await db.query("SELECT current_setting('lock_timeout') AS lock, current_setting('statement_timeout') AS statement, current_setting('idle_in_transaction_session_timeout') AS idle");assert.equal(settings[0].lock,'200ms');assert.equal(settings[0].statement,'500ms');evidence.settings=settings[0];
 let job=await fresh();job.status='completed';job.outputReference='fixture.mp4';let held=await lock(job);
 try{const elapsedMs=await rejectCode(worker.finish(job),'55P03');assert.equal((await Job.findByPk(job.id)).status,'processing');evidence.scenarios.push({name:'terminal lock timeout rolls back',elapsedMs,result:'PASS'});}finally{await held.rollback();}
 await worker.finish(job);assert.equal((await Job.findByPk(job.id)).status,'completed');evidence.scenarios.push({name:'completion retry after unlock',result:'PASS'});
 const before=(await Job.findByPk(job.id)).progress; const elapsedMs=await rejectCode(db.transaction(async t=>{await Job.update({progress:17},{where:{id:job.id},transaction:t});await db.query('SELECT pg_sleep(2)',{transaction:t});}),'57014');assert.equal((await Job.findByPk(job.id)).progress,before);await db.query('SELECT 1');evidence.scenarios.push({name:'statement timeout rolls back and pooled connection remains usable',elapsedMs,result:'PASS'});
 job=await fresh();worker.register(job);await worker.requestCancel(job.id);job.status='cancelled';held=await lock(job);
 try{await rejectCode(worker.finish(job),'55P03');await rejectCode(worker.finish(job),'55P03');const row=await Job.findByPk(job.id);assert.equal(row.status,'processing');assert(row.cancel_requested_at);assert.equal(traces.some(t=>t.id===job.id&&t.event==='terminal_committed'),false);}finally{worker.release(job);await held.rollback();}
 await Job.update({heartbeat_at:new Date(Date.now()-10000)},{where:{id:job.id}});await worker.reconcile();let row=await Job.findByPk(job.id);assert.equal(row.status,'cancelled');assert.equal(row.error_message,null);assert.equal(row.output_path,null);await worker.finish(job);assert.equal((await Job.findByPk(job.id)).status,'cancelled');evidence.scenarios.push({name:'durable cancellation recovers after both terminal retries time out; late owner cannot overwrite',result:'PASS'});
 job=await fresh();worker.register(job);held=await lock(job);
 try{await rejectCode(worker.requestCancel(job.id),'55P03');assert.equal(job.cancelRequested,undefined);assert.equal((await Job.findByPk(job.id)).cancel_requested_at,null);}finally{await held.rollback();}
 await worker.requestCancel(job.id);job.status='cancelled';await worker.finish(job);worker.release(job);assert.equal((await Job.findByPk(job.id)).status,'cancelled');evidence.scenarios.push({name:'cancel request timeout is not falsely acknowledged; retry confirms cancellation',result:'PASS'});
 // A download transaction can stay open longer than statement_timeout between SQLs.
 const cleanup=require('../services/exportCleanupService').createExportCleanupService({sequelize:db,ExportJob:Job,storage:{},Op});
 await cleanup.withDownload(job.id,async row=>{assert(row);await new Promise(r=>setTimeout(r,650));});evidence.scenarios.push({name:'long download callback does not inherit a transaction lifetime timeout',result:'PASS'});
 evidence.result='PASS';save();console.log(JSON.stringify({dir,...evidence}));
}
main().catch(e=>{evidence.result='FAIL';evidence.error={name:e.name,code:e.original?.code,message:e.message};save();console.error(e.name,e.original?.code||'assertion');process.exitCode=1;}).finally(async()=>{if(db)await db.close();await admin.end().catch(()=>{});});
