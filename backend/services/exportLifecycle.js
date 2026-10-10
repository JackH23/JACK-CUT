const { randomUUID } = require('node:crypto');
const { logLifecycleEvent, fingerprint } = require('../utils/exportLifecycleDiagnostics');
const { setInterval, clearInterval, setTimeout, clearTimeout } = require('node:timers');
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
function positive(value, fallback) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : fallback; }
function createExportLifecycle({ ExportJob, Op, sequelize, env = process.env, now = Date.now, trace = logLifecycleEvent }) {
  const timeoutMs = positive(env.EXPORT_TIMEOUT_MS, 30 * 60_000);
  const stallMs = positive(env.EXPORT_STALL_TIMEOUT_MS, 120_000);
  const leaseMs = positive(env.EXPORT_LEASE_TIMEOUT_MS, 30_000);
  const killGraceMs = positive(env.EXPORT_KILL_GRACE_MS, 5000);
  const intervalMs = Math.min(2000, leaseMs / 3);
  const jobs = new Map();
  trace('lifecycle_configured', {}, { timeoutMs, stallMs, leaseMs, killGraceMs, intervalMs });
  function deadlineAt(createdAt) { return new Date(createdAt + timeoutMs); }
  function owned(job) { return { id: job.id, status: 'processing', worker_token: job.workerToken }; }
  function signalChild(job, signal) {
    job.signalAttempts = (job.signalAttempts || 0) + 1;
    try {
      const killAccepted = job.child.kill(signal);
      trace('signal_sent', job, { signal, killAccepted, childKilled: Boolean(job.child.killed), signalAttempts: job.signalAttempts });
    } catch (error) { trace('signal_failed', job, { signal, error, signalAttempts: job.signalAttempts }); }
  }
  function stop(job, reason, trigger = 'internal_stop') {
    if (job.abort.signal.aborted) return;
    job.stopReason = reason; job.stopTrigger = trigger;
    trace('stop_requested', job, { trigger });
    job.abort.abort();
    if (job.child && !job.childClosed) {
      signalChild(job, 'SIGTERM');
      job.killTimer = setTimeout(() => { if (!job.childClosed) signalChild(job, 'SIGKILL'); }, killGraceMs);
      job.killTimer.unref();
    }
  }
  function diagnosePending(job) {
    const at = now();
    const ageMs = job.cancelObservedAt == null ? 0 : at - job.cancelObservedAt;
    const heartbeatAgeMs = job.ticking ? at - job.heartbeatStartedAt : 0;
    if ((ageMs >= 10000 || heartbeatAgeMs >= 10000) &&
        (job.lastPendingDiagnosticAt == null || at - job.lastPendingDiagnosticAt >= 30000)) {
      job.lastPendingDiagnosticAt = at;
      trace(job.cancelRequested ? 'cancellation_pending' : 'heartbeat_pending', job,
        { ageMs, heartbeatAgeMs, pendingProgressWrites: job.pendingProgressWrites || 0,
          progressWriteAgeMs: job.progressWriteStartedAt == null ? 0 : at - job.progressWriteStartedAt });
    }
  }
  function assertRunning(job) { if (job.abort.signal.aborted) throw new Error(job.stopReason || 'Export stopped.'); }
  function verifyOwner(job, row) {
    if (!row || row.status !== 'processing' || row.worker_token !== job.workerToken) {
      trace('lease_rejected', job, { ownerRelation: !row ? 'missing_row' : row.worker_token !== job.workerToken ? 'token_mismatch' : 'local', rowStatus: row?.status, rowStage: row?.stage,
        rowCancelRequested: Boolean(row?.cancel_requested_at), ownerLease: fingerprint(row?.worker_token),
        ageMs: (row?.createdAt || row?.created_at) ? now() - Number(new Date(row.createdAt || row.created_at)) : now() - job.createdAt,
        heartbeatAgeMs: row?.heartbeat_at ? now() - Number(new Date(row.heartbeat_at)) : undefined, timeoutMs, leaseMs });
      stop(job, 'The rendering worker lost its export lease. Please export again.', 'lease_lost');
    } else if (row.cancel_requested_at) { job.cancelRequested = true; job.cancelObservedAt ??= now(); trace('cancel_observed', job); stop(job, 'Cancellation requested.', 'durable_cancel'); }
    assertRunning(job);
  }
  async function checkpoint(job, stage) {
    assertRunning(job);
    const row = await ExportJob.findByPk(job.id);
    verifyOwner(job, row);
    assertRunning(job);
    if (stage) { job.stage = stage; job.lastWorkAt = now(); }
    const started = now();
    const [affectedRows] = await ExportJob.update({ stage: job.stage, progress: job.progress, heartbeat_at: new Date(now()) }, { where: { ...owned(job), cancel_requested_at: null } });
    if (affectedRows !== 1 || now() - started >= 1000) trace('heartbeat_write_result', job, { affectedRows, durationMs: now() - started });
    if (affectedRows !== 1) {
      // Cancellation/recovery can commit between the ownership read and fenced write.
      // Never treat a no-op as successful renewal or keep rendering under a revoked lease.
      verifyOwner(job, await ExportJob.findByPk(job.id));
      stop(job, 'Could not renew the export lease. Please export again.', 'database_error');
    }
    assertRunning(job);
  }
  async function withStartLock(job, start) {
    // Serialize the final start decision with cancellation's UPDATE on this row.
    await sequelize.transaction(async transaction => {
      assertRunning(job);
      const row = await ExportJob.findByPk(job.id, { transaction, lock: transaction.LOCK.UPDATE });
      verifyOwner(job, row);
      assertRunning(job);
      job.stage = 'starting'; job.lastWorkAt = now();
      await ExportJob.update({ stage: job.stage, heartbeat_at: new Date(now()) }, { where: owned(job), transaction });
      assertRunning(job);
      start(); // Synchronous spawn AND event listener registration before releasing the row lock.
    });
  }
  async function tick(job) {
    if (job.ticking || job.done) return;
    if (now() >= job.deadlineAt) stop(job, 'Export timed out. Try a shorter timeline or contact support.', 'heartbeat_timeout');
    else if (!job.waitingForRenderer && now() - job.lastWorkAt >= stallMs) stop(job, 'Export stalled. Please export again.', 'heartbeat_stall');
    job.ticking = true; job.heartbeatStartedAt = now();
    try {
      // Aborting render/transfer work must not abort the lease for its shutdown.
      // Keep ownership alive until close, status persistence and cleanup settle.
      if (job.abort.signal.aborted) await ExportJob.update({ heartbeat_at: new Date(now()) }, { where: owned(job) });
      else await checkpoint(job);
    }
    catch (error) { trace('heartbeat_failed', job, { error, trigger: job.stopTrigger || 'database_error' }); if (!job.abort.signal.aborted) stop(job, 'Could not maintain the export database connection. Please export again.', 'database_error'); }
    finally { job.ticking = false; }
  }
  function register(job) {
    job.deadlineAt ??= Number(deadlineAt(job.createdAt));
    job.abort = new AbortController(); job.lastWorkAt = now(); job.stage = 'preparing';
    jobs.set(job.id, job); trace('registered', job);
    job.timer = setInterval(() => { void tick(job); }, intervalMs); job.timer.unref();
    // This watchdog remains independent of a hung database heartbeat query.
    job.watchdog = setInterval(() => {
      diagnosePending(job);
      if (now() >= job.deadlineAt) stop(job, 'Export timed out. Try a shorter timeline or contact support.', 'watchdog_timeout');
      else if (!job.waitingForRenderer && now() - job.lastWorkAt >= stallMs) stop(job, 'Export stalled. Please export again.', 'watchdog_stall');
    }, intervalMs); job.watchdog.unref();
  }
  function release(job) { job.done = true; clearInterval(job.timer); clearInterval(job.watchdog); clearTimeout(job.killTimer); jobs.delete(job.id); trace('worker_released', job); }
  async function finish(job) {
    const started = now(); job.finalizationPhase = 'terminal_lock';
    trace('terminal_transaction_begin', job);
    try {
      // Serialize every terminal outcome with cancel's row UPDATE, not just success.
      await sequelize.transaction(async transaction => {
        const row = await ExportJob.findByPk(job.id, { transaction, lock: transaction.LOCK.UPDATE });
        trace('terminal_lock_acquired', job, { rowStatus: row?.status, rowStage: row?.stage, rowCancelRequested: Boolean(row?.cancel_requested_at), durationMs: now() - started });
        if (!row || TERMINAL.has(row.status) || row.worker_token !== job.workerToken) {
          job.status = row && TERMINAL.has(row.status) ? row.status : 'failed';
          job.error = row?.error_message || null;
          trace('terminal_preserved', job, { rowStatus: row?.status });
          job.finalizationPhase = 'terminal_commit';
          return;
        }
        if (row.cancel_requested_at || job.cancelRequested) {
          job.cancelRequested = true; job.status = 'cancelled'; job.error = null;
        }
        const completed = job.status === 'completed';
        job.finalizationPhase = 'terminal_update'; trace('terminal_write_begin', job);
        const [affectedRows] = await ExportJob.update({ status: job.status, stage: job.status,
          progress: completed ? 100 : Math.min(job.progress || 0, 99),
          output_path: completed ? job.outputReference : null,
          ...(completed ? { cleanup_reference: null } : {}),
          error_message: completed || job.status === 'cancelled' ? null : job.error,
          metrics: job.metrics || null, completed_at: new Date(now()) },
          { where: owned(job), transaction });
        trace('terminal_write_end', job, { affectedRows });
        job.finalizationPhase = 'terminal_commit';
      });
      trace('terminal_committed', job, { durationMs: now() - started });
      job.finalizationPhase = null;
    } catch (error) { trace('terminal_failed', job, { error, durationMs: now() - started }); throw error; }
  }
  async function requestCancel(id, trigger = 'internal_cancel') {
    const started = now(), local = jobs.get(id), diagnosticJob = local || { id };
    trace('cancel_request_begin', diagnosticJob, { trigger });
    try {
      // PostgreSQL returns the owner with the successful mutation. An extra SELECT
      // must not delay local signalling after cancellation is already durable.
      const [affectedRows, returned] = await ExportJob.update({ cancel_requested_at: new Date(now()), stage: 'cancelling' },
        { where: { id, status: 'processing', cancel_requested_at: null }, returning: true });
      trace('cancel_request_persisted', diagnosticJob, { affectedRows, durationMs: now() - started });
      const row = returned?.[0] || await ExportJob.findByPk(id);
      const job = jobs.get(id);
      const ownerRelation = !row ? 'missing_row' : !job ? 'not_local' : row.worker_token === job.workerToken ? 'local' : 'token_mismatch';
      trace('cancel_owner_resolved', job || { id }, { ownerRelation, ownerLease: fingerprint(row?.worker_token), rowStatus: row?.status, rowStage: row?.stage, rowCancelRequested: Boolean(row?.cancel_requested_at) });
      // Completion may have won the UPDATE race. Never stop a terminal winner.
      if (job && row?.status === 'processing' && row.worker_token === job.workerToken && row.cancel_requested_at) {
        job.cancelRequested = true; job.cancelObservedAt ??= now();
        trace('cancel_observed', job);
        stop(job, 'Cancellation requested.', 'durable_cancel');
      }
    } catch (error) { trace('cancel_request_failed', diagnosticJob, { error, durationMs: now() - started }); throw error; }
  }
  // Identify the failing UPDATE without logging SQL or its bound parameters.
  async function recoveryUpdate(recoveryOperation, values, options) {
    try { return await ExportJob.update(values, options); }
    catch (error) { trace('lease_recovery_query_failed', {}, { recoveryOperation, error }); throw error; }
  }
  let lastRecoveryDiagnosticAt;
  async function reconcile() {
    const recoveryAt = now();
    const expired = new Date(recoveryAt - leaseMs), deadline = new Date(recoveryAt - timeoutMs);
    // New jobs carry their creator's immutable deadline. A different process's
    // environment must never shorten it. Legacy rows retain the bounded fallback.
    const expiredLease = [
      { heartbeat_at: { [Op.lt]: expired } },
      { heartbeat_at: null, created_at: { [Op.lt]: expired } },
    ];
    // A lost owner's durable cancellation is a cancelled outcome. Fencing prevents
    // late publication; a live owner keeps heartbeating until shutdown settles.
    const reportRecovery = lastRecoveryDiagnosticAt == null || now() - lastRecoveryDiagnosticAt >= 30000;
    if (reportRecovery) { lastRecoveryDiagnosticAt = now(); trace('lease_recovery_begin'); }
    const [cancelledRows, cancelledRecords] = await recoveryUpdate('cancel_expired', { status: 'cancelled', stage: 'cancelled', completed_at: new Date(now()),
      output_path: null, error_message: null },
      { where: { status: 'processing', cancel_requested_at: { [Op.ne]: null }, [Op.or]: expiredLease }, returning: true });
    const [failedRows, failedRecords] = await recoveryUpdate('fail_expired', { status: 'failed', stage: 'failed', completed_at: new Date(now()),
      error_message: 'The rendering worker stopped responding or the export timed out. Please export again.' },
      { where: { status: 'processing', cancel_requested_at: null, [Op.or]: [
        ...expiredLease, { deadline_at: { [Op.lt]: new Date(recoveryAt) } },
        { deadline_at: null, created_at: { [Op.lt]: deadline } },
      ] }, returning: true });
    for (const row of [...(cancelledRecords || []), ...(failedRecords || [])]) {
      const createdAt = Number(new Date(row.createdAt || row.created_at));
      const effectiveDeadlineAtMs = row.deadline_at ? Number(new Date(row.deadline_at)) : createdAt + timeoutMs;
      const ageMs = recoveryAt - createdAt;
      const heartbeatAgeMs = recoveryAt - Number(new Date(row.heartbeat_at || row.createdAt || row.created_at));
      const totalExpired = recoveryAt > effectiveDeadlineAtMs, heartbeatExpired = heartbeatAgeMs > leaseMs;
      trace('lease_recovered', { id: row.id, workerToken: row.worker_token, status: row.status, progress: row.progress }, {
        ageMs, heartbeatAgeMs, timeoutMs, leaseMs, recoveryAtMs: recoveryAt, effectiveDeadlineAtMs,
        effectiveTimeoutMs: effectiveDeadlineAtMs - createdAt, deadlineSource: row.deadline_at ? 'persisted' : 'legacy_config',
        recoveryReason: row.status === 'cancelled' ? 'cancelled_expired' : totalExpired && heartbeatExpired ? 'total_and_heartbeat_expired' : totalExpired ? 'total_timeout' : 'heartbeat_expired' });
    }
    if (reportRecovery || cancelledRows || failedRows) trace('lease_recovery_end', {}, { cancelledRows, failedRows });
  }
  let recoveryTimer;
  function start() {
    if (recoveryTimer) return;
    let recovering = false;
    const recover = async () => {
      if (recovering) return;
      recovering = true;
      try { await reconcile(); } catch (error) { trace('lease_recovery_failed', {}, { error }); console.error('Export lease recovery unavailable.'); }
      finally { recovering = false; }
    };
    void recover(); recoveryTimer = setInterval(recover, intervalMs); recoveryTimer.unref();
  }
  return { jobs, trace, register, checkpoint, withStartLock, assertRunning, stop, release, finish, requestCancel, reconcile, start, timeoutMs, stallMs, leaseMs, intervalMs, deadlineAt, newToken: randomUUID };
}
module.exports = { createExportLifecycle };
