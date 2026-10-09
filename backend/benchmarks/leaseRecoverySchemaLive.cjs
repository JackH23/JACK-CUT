/* Disposable loopback DB only. Production schema metadata, never production rows. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const local=require('dotenv').parse(fs.readFileSync(path.resolve(__dirname,'../.env')));
assert(['localhost','127.0.0.1','::1'].includes(local.DB_HOST));
const database='lease_schema_'+Date.now(),dir=path.join(__dirname,'results',database);fs.mkdirSync(dir);
const evidence={database,scenarios:[],result:'RUNNING'},save=()=>fs.writeFileSync(path.join(dir,'evidence.json'),JSON.stringify(evidence,null,2));save();
Object.assign(process.env,{NODE_ENV:'development',DB_HOST:local.DB_HOST,DB_PORT:local.DB_PORT,DB_USER:local.DB_USER,DB_PASSWORD:local.DB_PASSWORD,DB_NAME:database,DB_LOCK_TIMEOUT_MS:'200',DB_STATEMENT_TIMEOUT_MS:'500'});delete process.env.DATABASE_URL;
const {Client}=require('pg'),admin=new Client({host:local.DB_HOST,port:Number(local.DB_PORT),user:local.DB_USER,password:local.DB_PASSWORD,database:local.DB_NAME,connectionTimeoutMillis:3000});let db;
async function main(){
 await admin.connect();await admin.query('CREATE DATABASE "'+database+'"');await admin.end();
 db=require('../config/database');const Job=require('../models/ExportJob'),{Op}=require('sequelize');
 await db.query(fs.readFileSync(path.resolve(__dirname,'../tests/fixtures/exportJobsProduction.sql'),'utf8'));
 const traces=[],worker=require('../services/exportLifecycle').createExportLifecycle({ExportJob:Job,Op,sequelize:db,env:{EXPORT_LEASE_TIMEOUT_MS:'5000'},trace:(event,job={},detail={})=>traces.push({event,operation:detail.recoveryOperation,code:detail.error?.original?.code})});
 const old=new Date(Date.now()-10000),id=randomUUID(),token=randomUUID();
 await Job.create({id,worker_token:token,heartbeat_at:old,stage:'cancelling',progress:3,cancel_requested_at:old});
 await assert.rejects(worker.reconcile(),error=>{
  assert.equal(error.name,'SequelizeDatabaseError');assert.equal(error.original.code,'23514');assert.equal(error.original.constraint,'export_jobs_status_check');
  // Bind placeholders only: Sequelize's error.sql contains no bind parameter values here.
  assert(!error.sql.includes(id));fs.writeFileSync(path.join(dir,'failing-operation.sql'),error.sql);
  evidence.failure={name:error.name,sqlState:error.original.code,constraint:error.original.constraint};return true;
 });
 assert.equal((await Job.findByPk(id)).status,'processing');evidence.scenarios.push({name:'production CHECK rejects expired cancellation; row unchanged',result:'PASS'});save();
 const migration=path.resolve(__dirname,'../scripts/migrations/20261010-export-jobs-cancelled.sql');
 // Before the fix, this reruns the unmodified recovery and fails with 23514.
 const snapshot=async()=>{const [rows]=await db.query('SELECT * FROM public.export_jobs ORDER BY id');return JSON.stringify(rows);};
 const constraints=async()=>{const [rows]=await db.query("SELECT conname,contype,convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.export_jobs'::regclass AND conname <> 'export_jobs_status_check' ORDER BY conname");return JSON.stringify(rows);};
 for(const status of ['processing','completed','failed'])await Job.create({id:randomUUID(),status,progress:status==='completed'?100:0,heartbeat_at:new Date(),output_path:status==='completed'?'fixture.mp4':null,metrics:{fixture:true}});
 const metadata=async()=>{const [columns]=await db.query("SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='export_jobs' ORDER BY ordinal_position");const [indexes]=await db.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='export_jobs' ORDER BY indexname");const [triggers]=await db.query("SELECT tgname,pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgrelid='public.export_jobs'::regclass AND NOT tgisinternal ORDER BY tgname");return JSON.stringify({columns,indexes,triggers});};
 const beforeRows=await snapshot(),beforeConstraints=await constraints(),beforeMetadata=await metadata();
 if(fs.existsSync(migration))await db.query(fs.readFileSync(migration,'utf8'));
 assert.equal(await snapshot(),beforeRows);assert.equal(await constraints(),beforeConstraints);assert.equal(await metadata(),beforeMetadata);
 const [validation]=await db.query("SELECT convalidated FROM pg_constraint WHERE conrelid='public.export_jobs'::regclass AND conname='export_jobs_status_check'");assert.equal(validation[0].convalidated,true);
 evidence.scenarios.push({name:'migration preserves every row value, unrelated constraints, columns, indexes and triggers; new CHECK validated',result:'PASS'});
 await worker.reconcile();assert.equal((await Job.findByPk(id)).status,'cancelled');evidence.scenarios.push({name:'migrated schema permits expired cancellation',result:'PASS'});
 const repeatRows=await snapshot(),repeatConstraints=await constraints();await db.query(fs.readFileSync(migration,'utf8'));assert.equal(await snapshot(),repeatRows);assert.equal(await constraints(),repeatConstraints);evidence.scenarios.push({name:'migration repeat is safe',result:'PASS'});
 const row=await Job.findByPk(id);assert.equal(row.output_path,null);assert.equal(row.error_message,null);assert(row.completed_at);assert.equal(row.progress,3);
 await worker.finish({id,workerToken:token,status:'completed',progress:100,outputReference:'late.mp4'});assert.equal((await Job.findByPk(id)).status,'cancelled');
 evidence.scenarios.push({name:'late owner cannot overwrite recovered cancellation',result:'PASS'});
 const active=await Job.create({id:randomUUID(),worker_token:randomUUID(),heartbeat_at:new Date(),cancel_requested_at:new Date(),stage:'cancelling'});
 const stale=await Job.create({id:randomUUID(),heartbeat_at:old});
 const legacy=await Job.create({id:randomUUID(),heartbeat_at:null,createdAt:old,cancel_requested_at:old});
 await worker.reconcile();assert.equal((await Job.findByPk(active.id)).status,'processing');assert.equal((await Job.findByPk(stale.id)).status,'failed');assert.equal((await Job.findByPk(legacy.id)).status,'cancelled');
 evidence.scenarios.push({name:'live owner preserved; stale failure and legacy cancellation recover',result:'PASS'});
 await worker.finish({id:active.id,workerToken:active.worker_token,status:'completed',progress:40});assert.equal((await Job.findByPk(active.id)).status,'cancelled');
 await worker.requestCancel(active.id);assert.equal((await Job.findByPk(active.id)).status,'cancelled');evidence.scenarios.push({name:'active finish and repeated cancellation use valid terminal state',result:'PASS'});
 await assert.rejects(db.query("UPDATE export_jobs SET status='invalid' WHERE id=:id",{replacements:{id}}),e=>e.original.code==='23514');
 await assert.rejects(db.query('UPDATE export_jobs SET progress=101 WHERE id=:id',{replacements:{id}}),e=>e.original.code==='23514');evidence.scenarios.push({name:'status and progress constraints remain enforced',result:'PASS'});
 const held=await db.transaction();await db.query('SELECT id FROM export_jobs WHERE id=:id FOR UPDATE',{replacements:{id},transaction:held});
 const migrationClient=new Client({host:local.DB_HOST,port:Number(local.DB_PORT),user:local.DB_USER,password:local.DB_PASSWORD,database,connectionTimeoutMillis:3000});
 await migrationClient.connect();const began=Date.now();
 try{await assert.rejects(migrationClient.query(fs.readFileSync(migration,'utf8')),e=>e.code==='55P03');assert(Date.now()-began<10000);}
 finally{await migrationClient.query('ROLLBACK');await migrationClient.end();await held.rollback();}
 // Explicit migration has 5-second lock bound; rollback preserves the CHECK.
 await assert.rejects(db.query("UPDATE export_jobs SET status='invalid' WHERE id=:id",{replacements:{id}}),e=>e.original.code==='23514');
 evidence.scenarios.push({name:'locked migration fails and rolls back without weakening constraint',result:'PASS'});
 evidence.traces=traces;evidence.result='PASS';save();console.log(JSON.stringify(evidence));
}
main().catch(e=>{evidence.result='FAIL';evidence.error={name:e.name,code:e.original?.code};save();console.error(JSON.stringify(evidence));process.exitCode=1;}).finally(async()=>{if(db)await db.close();await admin.end().catch(()=>{});});
