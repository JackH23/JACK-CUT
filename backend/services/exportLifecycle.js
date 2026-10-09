const { randomUUID } = require('node:crypto');
const { setInterval, clearInterval, setTimeout, clearTimeout } = require('node:timers');
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
function positive(value, fallback) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : fallback; }
function createExportLifecycle({ ExportJob, Op, sequelize, env = process.env, now = Date.now }) {
  const timeoutMs = positive(env.EXPORT_TIMEOUT_MS, 30 * 60_000);
  const stallMs = positive(env.EXPORT_STALL_TIMEOUT_MS, 120_000);
  const leaseMs = positive(env.EXPORT_LEASE_TIMEOUT_MS, 30_000);
  const killGraceMs = positive(env.EXPORT_KILL_GRACE_MS, 5000);
  const intervalMs = Math.min(2000, leaseMs / 3);
  const jobs = new Map();
  function owned(job) { return { id: job.id, status: 'processing', worker_token: job.workerToken }; }
  function stop(job, reason) {
    if (job.abort.signal.aborted) return;
    job.stopReason = reason;
    job.abort.abort();
    if (job.child && !job.childClosed) {
      try { job.child.kill('SIGTERM'); } catch { /* Lease recovery fences publication. */ }
      job.killTimer = setTimeout(() => { if (!job.childClosed) { try { job.child.kill('SIGKILL'); } catch {} } }, killGraceMs);
      job.killTimer.unref();
    }
  }
  function assertRunning(job) { if (job.abort.signal.aborted) throw new Error(job.stopReason || 'Export stopped.'); }
  async function checkpoint(job, stage) {
    assertRunning(job);
    const row = await ExportJob.findByPk(job.id);
    if (!row || row.status !== 'processing' || row.worker_token !== job.workerToken) stop(job, 'The rendering worker lost its export lease. Please export again.');
    else if (row.cancel_requested_at) { job.cancelRequested = true; stop(job, 'Cancellation requested.'); }
    assertRunning(job);
    if (stage) { job.stage = stage; job.lastWorkAt = now(); }
    await ExportJob.update({ stage: job.stage, progress: job.progress, heartbeat_at: new Date(now()) }, { where: { ...owned(job), cancel_requested_at: null } });
    assertRunning(job);
  }
  async function withStartLock(job, start) {
    // Serialize the final start decision with cancellation's UPDATE on this row.
    await sequelize.transaction(async transaction => {
      assertRunning(job);
      const row = await ExportJob.findByPk(job.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!row || row.status !== 'processing' || row.worker_token !== job.workerToken) stop(job, 'The rendering worker lost its export lease. Please export again.');
      else if (row.cancel_requested_at) { job.cancelRequested = true; stop(job, 'Cancellation requested.'); }
      assertRunning(job);
      job.stage = 'starting'; job.lastWorkAt = now();
      await ExportJob.update({ stage: job.stage, heartbeat_at: new Date(now()) }, { where: owned(job), transaction });
      assertRunning(job);
      start(); // Synchronous spawn AND event listener registration before releasing the row lock.
    });
  }
  async function tick(job) {
    if (job.ticking || job.done) return;
    if (now() - job.createdAt >= timeoutMs) stop(job, 'Export timed out. Try a shorter timeline or contact support.');
    else if (!job.waitingForRenderer && now() - job.lastWorkAt >= stallMs) stop(job, 'Export stalled. Please export again.');
    job.ticking = true;
    try { await checkpoint(job); }
    catch { if (!job.abort.signal.aborted) stop(job, 'Could not maintain the export database connection. Please export again.'); }
    finally { job.ticking = false; }
  }
  function register(job) {
    job.abort = new AbortController(); job.lastWorkAt = now(); job.stage = 'preparing';
    jobs.set(job.id, job);
    job.timer = setInterval(() => { void tick(job); }, intervalMs); job.timer.unref();
    // This watchdog remains independent of a hung database heartbeat query.
    job.watchdog = setInterval(() => {
      if (now() - job.createdAt >= timeoutMs) stop(job, 'Export timed out. Try a shorter timeline or contact support.');
      else if (!job.waitingForRenderer && now() - job.lastWorkAt >= stallMs) stop(job, 'Export stalled. Please export again.');
    }, intervalMs); job.watchdog.unref();
  }
  function release(job) { job.done = true; clearInterval(job.timer); clearInterval(job.watchdog); clearTimeout(job.killTimer); jobs.delete(job.id); }
  async function finish(job) {
    // Completion is fenced atomically against cancellation, expired leases and terminal rows.
    if (job.status === 'completed') {
      const [count] = await ExportJob.update({ status: 'completed', stage: 'completed', progress: 100,
        output_path: job.outputReference, cleanup_reference: null, error_message: null, metrics: job.metrics || null, completed_at: new Date(now()) },
        { where: { ...owned(job), cancel_requested_at: null } });
      if (count) return;
      const row = await ExportJob.findByPk(job.id);
      if (row?.status === 'completed') return;
      if (!row || TERMINAL.has(row.status)) { job.status = row?.status || 'failed'; return; }
      job.cancelRequested = Boolean(row.cancel_requested_at);
      job.status = job.cancelRequested ? 'cancelled' : 'failed';
    }
    await ExportJob.update({ status: job.status, stage: job.status, progress: Math.min(job.progress || 0, 99),
      output_path: null, error_message: job.status === 'cancelled' ? null : job.error,
      metrics: job.metrics || null, completed_at: new Date(now()) }, { where: owned(job) });
  }
  async function requestCancel(id) {
    await ExportJob.update({ cancel_requested_at: new Date(now()), stage: 'cancelling' },
      { where: { id, status: 'processing', cancel_requested_at: null } });
    const job = jobs.get(id);
    if (job) { job.cancelRequested = true; stop(job, 'Cancellation requested.'); }
  }
  async function reconcile() {
    const expired = new Date(now() - leaseMs), deadline = new Date(now() - timeoutMs);
    await ExportJob.update({ status: 'failed', stage: 'failed', completed_at: new Date(now()),
      error_message: 'The rendering worker stopped responding or the export timed out. Please export again.' },
      { where: { status: 'processing', [Op.or]: [
        { heartbeat_at: { [Op.lt]: expired } },
        { heartbeat_at: null, created_at: { [Op.lt]: expired } },
        { created_at: { [Op.lt]: deadline } },
      ] } });
  }
  let recoveryTimer;
  function start() {
    if (recoveryTimer) return;
    let recovering = false;
    const recover = async () => {
      if (recovering) return;
      recovering = true;
      try { await reconcile(); } catch { console.error('Export lease recovery unavailable.'); }
      finally { recovering = false; }
    };
    void recover(); recoveryTimer = setInterval(recover, intervalMs); recoveryTimer.unref();
  }
  return { jobs, register, checkpoint, withStartLock, assertRunning, stop, release, finish, requestCancel, reconcile, start, timeoutMs, newToken: randomUUID };
}
module.exports = { createExportLifecycle };
