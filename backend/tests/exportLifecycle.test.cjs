const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { createExportLifecycle } = require('../services/exportLifecycle');
function matches(row, where) {
  return Reflect.ownKeys(where).every(key => {
    const value = where[key];
    if (key === Op.or) return value.some(clause => matches(row, clause));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if (Object.hasOwn(value, Op.lt)) return row[key] != null && Number(row[key]) < Number(value[Op.lt]);
    }
    return row[key] === value;
  });
}
function harness(env = {}) {
  let clock = 100_000;
  const rows = [], writes = [];
  const model = {
    findByPk: async id => rows.find(row => row.id === id),
    update: async (data, { where }) => { writes.push(data); let count = 0; for (const row of rows) if (matches(row, where)) { Object.assign(row, data); count++; } return [count]; },
  };
  const create = () => createExportLifecycle({ ExportJob: model, Op, sequelize: { transaction: async callback => callback({ LOCK: { UPDATE: 'UPDATE' } }) }, env: { EXPORT_LEASE_TIMEOUT_MS: 60, EXPORT_STALL_TIMEOUT_MS: 1000, EXPORT_TIMEOUT_MS: 2000, EXPORT_KILL_GRACE_MS: 15, ...env }, now: () => clock });
  const worker = create();
  const job = { id: 'one', workerToken: 'owner', status: 'processing', progress: 0, createdAt: clock };
  rows.push({ id: job.id, worker_token: 'owner', status: 'processing', cancel_requested_at: null, heartbeat_at: new Date(clock), created_at: new Date(clock) });
  return { worker, create, job, rows, writes, model, advance: ms => { clock += ms; } };
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
test('missing local process is a durable request, never confirmation of cancellation', async () => {
  const h = harness(); await h.worker.requestCancel('one');
  assert.equal(h.rows[0].status, 'processing'); assert.ok(h.rows[0].cancel_requested_at);
  h.advance(61); await h.worker.reconcile();
  assert.equal(h.rows[0].status, 'failed'); assert.match(h.rows[0].error_message, /stopped responding/);
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
    h.advance(mode === 'stalled' ? 1001 : 2001); await delay(55);
    assert.ok(h.job.abort.signal.aborted); assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
    assert.match(h.job.stopReason, mode === 'stalled' ? /stalled/ : /timed out/);
    assert.equal(h.rows[0].status, 'processing');
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
