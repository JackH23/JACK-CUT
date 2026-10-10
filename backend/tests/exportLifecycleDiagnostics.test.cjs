const {test}=require('node:test');
const assert=require('node:assert/strict');
const {logLifecycleEvent,fingerprint}=require('../utils/exportLifecycleDiagnostics');
const id='66ec12e5-244b-43e2-b36e-57bec761ade8';
test('lifecycle logs are structured and expose only allowlisted metadata',()=>{
 const logs=[],logger={info:line=>logs.push(JSON.parse(line))};
 const job={id,workerToken:'SECRET_TOKEN',stage:'cancelling',status:'processing',cancelRequested:true,child:{pid:123,killed:true}};
 logLifecycleEvent('signal_failed',job,{signal:'SIGTERM',error:{code:'EPERM',message:'SECRET_ERROR',stack:'SECRET_STACK',sql:'SECRET_SQL'},ownerLease:fingerprint('SECRET_OWNER'),rawArgs:'SECRET_ARGS',path:'SECRET_PATH',ownerRelation:'local'},logger);
 assert.equal(logs[0].event,'signal_failed');assert.equal(logs[0].childPid,123);assert.equal(logs[0].errorCode,'EPERM');assert.equal(logs[0].jobId,id);assert.match(logs[0].lease,/^[0-9a-f]{16}$/);assert.ok(!JSON.stringify(logs).includes('SECRET'));
 logLifecycleEvent('signal_sent',{id:'SECRET_ID',stage:'SECRET_STAGE',status:'SECRET_STATUS'},{signal:'SECRET_SIGNAL',ownerRelation:'SECRET_OWNER',ownerLease:'SECRET_LEASE',error:{code:'SECRET_CODE'}},logger);
 assert.equal(logs[1].jobId,null);assert.equal(logs[1].stage,null);assert.ok(!JSON.stringify(logs).includes('SECRET'));
 logLifecycleEvent('SECRET_EVENT',job,{},logger);assert.equal(logs.length,2);
});
test('logger failures cannot prevent lifecycle work and database codes contain no SQL text',()=>{
 assert.doesNotThrow(()=>logLifecycleEvent('signal_sent',{id},{signal:'SIGKILL',killAccepted:false},{info(){throw Error('unavailable logger');}}));
 let record;logLifecycleEvent('terminal_failed',{id},{error:{name:'SequelizeDatabaseError',original:{code:'55P03',sql:'SECRET_SQL'}}},{info:line=>{record=JSON.parse(line);}});
 assert.equal(record.errorCode,'55P03');assert.equal(record.errorName,'SequelizeDatabaseError');assert.ok(!JSON.stringify(record).includes('SECRET'));
});

test('lifecycle origins are allowlisted and distinguish export reuse, HTTP cancellation and timeout',()=>{
 for(const [event,trigger] of [['create_rejected_cancelling','existing_cancel'],['cancel_request_begin','cancel_endpoint'],['stop_requested','watchdog_timeout']]){
  let record;logLifecycleEvent(event,{id},{trigger,requestBody:'SECRET'},{info:line=>record=JSON.parse(line)});assert.equal(record.trigger,trigger);assert.ok(!JSON.stringify(record).includes('SECRET'));
 }
 let record;logLifecycleEvent('stop_requested',{id},{trigger:'SECRET'},{info:line=>record=JSON.parse(line)});assert.equal(record.trigger,undefined);
});

for (const [code,category] of [['23514','check_violation'],['42703','undefined_column'],['57014','query_cancelled_or_statement_timeout'],['55P03','lock_unavailable']]) test('safe PostgreSQL diagnostics '+code,()=>{
 let record;logLifecycleEvent('lease_recovery_query_failed',{}, {recoveryOperation:'cancel_expired',error:{name:'SequelizeDatabaseError',original:{code,severity:'ERROR',table:'export_jobs',constraint:'export_jobs_status_check',column:'status',message:'SECRET_MESSAGE',detail:'SECRET_ROW_VALUES',where:'SECRET_PARAMETERS',sql:'SECRET_SQL'},parameters:['SECRET_PASSWORD']}}, {info:line=>record=JSON.parse(line)});
 assert.equal(record.sqlState,code);assert.equal(record.databaseError,category);assert.equal(record.recoveryOperation,'cancel_expired');assert.equal(record.databaseConstraint,'export_jobs_status_check');assert.ok(!JSON.stringify(record).includes('SECRET'));
});
test('unrecognized database identifiers and operation labels are omitted',()=>{
 let record;logLifecycleEvent('lease_recovery_query_failed',{}, {recoveryOperation:'SECRET_OPERATION',error:{original:{code:'SECRET_CODE',severity:'SECRET',table:'SECRET',constraint:'SECRET',column:'SECRET'}}},{info:line=>record=JSON.parse(line)});assert.ok(!JSON.stringify(record).includes('SECRET'));assert.equal(record.sqlState,undefined);
});

test('lease diagnostics expose effective bounds and recovery reasons without raw owner credentials',()=>{let record;logLifecycleEvent('lease_recovered',{id,workerToken:'SECRET_OWNER'},{timeoutMs:1800000,leaseMs:90000,heartbeatAgeMs:1635,recoveryReason:'total_timeout',rawToken:'SECRET'}, {info:s=>record=JSON.parse(s)});assert.equal(record.recoveryReason,'total_timeout');assert.equal(record.leaseMs,90000);assert.ok(!JSON.stringify(record).includes('SECRET'));logLifecycleEvent('lifecycle_configured',{}, {timeoutMs:7200000,leaseMs:90000,intervalMs:2000}, {info:s=>record=JSON.parse(s)});assert.equal(record.timeoutMs,7200000);assert.equal(record.intervalMs,2000);});

test('recovery logs include the effective immutable deadline and recovery instant',()=>{
 let record;logLifecycleEvent('lease_recovered',{id},{deadlineSource:'persisted',effectiveDeadlineAtMs:7300000,effectiveTimeoutMs:7200000,recoveryAtMs:1900001,timeoutMs:1800000,recoveryReason:'heartbeat_expired'}, {info:s=>record=JSON.parse(s)});assert.equal(record.effectiveDeadlineAtMs,7300000);assert.equal(record.effectiveTimeoutMs,7200000);assert.equal(record.recoveryAtMs,1900001);assert.equal(record.deadlineSource,'persisted');assert.equal(record.timeoutMs,1800000);
});
