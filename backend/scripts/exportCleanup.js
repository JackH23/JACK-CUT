// Read-only entry point: never imports server.js, syncs schemas, starts jobs or removes objects.
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--dry-run')) throw new Error('Only --dry-run is supported.');
  const sequelize = require('../config/database');
  try {
    const ExportJob = require('../models/ExportJob');
    const Media = require('../models/Media');
    const storage = require('../services/storage');
    const { inspectLocalExportOrphans } = require('../services/exportOrphanInspectionService');
    const cleanup = require('../services/exportCleanupService').getService();
    const report = await sequelize.transaction({ isolationLevel: 'REPEATABLE READ' }, async transaction => {
      await sequelize.query('SET TRANSACTION READ ONLY', { transaction });
      const columns = await sequelize.getQueryInterface().describeTable('export_jobs', { transaction });
      const attributes = ['id', 'status', 'output_path'];
      if (columns.cleanup_reference) attributes.push('cleanup_reference');
      const [jobs, media] = await Promise.all([
        ExportJob.findAll({ attributes, transaction, raw: true }),
        Media.findAll({ attributes: ['file_path'], transaction, raw: true }),
      ]);
      return inspectLocalExportOrphans({ storage, retentionMs: cleanup.retentionMs,
        readReferences: async () => ({ paths: [...jobs.flatMap(job => [job.output_path, job.cleanup_reference]), ...media.map(item => item.file_path)],
          processingJobs: jobs.filter(job => job.status === 'processing').length }) });
    });
    const columns = await sequelize.getQueryInterface().describeTable('export_jobs');
    const databaseCleanup = columns.cleanup_reference ? await cleanup.run({ dryRun: true }) : { dryRun: true, schemaReady: false, message: 'Recovery column is absent; normal backend startup installs the additive migration. No schema was changed by this report.' };
    console.log(JSON.stringify({ localOrphans: report, databaseCleanup }, null, 2));
  } finally { await sequelize.close(); }
}
main().catch(() => { console.error('Dry-run inspection failed. Verify arguments, database access and local export directory permissions. No deletion was performed.'); process.exitCode = 1; });
