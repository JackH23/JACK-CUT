const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const filename = path.resolve(__dirname, '../scripts/exportCleanup.js');
async function runCli({ schemaReady = true, args = ['--dry-run'], dbFails = false } = {}) {
  const events = [], output = [], errors = [], process = { argv: ['node', filename, ...args], env: {} };
  const sequelize = {
    transaction: async (options, callback) => { assert.equal(options.isolationLevel, 'REPEATABLE READ'); events.push('transaction'); return callback({ id: 'read-only' }); },
    query: async sql => { assert.equal(sql, 'SET TRANSACTION READ ONLY'); events.push('read-only'); },
    getQueryInterface: () => ({ describeTable: async () => ({ ...(schemaReady ? { cleanup_reference: {} } : {}) }) }),
    close: async () => { events.push('close'); },
  };
  const mocks = {
    dotenv: { config() {} }, '../config/database': sequelize,
    '../models/ExportJob': { findAll: async query => {
      assert.ok(events.includes('read-only')); assert.equal(query.raw, true);
      assert.equal(query.attributes.includes('cleanup_reference'), schemaReady);
      if (dbFails) throw new Error('credentials-secret');
      return [{ status: 'processing', output_path: 'C:/exports/held.mp4', cleanup_reference: 'C:/exports/pending.mp4' }];
    } },
    '../models/Media': { findAll: async () => [{ file_path: 'C:/exports/media.mp4' }] },
    '../services/storage': { remove() { assert.fail('CLI must never remove storage'); } },
    '../services/exportCleanupService': { getService: () => ({ retentionMs: 86400000, run: async options => { assert.equal(options.dryRun, true); events.push('cleanup-dry-run'); return { dryRun: true }; } }) },
    '../services/exportOrphanInspectionService': { inspectLocalExportOrphans: async options => {
      const refs = await options.readReferences(); assert.equal(refs.processingJobs, 1); assert.ok(refs.paths.includes('C:/exports/media.mp4'));
      events.push('inspect'); return { dryRun: true };
    } },
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { require: name => mocks[name] || require(name), __dirname: path.dirname(filename), process,
    console: { log: value => output.push(JSON.parse(value)), error: value => errors.push(value) } });
  await new Promise(resolve => setImmediate(resolve));
  return { events, output, errors, process };
}
test('CLI enforces read-only DB snapshot and explicit dry run', async () => {
  const h = await runCli(); assert.equal(h.errors.length, 0); assert.equal(h.output[0].databaseCleanup.dryRun, true);
  assert.equal(h.events.at(-1), 'close');
});
test('CLI supports old schema without migration and fails closed on DB error', async () => {
  const old = await runCli({ schemaReady: false }); assert.equal(old.output[0].databaseCleanup.schemaReady, false);
  assert.equal(old.events.includes('cleanup-dry-run'), false);
  const failed = await runCli({ dbFails: true }); assert.equal(failed.process.exitCode, 1); assert.equal(failed.output.length, 0);
  assert.equal(failed.errors.some(message => message.includes('credentials-secret')), false); assert.equal(failed.events.at(-1), 'close');
});
test('CLI rejects apply before connecting to database', async () => {
  const h = await runCli({ args: ['--apply'] }); assert.equal(h.process.exitCode, 1); assert.deepEqual(h.events, []);
});
