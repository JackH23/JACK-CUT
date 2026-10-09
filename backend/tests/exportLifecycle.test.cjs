const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { createExportLifecycle } = require('../services/exportLifecycle');
function matches(row, where) {
  return Reflect.ownKeys(where).every(key => {
    const value = where[key];
    if (key === Op.or) return value.some(clause => matches(row, clause));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if (Object.hasOwn(value, Op.ne)) return value[Op.ne] === null ? row[key] != null : row[key] !== value[Op.ne];
      if (Object.hasOwn(value, Op.lt)) return row[key] != null && Number(row[key]) < Number(value[Op.lt]);
    }
    return value === null ? row[key] == null : row[key] === value;
  });
}
function harness(env = {}) {
  let clock = 100_000;
  const rows = [], writes = [], traces = [];
  const model = {
    findByPk: async id => rows.find(row => row.id === id),
    update: async (data, { where, returning }) => { writes.push(data); const affected=[]; for (const row of rows) if (matches(row, where)) { Object.assign(row, data); affected.push({...row}); } return returning ? [affected.length, affected] : [affected.length]; },
  };
  const create = () => createExportLifecycle({ ExportJob: model, Op, sequelize: { transaction: async callback => callback({ LOCK: { UPDATE: 'UPDATE' } }) }, env: { EXPORT_LEASE_TIMEOUT_MS: 60, EXPORT_STALL_TIMEOUT_MS: 1000, EXPORT_TIMEOUT_MS: 2000, EXPORT_KILL_GRACE_MS: 15, ...env }, now: () => clock, trace: (event, job = {}, detail = {}) => traces.push({event,id:job.id,phase:job.finalizationPhase,...detail}) });
  const worker = create();
  const job = { id: 'one', workerToken: 'owner', status: 'processing', progress: 0, createdAt: clock };
  rows.push({ id: job.id, worker_token: 'owner', status: 'processing', cancel_requested_at: null, heartbeat_at: new Date(clock), created_at: new Date(clock) });
  return { worker, create, job, rows, writes, traces, model, advance: ms => { clock += ms; } };
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
test('another instance persists cancellation; owner observes it before starting FFmpeg', async () => {
  const h = harness(); h.worker.register(h.job);
  try {
    await h.create().requestCancel('one');
    assert.equal(h.rows[0].status, 'processing');
    await assert.rejects(h.worker.checkpoint(h.job, 'starting'), /Cancellation requested/);
    assert.equal(h.job.cancelRequested, true);
    h.job.status = 'cancelled'; await h.worker.finish(h.job);
    assert.equal(h.rows[0].status, 'cancelled');
    await h.create().requestCancel('one'); assert.equal(h.rows[0].status, 'cancelled');
  } finally { h.worker.release(h.job); }
});
test('missing local process stays pending until lease expiry fences durable cancellation', async () => {
  const h = harness(); await h.worker.requestCancel('one');
  assert.equal(h.rows[0].status, 'processing'); assert.ok(h.rows[0].cancel_requested_at);
  h.advance(61); await h.worker.reconcile();
  assert.equal(h.rows[0].status, 'cancelled'); assert.equal(h.rows[0].error_message, null);
});
test('cancel racing final completion is fenced atomically', async () => {
  const h = harness(); await h.create().requestCancel('one');
  Object.assign(h.job, { status: 'completed', outputReference: 'r2:/exports/one.mp4', progress: 95 });
  await h.worker.finish(h.job);
  assert.equal(h.rows[0].status, 'cancelled'); assert.equal(h.rows[0].output_path, null); assert.ok(h.rows[0].progress < 100);
});
test('expired owner cannot overwrite recovery or publish a late output', async () => {
  const h = harness(); h.advance(61); await h.worker.reconcile();
  Object.assign(h.job, { status: 'completed', outputReference: 'r2:/exports/one.mp4' });
  await h.worker.finish(h.job); assert.equal(h.rows[0].status, 'failed'); assert.notEqual(h.rows[0].output_path, h.job.outputReference);
});
test('legacy processing jobs without heartbeat expire; live and terminal jobs remain intact', async () => {
  const h = harness();
  h.rows.push({ id: 'legacy', status: 'processing', heartbeat_at: null, created_at: new Date(0) }, { id: 'done', status: 'completed', heartbeat_at: new Date(0) });
  await h.worker.reconcile();
  assert.equal(h.rows[0].status, 'processing'); assert.equal(h.rows[1].status, 'failed'); assert.equal(h.rows[2].status, 'completed');
});
for (const mode of ['stalled', 'timeout']) test(mode + ' watchdog terminates only the owned process, escalating until closure', async () => {
  const h = harness(mode === 'timeout' ? { EXPORT_STALL_TIMEOUT_MS: 5000 } : {}), signals = [];
  h.job.child = { kill: signal => { signals.push(signal); return true; } }; h.worker.register(h.job);
  try {
    h.advance(mode === 'stalled' ? 1001 : 2001);
    const signalDeadline = Date.now() + 2000;
    while (signals.length < 2 && Date.now() < signalDeadline) await delay(10);
    assert.ok(h.job.abort.signal.aborted); assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
    assert.match(h.job.stopReason, mode === 'stalled' ? /stalled/ : /timed out/);
    assert.equal(h.rows[0].status, 'processing');
    assert.equal(h.rows[0].cancel_requested_at, null); assert.equal(Boolean(h.job.cancelRequested), false);
    assert.ok(h.traces.some(t=>t.event==='stop_requested'&&/_(timeout|stall)$/.test(t.trigger)));
    h.job.childClosed = true; h.job.status = 'failed'; h.job.error = h.job.stopReason; await h.worker.finish(h.job);
    assert.equal(h.rows[0].status, 'failed');
  } finally { h.worker.release(h.job); }
});
test('independent watchdog runs even when a heartbeat DB query never returns', async () => {
  const h = harness(); h.worker.register(h.job);
  try {
    h.model.findByPk = () => new Promise(() => {});
    await delay(25); // Allow heartbeat to enter the hung query.
    h.advance(1001); await delay(25); assert.ok(h.job.abort.signal.aborted);
  } finally { h.worker.release(h.job); }
});

test('renderer start lock rejects a cancellation already committed by another instance',async()=>{
 const h=harness();h.worker.register(h.job);
 try {await h.create().requestCancel('one');await assert.rejects(h.worker.withStartLock(h.job,()=>assert.fail('Must not spawn')),/Cancellation requested/);}
 finally {h.worker.release(h.job);}
});

test('real FFmpeg cancellation confirms child closure before marking cancelled',async()=>{
 const {spawn}=require('node:child_process'),{once}=require('node:events');
 const h=harness({EXPORT_LEASE_TIMEOUT_MS:5000,EXPORT_STALL_TIMEOUT_MS:10000});h.worker.register(h.job);
 const child=spawn(process.env.FFMPEG_PATH || 'ffmpeg',['-hide_banner','-loglevel','error','-re','-f','lavfi','-i','color=s=64x64:r=10:d=10','-c:v','libx264','-progress','pipe:1','-f','null','-'],{windowsHide:true});
 h.job.child=child;const closed=once(child,'close');child.stderr.resume();
 try {
  await once(child.stdout,'data',{signal:AbortSignal.timeout(5000)});
  await h.worker.requestCancel('one');assert.equal(h.rows[0].status,'processing');
  await closed;h.job.childClosed=true;h.job.status='cancelled';await h.worker.finish(h.job);assert.equal(h.rows[0].status,'cancelled');
 } finally {if(!h.job.childClosed)child.kill('SIGKILL');h.worker.release(h.job);}
});

test('waiting for a render slot does not count as stalled work, but total deadline still applies',async()=>{
 const h=harness();h.worker.register(h.job);h.job.waitingForRenderer=true;
 try {h.advance(1001);await new Promise(r=>setTimeout(r,30));assert.equal(h.job.abort.signal.aborted,false);h.advance(1001);await new Promise(r=>setTimeout(r,30));assert.equal(h.job.abort.signal.aborted,true);assert.match(h.job.stopReason,/timed out/);}
 finally{h.worker.release(h.job);}
});

test('accepted cancellation keeps its lease alive until child closure and final persistence', async () => {
  const h=harness(), signals=[]; h.worker.register(h.job);
  h.job.child={kill:signal=>{signals.push(signal);return true;}};
  try {
    await h.worker.requestCancel('one'); h.advance(61); await delay(30);
    await h.worker.reconcile();
    assert.equal(h.rows[0].status,'processing');
    assert.equal(h.rows[0].stage,'cancelling');
    assert.equal(Number(h.rows[0].heartbeat_at),100061);
    h.job.childClosed=true; h.job.status='cancelled'; await h.worker.finish(h.job);
    assert.equal(h.rows[0].status,'cancelled'); assert.equal(h.rows[0].error_message,null);
  } finally { h.worker.release(h.job); }
});

test('durable cancellation wins a failure finalization even before the owner sees the flag', async () => {
  const h=harness(); await h.create().requestCancel('one');
  h.job.status='failed'; h.job.error='Renderer exited';
  await h.worker.finish(h.job);
  assert.equal(h.rows[0].status,'cancelled'); assert.equal(h.rows[0].error_message,null);
});

test('repeated cancellation preserves its timestamp and signals a live child once',async()=>{
 const h=harness(),signals=[];h.worker.register(h.job);h.job.child={kill:s=>{signals.push(s);return true;}};
 try {await h.worker.requestCancel('one');const requested=h.rows[0].cancel_requested_at;h.advance(5);await h.worker.requestCancel('one');assert.equal(h.rows[0].cancel_requested_at,requested);assert.deepEqual(signals,['SIGTERM']);h.job.childClosed=true;h.job.status='cancelled';await h.worker.finish(h.job);}finally{h.worker.release(h.job);}
});

test('completion committed before cancellation stays completed and is not signalled',async()=>{
 const h=harness(),signals=[];h.worker.register(h.job);h.job.child={kill:s=>{signals.push(s);return true;}};
 try {h.job.status='completed';h.job.outputReference='r2:/exports/one.mp4';await h.worker.finish(h.job);await h.worker.requestCancel('one');assert.equal(h.rows[0].status,'completed');assert.equal(h.rows[0].cancel_requested_at,null);assert.deepEqual(signals,[]);}finally{h.worker.release(h.job);}
});

test('queued cancellation rejects admission and persists CANCELLED without affecting active render',async()=>{
 const {createRenderSlots}=require('../services/renderSlots');const slots=createRenderSlots(1),release=await slots.acquire();const h=harness();h.worker.register(h.job);h.job.waitingForRenderer=true;
 try {const queued=slots.acquire(h.job.abort.signal);await h.worker.requestCancel('one');await assert.rejects(queued,/waiting for a renderer/);h.job.status='cancelled';await h.worker.finish(h.job);assert.equal(h.rows[0].status,'cancelled');assert.equal(h.rows[0].error_message,null);release();(await slots.acquire())();}finally{release();h.worker.release(h.job);}
});

test('recovery cancels only expired cancellation leases and never a live shutting-down owner',async()=>{
 const h=harness();h.rows[0].cancel_requested_at=new Date(100000);h.advance(2001);h.rows[0].heartbeat_at=new Date(102001);
 await h.worker.reconcile();assert.equal(h.rows[0].status,'processing');
 h.advance(61);await h.worker.reconcile();assert.equal(h.rows[0].status,'cancelled');assert.equal(h.rows[0].error_message,null);
 h.job.status='completed';h.job.outputReference='r2:/exports/late.mp4';await h.worker.finish(h.job);assert.equal(h.job.status,'cancelled');assert.equal(h.rows[0].output_path,null);
});

test('a persisted local cancel signals FFmpeg without waiting for a redundant owner read',async()=>{
 const h=harness(),signals=[];h.worker.register(h.job);h.job.child={kill:s=>{signals.push(s);return true;}};
 const find=h.model.findByPk;let release;
 h.model.findByPk=()=>new Promise(resolve=>{release=()=>resolve(h.rows[0]);});
 const cancel=h.worker.requestCancel('one');
 try {await delay(10);assert.ok(h.rows[0].cancel_requested_at);assert.deepEqual([...signals],['SIGTERM']);}
 finally {release?.();await cancel;h.model.findByPk=find;h.job.childClosed=true;h.worker.release(h.job);}
});

test('owner diagnostics distinguish remote reception from local observation and signal results',async()=>{
 const h=harness();h.worker.register(h.job);h.job.child={pid:123,kill:()=>false};
 try {await h.create().requestCancel('one');assert.equal(h.traces.find(t=>t.event==='cancel_owner_resolved').ownerRelation,'not_local');assert.equal(h.traces.some(t=>t.event==='signal_sent'),false);
 await assert.rejects(h.worker.checkpoint(h.job),/Cancellation requested/);
 assert.ok(h.traces.some(t=>t.event==='cancel_observed'));assert.ok(h.traces.some(t=>t.event==='signal_sent'&&t.signal==='SIGTERM'&&t.killAccepted===false));
 await delay(25);assert.ok(h.traces.some(t=>t.event==='signal_sent'&&t.signal==='SIGKILL'));h.job.childClosed=true;h.job.status='cancelled';await h.worker.finish(h.job);
 assert.ok(h.traces.findIndex(t=>t.event==='terminal_lock_acquired')<h.traces.findIndex(t=>t.event==='terminal_committed'));}
 finally{h.worker.release(h.job);}
});

test('a returned foreign owner is never signalled by the receiving process',async()=>{
 const h=harness(),signals=[];h.worker.register(h.job);h.job.child={kill:s=>signals.push(s)};h.rows[0].worker_token='different-owner';
 try {await h.worker.requestCancel('one');assert.deepEqual(signals,[]);assert.equal(h.traces.find(t=>t.event==='cancel_owner_resolved').ownerRelation,'token_mismatch');assert.equal(h.job.abort.signal.aborted,false);}
 finally{h.worker.release(h.job);}
});

test('completion winner produces no signal and preserves its terminal diagnostic',async()=>{
 const h=harness();h.job.status='completed';h.job.outputReference='r2:/exports/one.mp4';await h.worker.finish(h.job);await h.worker.requestCancel('one');
 assert.equal(h.traces.some(t=>t.event==='signal_sent'),false);assert.ok(h.traces.some(t=>t.event==='cancel_request_persisted'&&t.affectedRows===0));assert.equal(h.rows[0].status,'completed');
});

test('a blocked terminal row lock is visible while cancellation remains safely pending',async()=>{
 const h=harness();h.worker.register(h.job);await h.worker.requestCancel('one');h.job.childClosed=true;h.job.status='cancelled';
 const find=h.model.findByPk;let unlock;h.model.findByPk=()=>new Promise(resolve=>{unlock=()=>resolve(h.rows[0]);});
 const finishing=h.worker.finish(h.job);
 try {h.advance(10001);await delay(30);assert.equal(h.rows[0].status,'processing');assert.ok(h.traces.some(t=>t.event==='cancellation_pending'&&t.phase==='terminal_lock'));assert.equal(h.traces.some(t=>t.event==='terminal_committed'),false);unlock();await finishing;assert.equal(h.rows[0].status,'cancelled');assert.ok(h.traces.some(t=>t.event==='terminal_committed'));}
 finally {h.model.findByPk=find;h.worker.release(h.job);}
});

test('signal exceptions are diagnosed and retain cancellation until closure',async()=>{
 const h=harness();h.worker.register(h.job);h.job.child={kill:()=>{throw Object.assign(Error('private'),{code:'EPERM'});}};
 try {await h.worker.requestCancel('one');assert.equal(h.rows[0].status,'processing');assert.ok(h.traces.some(t=>t.event==='signal_failed'&&t.signal==='SIGTERM'&&t.error.code==='EPERM'));await delay(25);assert.ok(h.traces.some(t=>t.event==='signal_failed'&&t.signal==='SIGKILL'));h.job.childClosed=true;h.job.status='cancelled';await h.worker.finish(h.job);assert.equal(h.rows[0].status,'cancelled');}
 finally {h.worker.release(h.job);}
});

test('a rejected SIGTERM escalates to actual SIGKILL and native FFmpeg closure',async()=>{
 const {spawn}=require('node:child_process'),{once}=require('node:events');
 const h=harness({EXPORT_LEASE_TIMEOUT_MS:5000,EXPORT_STALL_TIMEOUT_MS:10000});h.worker.register(h.job);
 const child=spawn(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','error','-threads','1','-re','-f','lavfi','-i','color=s=64x64:r=10:d=10','-c:v','libx264','-threads','1','-progress','pipe:1','-f','null','-'],{windowsHide:true});
 const nativeKill=child.kill.bind(child);child.kill=signal=>signal==='SIGTERM'?false:nativeKill(signal);h.job.child=child;
 const closed=once(child,'close');child.stderr.resume();
 try {await once(child.stdout,'data',{signal:AbortSignal.timeout(5000)});await h.worker.requestCancel('one');assert.equal(h.rows[0].status,'processing');await closed;h.job.childClosed=true;
 assert.ok(h.traces.some(t=>t.event==='signal_sent'&&t.signal==='SIGTERM'&&t.killAccepted===false));assert.ok(h.traces.some(t=>t.event==='signal_sent'&&t.signal==='SIGKILL'&&t.killAccepted===true));
 h.job.status='cancelled';await h.worker.finish(h.job);assert.equal(h.rows[0].status,'cancelled');}
 finally {if(!h.job.childClosed)nativeKill('SIGKILL');h.worker.release(h.job);}
});
