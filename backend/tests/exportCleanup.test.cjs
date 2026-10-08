const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createExportCleanupService } = require('../services/exportCleanupService');
const { inspectLocalExportOrphans } = require('../services/exportOrphanInspectionService');
const now = 1800000000000;
const Op = { lte: Symbol('lte'), ne: Symbol('ne'), or: Symbol('or'), in: Symbol('in') };
function job(status = 'completed', age = 25, extra = {}) {
  return { id: 'job-one', status, progress: status === 'completed' ? 100 : 45, metrics: { fps: 30 }, completed_at: new Date(now - age * 3600000), output_path: 'r2:/exports/job-one.mp4', cleanup_reference: null, ...extra };
}
function harness(rows = [], options = {}) {
  const removed = [], updates = [], queries = [], events = [], logs = [];
  let commits = 0;
  const db = {
    transaction: async callback => {
      const snapshot = rows.map(row => ({ ...row }));
      events.push('begin');
      try {
        const result = await callback({ LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' } });
        if (options.failCommit?.(++commits)) throw new Error('commit failed');
        events.push('commit'); return result;
      } catch (error) { rows.forEach((row, index) => Object.assign(row, snapshot[index])); events.push('rollback'); throw error; }
    },
    query: async () => [[{ acquired: options.acquired !== false }]],
  };
  const model = {
    findAll: async query => { queries.push(query); return rows.filter(row => !options.locked?.has(row.id)); },
    findOne: async query => { queries.push(query); return rows.find(row => row.id === query.where.id && row.cleanup_reference && !options.locked?.has(row.id)) || null; },
    findByPk: async (_, query) => { queries.push(query); return rows[0]; },
    update: async (data, query) => { updates.push({ data, query }); Object.assign(rows.find(row => row.id === query.where.id), data); },
  };
  const storage = { ROOT: path.resolve('/test/backend'), localPath: ref => path.resolve(ref), remove: async ref => { events.push('remove'); removed.push(ref); if (options.remove) await options.remove(ref); } };
  const service = createExportCleanupService({ sequelize: db, ExportJob: model, storage, Op, now: () => now, env: { EXPORT_CLEANUP_ENABLED: 'true', ...options.env }, logger: { error: message => logs.push(message) } });
  return { service, removed, updates, queries, events, logs, db, model, storage };
}
test('active, recent completed and failed exports remain untouched', async () => {
  const h = harness([job('processing'), job('completed', 23), job('failed', 23)]);
  assert.equal(await h.service.run(), 0); assert.deepEqual(h.removed, []);
  assert.equal(h.service.available(job('completed', 23)), true);
  assert.equal(h.service.available(job('processing')), false);
});
test('intent commits before deletion; history, progress, metrics and completion remain unchanged', async () => {
  const row = job(); const original = { ...row }; const h = harness([row]);
  assert.equal(await h.service.run(), 1);
  assert.ok(h.events.indexOf('commit') < h.events.indexOf('remove'));
  assert.deepEqual(h.removed, [original.output_path]);
  assert.deepEqual(h.updates[0].data, { output_path: null, cleanup_reference: original.output_path });
  assert.deepEqual(h.updates[1].data, { cleanup_reference: null });
  for (const key of ['status', 'progress', 'metrics', 'completed_at']) assert.deepEqual(row[key], original[key]);
  assert.ok(h.updates.every(update => update.query.silent));
  assert.equal(h.queries[0].skipLocked, true); assert.equal(h.queries[0].limit, 100);
  assert.equal(h.queries[0].lock, 'UPDATE');
  assert.equal(h.queries[0].where[Op.or][1].completed_at[Op.lte].getTime(), now - 86400000);
});
test('dry-run defaults never mutate references or remove storage; timer is disabled', async () => {
  const h = harness([job()], { env: { EXPORT_CLEANUP_ENABLED: 'false' } });
  const report = await h.service.run(); h.service.start(); h.service.stop();
  assert.equal(report.dryRun, true); assert.equal(report.candidates.length, 1);
  assert.deepEqual(h.events, []); assert.deepEqual(h.updates, []); assert.deepEqual(h.removed, []);
});
test('claim commit failure causes no storage deletion', async () => {
  const row = job(); const h = harness([row], { failCommit: n => n === 1 });
  await assert.rejects(h.service.run(), /commit failed/);
  assert.deepEqual(h.removed, []); assert.ok(row.output_path); assert.equal(row.cleanup_reference, null);
});
test('acknowledgement commit failure retains intent; next run retries already absent storage', async () => {
  const row = job(); const h = harness([row], { failCommit: n => n === 2 });
  assert.equal(await h.service.run(), 0); assert.equal(row.output_path, null); assert.ok(row.cleanup_reference);
  assert.equal(h.service.available(row), false);
  assert.equal(await h.service.run(), 1); assert.equal(row.cleanup_reference, null); assert.equal(h.removed.length, 2);
});
test('storage failures retain intent, do not starve other exports and log no error details', async () => {
  const second = job('completed', 25, { id: 'job-two', output_path: 'r2:/exports/job-two.mp4' });
  const row = job(); const h = harness([row, second], { remove: async ref => { if (ref.includes('job-one')) throw new Error('secret-token'); } });
  assert.equal(await h.service.run(), 1); assert.ok(row.cleanup_reference); assert.equal(second.cleanup_reference, null);
  assert.equal(h.logs.some(message => message.includes('secret-token')), false);
  assert.equal(await h.service.run(), 0);
});
test('pending intent survives process restart and longer retention', async () => {
  const row = job('completed', 1, { output_path: null, cleanup_reference: 'r2:/exports/job-one.mp4' });
  const h = harness([row], { env: { EXPORT_RETENTION_HOURS: '48' } });
  assert.equal(await h.service.run(), 1); assert.equal(row.cleanup_reference, null);
});
test('retention boundary, absent completion and invalid configuration', () => {
  const h = harness(); assert.equal(h.service.isExpired(job('completed', 24)), true);
  assert.equal(h.service.isExpired(job('completed', 100, { completed_at: null })), false);
  assert.equal(h.service.available(job('completed', 1, { output_path: null })), false);
  for (const value of ['0', '-1', 'invalid', 'Infinity']) assert.throws(() => harness([], { env: { EXPORT_RETENTION_HOURS: value } }), /positive/);
});
test('unsafe and unrelated storage references remain untouched', async () => {
  const h = harness([job('completed', 25, { output_path: 'r2:/media/job-one.mp4' }), job('completed', 25, { output_path: 'r2:/exports/other.mp4' })]);
  assert.equal(await h.service.run(), 0); assert.deepEqual(h.removed, []);
});
test('duplicate worker advisory lock prevents candidate queries', async () => {
  const h = harness([job()], { acquired: false });
  assert.equal(await h.service.run(), 0); assert.equal(h.queries.length, 0);
});
test('overlapping runs suppressed; locked download rows and recovery rows skipped', async () => {
  let release; const h = harness([job()], { remove: () => new Promise(resolve => { release = resolve; }) });
  const first = h.service.run(); await new Promise(resolve => setImmediate(resolve));
  await h.service.run(); assert.equal(h.removed.length, 1); release(); await first;
  const locked = harness([job()], { locked: new Set(['job-one']) });
  assert.equal(await locked.service.run(), 0); assert.deepEqual(locked.removed, []);
});
test('download shared transaction persists until callback completes', async () => {
  const h = harness([job('completed', 1)]); let release;
  const transfer = h.service.withDownload('job-one', async () => new Promise(resolve => { release = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.events, ['begin']); assert.equal(h.queries[0].lock, 'SHARE');
  release(); await transfer; assert.deepEqual(h.events, ['begin', 'commit']);
});
test('orphan inspection protects references and sidecars; never permits deletion', async () => {
  const stat = (file = true) => ({ isDirectory: () => !file, isFile: () => file, isSymbolicLink: () => false, size: 100, mtimeMs: now - 25 * 3600000 });
  const fakeFs = { readdir: async () => ['old.mp4', 'held.mp4', 'old.job.json', 'old.ass', 'recent.mp4'], lstat: async file => file.endsWith('exports') ? stat(false) : file.endsWith('recent.mp4') ? { ...stat(), mtimeMs: now } : stat() };
  const report = await inspectLocalExportOrphans({ storage: { ROOT: '/safe' }, readReferences: async () => ({ paths: ['C:\\legacy\\exports\\held.mp4'], processingJobs: 1 }), retentionMs: 86400000, now: () => now, fs: fakeFs });
  assert.equal(report.files.find(file => file.name === 'held.mp4').classification, 'referenced');
  assert.equal(report.files.find(file => file.name === 'recent.mp4').classification, 'unreferenced-recent');
  assert.deepEqual(report.files.find(file => file.name === 'old.mp4').legacySidecars, ['.job.json', '.ass']);
  assert.equal(report.candidateBytes, 100); assert.ok(report.files.every(file => file.deletionAllowed === false));
  assert.equal(report.verification.activeDownloads, 'unverified');
});
test('orphan scan fails closed on DB error or linked export directory', async () => {
  await assert.rejects(inspectLocalExportOrphans({ readReferences: async () => { throw new Error('db offline'); } }), /db offline/);
  await assert.rejects(inspectLocalExportOrphans({ storage: { ROOT: '/safe' }, readReferences: async () => ({ paths: [], processingJobs: 0 }), fs: { lstat: async () => ({ isDirectory: () => true, isSymbolicLink: () => true }) } }), /Unsafe/);
});

test('separate cleanup worker skips an intent held by another recovery worker', async () => {
  const locks = new Set(); let release;
  const h = harness([job()], { locked: locks, remove: async () => {
    locks.add('job-one');
    await new Promise(resolve => { release = resolve; });
    locks.delete('job-one');
  } });
  const other = createExportCleanupService({ sequelize: h.db, ExportJob: h.model, storage: h.storage, Op, now: () => now, env: { EXPORT_CLEANUP_ENABLED: 'true' } });
  const first = h.service.run(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(await other.run(), 0); assert.equal(h.removed.length, 1);
  release(); assert.equal(await first, 1);
});

test('expired failed and cancelled published outputs clean up while retaining status and progress', async () => {
  for (const status of ['failed', 'cancelled']) {
    const row = job(status); const h = harness([row]);
    assert.equal(await h.service.run(), 1);
    assert.equal(row.status, status); assert.equal(row.progress, 45);
    assert.equal(row.output_path, null); assert.equal(row.cleanup_reference, null);
    assert.deepEqual(row.metrics, { fps: 30 });
  }
});
test('failed and cancelled outputs without a terminal timestamp fail closed', async () => {
  const h = harness(['failed', 'cancelled'].map(status => job(status, 100, { completed_at: null })));
  assert.equal(await h.service.run(), 0); assert.deepEqual(h.removed, []);
});