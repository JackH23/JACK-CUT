// Explicitly approved staging fixtures only. No .env fallback, server, FFmpeg or storage.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),{randomUUID}=require('crypto');
const dotenv=require('dotenv'),{Sequelize,DataTypes,Op}=require('sequelize');
const {validateStagingEnvironment}=require('../utils/stagingEnvironment');
const {assertExportDeadlineSchema}=require('../utils/exportDeadlineSchema');
const {createExportLifecycle}=require('../services/exportLifecycle');
async function main(){
 const config=validateStagingEnvironment(dotenv.parse(fs.readFileSync(path.join(__dirname,'../.env.staging.local'))));
 const db=new Sequelize(config.connectionString,{dialect:'postgres',logging:false,pool:{max:1,acquire:30000},dialectOptions:{connectionTimeoutMillis:30000,statement_timeout:10000,lock_timeout:5000}});
 let tx,phase='connect';const results=[];const events=[];
 try{
  tx=await db.transaction();phase='read_only_schema';await db.query('SET TRANSACTION READ ONLY',{transaction:tx});
  const [identity]=await db.query("SELECT current_database() AS database,current_user AS role,current_setting('transaction_read_only') AS read_only",{transaction:tx});
  assert.equal(identity[0].database,'neondb');assert.equal(identity[0].role,'neondb_owner');assert.equal(identity[0].read_only,'on');
  const columns=await db.getQueryInterface().describeTable('export_jobs',{schema:'public',transaction:tx});assertExportDeadlineSchema(columns);
  await tx.rollback();tx=null;results.push({name:'actual Sequelize describeTable and startup validator',result:'PASS',columnType:columns.deadline_at.type});
  tx=await db.transaction();phase='temporary_fixture';
  // A session-local table only: it never shadows or updates the qualified public table.
  await db.query('CREATE TEMPORARY TABLE jackcut_deadline_fixture (LIKE public.export_jobs INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP',{transaction:tx});
  const loaded={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../models/ExportJob.js'),'utf8'),{require:name=>name==='sequelize'?{DataTypes}:name==='../config/database'?db:require(name),module:loaded,exports:loaded.exports});
  const base=loaded.exports;
  const Fixture=db.define('DeadlineFixture',base.rawAttributes,{...base.options,tableName:'jackcut_deadline_fixture',schema:'pg_temp',timestamps:true,underscored:true});
  assert.equal(Fixture.getTableName().schema,'pg_temp');assert.equal(Fixture.getTableName().tableName,'jackcut_deadline_fixture');
  const model={create:(values,options={})=>Fixture.create(values,{...options,transaction:tx}),findByPk:(id,options={})=>Fixture.findByPk(id,{...options,transaction:tx}),update:(values,options={})=>Fixture.update(values,{...options,transaction:tx})};
  // Nested lifecycle locks share the fixture transaction, never commit it.
  const fixtureDB={transaction:async callback=>callback(tx)};
  let clock=Date.now();const origin=clock;
  function worker(timeout=7200000){return createExportLifecycle({ExportJob:model,Op,sequelize:fixtureDB,env:{EXPORT_TIMEOUT_MS:timeout,EXPORT_LEASE_TIMEOUT_MS:90000,EXPORT_STALL_TIMEOUT_MS:300000},now:()=>clock,trace:(event,job={},detail={})=>events.push({event,id:job.id,reason:detail.recoveryReason})});}
  const owner=worker(),short=worker(1800000);
  async function reserve({deadline=true,status='processing',age=0,heartbeatAge=0,timeout=7200000}={}){
   const created=clock-age,id=randomUUID(),token=randomUUID();
   const row=await model.create({id,status,stage:status==='processing'?'preparing':status,progress:status==='completed'?100:51,worker_token:token,createdAt:new Date(created),updatedAt:new Date(clock),heartbeat_at:new Date(clock-heartbeatAge),deadline_at:deadline?new Date(created+timeout):null,cancel_requested_at:null});
   return {row,job:{id,workerToken:token,createdAt:created,deadlineAt:created+timeout,status:'processing',progress:51,stage:'preparing',lastWorkAt:clock,abort:new AbortController()}};
  }
  const healthy=await reserve();assert.equal(Number(healthy.row.deadline_at),origin+7200000);results.push({name:'new fixture deadline round-trip through actual ExportJob attributes',result:'PASS'});
  clock=origin+1800001;await owner.checkpoint(healthy.job);await short.reconcile();assert.equal((await model.findByPk(healthy.job.id)).status,'processing');results.push({name:'120-minute job survives 30-minute recovery with fresh heartbeat',result:'PASS'});
  const restarted=worker(1800000);assert.equal(restarted.jobs.size,0);await restarted.reconcile();assert.equal((await model.findByPk(healthy.job.id)).status,'processing');results.push({name:'simulated recovery restart and multiple lifecycle instances honor stored deadline',result:'PASS'});
  const signals=[];healthy.job.child={kill:signal=>{signals.push(signal);return true;},killed:false};
  await model.update({worker_token:randomUUID()},{where:{id:healthy.job.id}});await assert.rejects(owner.checkpoint(healthy.job),/lease/);assert.deepEqual(signals,['SIGTERM']);clearTimeout(healthy.job.killTimer);healthy.job.childClosed=true;
  await model.update({status:'failed',stage:'failed'},{where:{id:healthy.job.id}});results.push({name:'lost ownership rejects renewal and signals only fake owned child',result:'PASS'});
  const expired=await reserve({age:7200001,heartbeatAge:0});await short.reconcile();assert.equal((await model.findByPk(expired.job.id)).status,'failed');results.push({name:'passed persisted deadline fails despite fresh heartbeat',result:'PASS'});
  const bounded=await reserve({age:1800001,timeout:1800000});await owner.reconcile();assert.equal((await model.findByPk(bounded.job.id)).status,'failed');results.push({name:'120-minute recovery cannot extend a persisted 30-minute deadline',result:'PASS'});
  const stale=await reserve({heartbeatAge:90001});await owner.reconcile();assert.equal((await model.findByPk(stale.job.id)).status,'failed');results.push({name:'stale heartbeat still fails before future total deadline',result:'PASS'});
  const cancelled=await reserve();await owner.requestCancel(cancelled.job.id);await assert.rejects(owner.checkpoint(cancelled.job),/Cancellation/);cancelled.job.status='cancelled';await owner.finish(cancelled.job);assert.equal((await model.findByPk(cancelled.job.id)).status,'cancelled');results.push({name:'durable cancellation and terminal persistence use real PostgreSQL fixture',result:'PASS'});
  const abandonedCancel=await reserve({heartbeatAge:90001});await model.update({cancel_requested_at:new Date(clock-90001)},{where:{id:abandonedCancel.job.id}});await owner.reconcile();assert.equal((await model.findByPk(abandonedCancel.job.id)).status,'cancelled');results.push({name:'expired cancelled fixture recovers to cancelled',result:'PASS'});
  const legacy=await reserve({deadline:false,age:1800001});await short.reconcile();assert.equal((await model.findByPk(legacy.job.id)).status,'failed');results.push({name:'legacy NULL deadline retains documented configured fallback',result:'PASS'});
  const completed=await reserve({status:'completed',age:7200001,heartbeatAge:90001});await owner.reconcile();assert.equal((await model.findByPk(completed.job.id)).status,'completed');completed.job.status='failed';await owner.finish(completed.job);assert.equal((await model.findByPk(completed.job.id)).status,'completed');results.push({name:'completed fixture survives recovery and stale finalization',result:'PASS'});
  assert.ok(events.some(e=>e.event==='lease_recovered'&&e.reason==='total_timeout'));results.push({name:'actual recovery emits stored deadline timeout reason',result:'PASS'});
  phase='rollback';await tx.rollback();tx=null;
  const result={status:'staging_fixture_validation_passed',hostname:config.hostname,branch:config.branch,branchId:config.branchId,passed:results.length,failed:0,results,fixtureTransactionRolledBack:true,publicExportJobsWritten:false,ffmpegStarted:false,storageUsed:false,realProcessRestartTested:false};
  fs.writeFileSync(path.join(__dirname,'../tests/staging-deadline-integration.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(error){const result={status:'staging_fixture_validation_failed',phase,passed:results.length,code:error.original?.code||error.code||null,errorKind:error.name==='AssertionError'?'assertion_failure':'database_or_configuration_failure',credentialsRedacted:true};console.error(JSON.stringify(result));process.exitCode=1;}
 finally{if(tx)await tx.rollback().catch(()=>{});await db.close().catch(()=>{});}
}
main().catch(()=>{console.error('Staging configuration rejected; no connection fallback allowed.');process.exitCode=1;});
