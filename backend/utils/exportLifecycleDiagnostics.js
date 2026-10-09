// JSON-only, allowlisted metadata. No SQL, tokens, media paths, stderr or error messages.
const { randomUUID, createHash } = require('node:crypto');
const instance = randomUUID();
const events = new Set(['create_new','create_reused','create_rejected_cancelling','registered','cancel_request_begin','cancel_request_failed','cancel_request_persisted','cancel_owner_resolved','cancel_observed','stop_requested','signal_sent','signal_failed','ffmpeg_spawned','ffmpeg_exit','ffmpeg_close','ffmpeg_error','renderer_wait','renderer_acquired','renderer_released','progress_write_begin','progress_write_end','progress_write_failed','progress_wait_begin','progress_wait_end','terminal_transaction_begin','terminal_lock_acquired','terminal_write_begin','terminal_write_end','terminal_committed','terminal_failed','terminal_preserved','cleanup_begin','cleanup_end','cleanup_failed','unpublished_cleanup_begin','unpublished_cleanup_end','unpublished_cleanup_failed','lease_recovery_begin','lease_recovery_end','lease_recovery_failed','lease_recovery_query_failed','worker_released','heartbeat_failed','heartbeat_pending','cancellation_pending']);
const stages = new Set(['preparing','starting','rendering','uploading','cancelling','cancelled','completed','failed']);
const phases = new Set(['progress_wait','terminal_lock','terminal_update','terminal_commit','cleanup']);
const statuses = new Set(['processing','completed','cancelled','failed']);
const signals = new Set(['SIGTERM','SIGKILL','SIGABRT','SIGSEGV','SIGINT']);
const codes = new Set(['ENOENT','ESRCH','EPERM','EACCES','ENOMEM','ETIMEDOUT','ECONNRESET','ECONNREFUSED','57014','55P03','40P01','53300','08006']);
const errorNames = new Set(['SequelizeConnectionAcquireTimeoutError','SequelizeConnectionError','SequelizeDatabaseError','SequelizeTimeoutError','AbortError']);
function fingerprint(token) {
  return typeof token === 'string' && token.length <= 256 ? createHash('sha256').update(token).digest('hex').slice(0,16) : null;
}
function logLifecycleEvent(event, job = {}, detail = {}, logger = console) {
  if (!events.has(event)) return;
  const record = {
    component: 'export_lifecycle', event, at: new Date().toISOString(),
    instance, processPid: process.pid,
    jobId: typeof job.id === 'string' && /^[0-9a-f-]{36}$/i.test(job.id) ? job.id : null,
    lease: fingerprint(job.workerToken),
    stage: stages.has(job.stage) ? job.stage : null,
    status: statuses.has(job.status) ? job.status : null,
    progress: Number.isFinite(job.progress) ? Math.min(100, Math.max(0, job.progress)) : null,
    cancelRequested: Boolean(job.cancelRequested), aborted: Boolean(job.abort?.signal.aborted),
    childPid: Number.isInteger(job.child?.pid) ? job.child.pid : null,
    childClosed: Boolean(job.childClosed), waitingForRenderer: Boolean(job.waitingForRenderer),
    heartbeatBusy: Boolean(job.ticking),
    phase: phases.has(job.finalizationPhase) ? job.finalizationPhase : null,
  };
  for (const field of ['durationMs','ageMs','heartbeatAgeMs','progressWriteAgeMs','pendingProgressWrites','affectedRows','cancelledRows','failedRows','exitCode','signalAttempts']) {
    if (typeof detail[field] === 'number' && Number.isFinite(detail[field])) record[field] = detail[field];
  }
  if (typeof detail.killAccepted === 'boolean') record.killAccepted = detail.killAccepted;
  if (typeof detail.childKilled === 'boolean') record.childKilled = detail.childKilled;
  if (['local','not_local','token_mismatch','missing_row'].includes(detail.ownerRelation)) record.ownerRelation = detail.ownerRelation;
  if (typeof detail.ownerLease === 'string' && /^[0-9a-f]{16}$/.test(detail.ownerLease)) record.ownerLease = detail.ownerLease;
  if (statuses.has(detail.rowStatus)) record.rowStatus = detail.rowStatus;
  if (stages.has(detail.rowStage)) record.rowStage = detail.rowStage;
  if (typeof detail.rowCancelRequested === 'boolean') record.rowCancelRequested = detail.rowCancelRequested;
  if (['new_export','existing_active','existing_cancel','cancel_endpoint','internal_cancel','durable_cancel','internal_stop','heartbeat_timeout','heartbeat_stall','watchdog_timeout','watchdog_stall','lease_lost','database_error','preparation_error'].includes(detail.trigger)) record.trigger = detail.trigger;
  if (signals.has(detail.signal)) record.signal = detail.signal;
  const code = detail.error?.original?.code || detail.error?.code;
  if (codes.has(code)) record.errorCode = code;
  // PostgreSQL fields may embed row values in message/detail/where/SQL. Never log them.
  const pg = detail.error?.original || detail.error?.parent;
  if (pg && typeof pg.code === 'string' && /^[0-9A-Z]{5}$/.test(pg.code)) {
    record.sqlState = pg.code; record.errorCode = pg.code;
    const categories = { '23514':'check_violation', '23502':'not_null_violation',
      '23503':'foreign_key_violation', '42703':'undefined_column', '42P01':'undefined_table',
      '22P02':'invalid_text_representation', '55P03':'lock_unavailable',
      '57014':'query_cancelled_or_statement_timeout', '40P01':'deadlock',
      '42501':'insufficient_privilege', '08006':'connection_failure', '53300':'too_many_connections' };
    record.databaseError = categories[pg.code] || 'postgresql_error';
    if (['ERROR','FATAL','PANIC'].includes(pg.severity)) record.databaseSeverity = pg.severity;
    if (pg.table === 'export_jobs') record.databaseTable = pg.table;
    if (['export_jobs_status_check','export_jobs_progress_check','export_jobs_pkey','export_jobs_project_id_fkey'].includes(pg.constraint)) record.databaseConstraint = pg.constraint;
    if (['id','status','output_path','error_message','created_at','updated_at','completed_at','project_id','metrics','cleanup_reference','progress','worker_token','heartbeat_at','cancel_requested_at','stage'].includes(pg.column)) record.databaseColumn = pg.column;
  }
  if (['cancel_expired','fail_expired'].includes(detail.recoveryOperation)) record.recoveryOperation = detail.recoveryOperation;
  if (errorNames.has(detail.error?.name)) record.errorName = detail.error.name;
  // Logging must never prevent signalling, persistence or cleanup.
  try { logger.info(JSON.stringify(record)); } catch {}
}
module.exports = { logLifecycleEvent, fingerprint };
