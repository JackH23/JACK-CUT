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
