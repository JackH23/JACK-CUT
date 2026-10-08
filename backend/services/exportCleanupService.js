const path = require('node:path');
function createExportCleanupService({ sequelize, ExportJob, storage, Op, env = process.env, now = Date.now, logger = console }) {
  const hours = Number(env.EXPORT_RETENTION_HOURS ?? 24);
  if (!Number.isFinite(hours) || hours <= 0) throw new Error('EXPORT_RETENTION_HOURS must be positive.');
  const retentionMs = hours * 3600000;
  let running = false, timer;
  function isExpired(job) {
    return job.status === 'completed' && job.completed_at != null && new Date(job.completed_at).getTime() <= now() - retentionMs;
  }
  function available(job) { return job.status === 'completed' && !job.cleanup_reference && Boolean(job.output_path ?? job.outputReference) && !isExpired(job); }
  function safeReference(job, ref = job.output_path) {
    if (typeof ref !== 'string') return false;
    if (ref.startsWith('r2:/')) return ref === `r2:/exports/${job.id}.mp4`;
    try { return path.resolve(storage.localPath(ref)) === path.join(storage.ROOT, 'exports', `${job.id}.mp4`); }
    catch { return false; }
  }
  function candidateWhere() {
    return { status: 'completed', [Op.or]: [
      { cleanup_reference: { [Op.ne]: null } },
      { completed_at: { [Op.lte]: new Date(now() - retentionMs) }, output_path: { [Op.ne]: null } },
    ] };
  }
  async function run({ dryRun = env.EXPORT_CLEANUP_ENABLED !== 'true' } = {}) {
    if (running) return 0;
    running = true;
    try {
      if (dryRun) {
        const rows = await ExportJob.findAll({ where: candidateWhere(), order: [['completed_at', 'ASC']], limit: 100 });
        return { dryRun: true, candidates: rows.filter(job => safeReference(job, job.cleanup_reference || job.output_path) && (job.cleanup_reference || isExpired(job))).map(job => ({ id: job.id, reference: job.cleanup_reference || job.output_path, pendingRecovery: Boolean(job.cleanup_reference) })) };
      }
      // Phase 1 must COMMIT before any object removal. The intent survives restarts,
      // storage errors, failed acknowledgement and changes to the retention setting.
      const ids = await sequelize.transaction(async transaction => {
        const [locks] = await sequelize.query('SELECT pg_try_advisory_xact_lock(748291, 1) AS acquired', { transaction });
        if (!locks[0].acquired) return [];
        const rows = await ExportJob.findAll({ where: candidateWhere(), order: [['completed_at', 'ASC']], limit: 100,
          transaction, lock: transaction.LOCK.UPDATE, skipLocked: true });
        const claimed = [];
        for (const job of rows) {
          const reference = job.cleanup_reference || job.output_path;
          if (!safeReference(job, reference) || (!job.cleanup_reference && !isExpired(job))) continue;
          if (!job.cleanup_reference) await ExportJob.update({ cleanup_reference: reference, output_path: null }, { where: { id: job.id }, transaction, silent: true });
          claimed.push(job.id);
        }
        return claimed;
      });
      let removed = 0;
      for (const id of ids) {
        try {
          // Row lock deduplicates recovery workers; a download's SHARE lock is skipped.
          removed += await sequelize.transaction(async transaction => {
            const job = await ExportJob.findOne({ where: { id, status: 'completed', cleanup_reference: { [Op.ne]: null } }, transaction, lock: transaction.LOCK.UPDATE, skipLocked: true });
            if (!job || !safeReference(job, job.cleanup_reference)) return 0;
            await storage.remove(job.cleanup_reference);
            // If this commit fails, the durable intent still exists. Idempotent remove
            // permits retry even when the previous attempt successfully deleted storage.
            await ExportJob.update({ cleanup_reference: null }, { where: { id }, transaction, silent: true });
            return 1;
          });
        } catch { logger.error('Export cleanup item failed; durable intent retained for retry.'); }
      }
      return removed;
    } finally { running = false; }
  }
  async function withDownload(id, callback) {
    return sequelize.transaction(async transaction => {
      const row = await ExportJob.findByPk(id, { transaction, lock: transaction.LOCK.SHARE });
      return callback(row);
    });
  }
  function start() {
    // Deletion is opt-in. Dry-run CLI supplies the report without a recurring query loop.
    if (timer || env.EXPORT_CLEANUP_ENABLED !== 'true') return;
    timer = setInterval(() => { void run().catch(() => logger.error('Export cleanup failed; no uncommitted deletion intents were executed.')); }, 60000);
    timer.unref();
  }
  function stop() { clearInterval(timer); timer = undefined; }
  return { run, start, stop, isExpired, available, withDownload, retentionMs };
}
let singleton;
function getService() {
  if (!singleton) singleton = createExportCleanupService({ sequelize: require('../config/database'), ExportJob: require('../models/ExportJob'), storage: require('./storage'), Op: require('sequelize').Op });
  return singleton;
}
module.exports = { createExportCleanupService, getService };
