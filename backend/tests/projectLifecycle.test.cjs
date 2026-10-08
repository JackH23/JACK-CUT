const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { EventEmitter } = require('node:events');
const backend = process.env.AUDIT_PROJECT_ROOT || path.resolve(__dirname, '..');
const sourceRoot = process.env.AUDIT_SOURCE_ROOT || backend;
const projectId = '66ec12e5-244b-43e2-b36e-57bec761ade8';
const exportId = '76ec12e5-244b-43e2-b36e-57bec761ade8';
function load(file, mocks, env = {}) {
  const filename = path.join(sourceRoot, file), loaded = { exports: {} };
  const localRequire = name => Object.hasOwn(mocks, name) ? mocks[name] : name.startsWith('.') ? require(path.resolve(backend, path.dirname(file), name)) : require(require.resolve(name, { paths: [backend] }));
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { require: localRequire, module: loaded, exports: loaded.exports, console: { log() {}, error() {} }, process: { env }, Date, setTimeout, clearTimeout, Buffer });
  return loaded.exports;
}
function response() { return Object.assign(new EventEmitter(), { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }); }
function harness(options = {}) {
  const events = [], exports = [], signals = []; let projectExists = options.exists !== false;
  let parentTail = Promise.resolve(), downloadTail = Promise.resolve();
  const db = { transaction: async callback => {
    const snapshot = exports.map(row => ({ ...row })), exists = projectExists;
    const tx = { LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' }, releases: [] };
    try { const result = await callback(tx); events.push('commit'); return result; }
    catch(error) { exports.splice(0, exports.length, ...snapshot); projectExists = exists; events.push('rollback'); throw error; }
    finally { tx.releases.forEach(release => release()); }
  } };
  const project = { id: projectId, destroy: async ({ transaction }) => { assert.ok(transaction); if(options.deleteFails) throw Error('delete failed'); projectExists = false; events.push('delete-project'); } };
  const Project = { sequelize: db, findOne: async query => {
    if(query.lock) {
      assert.equal(query.lock, 'UPDATE'); assert.ok(query.transaction);
      const previous = parentTail; parentTail = new Promise(resolve => query.transaction.releases.push(resolve)); await previous;
      events.push('lock-project');
    }
    assert.equal(query.where.user_id, 'owner');
    return projectExists && options.owned !== false ? project : null;
  } };
  const ExportJob = {
    create: async (data, query) => { assert.ok(query.transaction); events.push('reserve-export'); exports.push({ ...data }); },
    findByPk: async (id, query = {}) => {
      if(query.lock === 'SHARE') { downloadTail = new Promise(resolve => query.transaction.releases.push(resolve)); events.push('lock-download'); }
      return exports.find(row => row.id === id) || null;
    },
    findOne: async query => exports.find(row => row.project_id === query.where.project_id && row.status === query.where.status) || null,
    update: async (data, query) => {
      if (options.update) await options.update(data, query);
      if(Object.hasOwn(data, 'project_id')) { await downloadTail; events.push('detach-history'); }
      for(const row of exports) if((query.where.id && row.id === query.where.id || query.where.project_id && row.project_id === query.where.project_id) && (!query.where.status || row.status === query.where.status)) Object.assign(row, data);
    },
  };
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.kill = signal => { signals.push(signal); if(options.killThrows) throw Error('signal failed'); return options.killResult !== false; };
  const cleanup = require(path.join(backend, 'services/exportCleanupService')).createExportCleanupService({ sequelize: db, ExportJob, storage: {}, Op: {} });
  const storage = {
    workspace: async () => { events.push('prepare'); if(options.prepare) await options.prepare(); return '/scratch/render-test'; },
    materialize: async () => '/safe/media.png', persist: async () => { events.push('persist'); if(options.persist) await options.persist(); return 'r2:/exports/' + exportId + '.mp4'; },
    cleanup: async directory => { if(directory) { if(options.cleanup) await options.cleanup(); events.push('scratch-cleanup'); } },
    serve: async () => { events.push('serve'); }, remove: () => assert.fail('No storage removal in lifecycle tests'),
  };
  const TimelineItem = { findAll: async () => options.empty ? [] : [{ item_type: 'MEDIA', media_id: 'source', start_time: 0, duration: 1 }], destroy: async query => { assert.ok(query.transaction); events.push('delete-timeline'); } };
  const ProjectMedia = { findOne: async () => ({}), destroy: async query => { assert.ok(query.transaction); events.push('delete-links'); } };
  const exportController = load('controllers/exportController.js', {
    '../models/Project': Project, '../models/ExportJob': ExportJob, '../models/TimelineItem': TimelineItem,
    '../models/Media': { findAll: async () => [{ id: 'source', media_type: 'image', file_path: '/safe/media.png' }] }, '../models/ProjectMedia': ProjectMedia,
    '../services/storage': storage, '../services/exportCleanupService': { getService: () => cleanup }, '../services/fileAccess': { fileUrl: () => '/protected/download' },
    'node:fs': { existsSync: () => true, writeFileSync() {} }, 'node:crypto': { randomUUID: () => exportId }, 'node:child_process': { spawn: () => { events.push('spawn'); return child; } },
  });
  const projectController = load('controllers/projectController.js', { '../models/Project': Project, '../models/ExportJob': ExportJob, '../models/TimelineItem': TimelineItem, '../models/ProjectMedia': ProjectMedia, '../config/database': db, './exportController': exportController });
  const req = { body: { projectId }, params: { id: projectId }, user: { id: 'owner' } };
  return { projectController, exportController, req, events, exports, child, signals, exists: () => projectExists };
}
test('delete rejects invalid IDs and non-owner projects before mutation', async () => {
  const invalid = harness(); const res = response(); await invalid.projectController.deleteProject({ ...invalid.req, params: { id: 'invalid' } }, res);
  assert.equal(res.code, 400); assert.deepEqual(invalid.events, []);
  const other = harness({ owned: false }); const denied = response(); await other.projectController.deleteProject(other.req, denied);
  assert.equal(denied.code, 404); assert.equal(other.exists(), true); assert.equal(other.events.includes('delete-project'), false);
});
test('deletion detaches export history before parent deletion, retaining storage references and shared media', async () => {
  const h = harness(); h.exports.push({ id: exportId, project_id: projectId, status: 'completed', progress: 100, output_path: 'r2:/exports/' + exportId + '.mp4', cleanup_reference: 'intent', metrics: { fps: 30 } });
  const res = response(); await h.projectController.deleteProject(h.req, res);
  assert.equal(res.code, 200); assert.equal(h.exports.length, 1); assert.equal(h.exports[0].project_id, null); assert.equal(h.exports[0].progress, 100); assert.ok(h.exports[0].output_path); assert.ok(h.exports[0].cleanup_reference);
  assert.ok(h.events.indexOf('detach-history') < h.events.indexOf('delete-project')); assert.ok(h.events.includes('delete-links')); assert.ok(h.events.includes('delete-timeline'));
});
test('failed project deletion rolls back detached export history', async () => {
  const h = harness({ deleteFails: true }); h.exports.push({ id: exportId, project_id: projectId, status: 'completed' });
  const res = response(); await h.projectController.deleteProject(h.req, res);
  assert.equal(res.code, 500); assert.equal(h.exports[0].project_id, projectId); assert.equal(h.exists(), true);
});
test('reservation commits before preparation; competing project deletion is blocked', async () => {
  let release; const h = harness({ prepare: () => new Promise(resolve => { release = resolve; }) });
  const created = response(); const creation = h.exportController.createExport(h.req, created); await new Promise(resolve => setImmediate(resolve));
  assert.ok(h.events.indexOf('commit') < h.events.indexOf('prepare')); assert.equal(h.exports[0].status, 'processing');
  const deleted = response(); await h.projectController.deleteProject(h.req, deleted); assert.equal(deleted.code, 409); assert.equal(h.exists(), true);
  release(); await creation; assert.equal(created.code, 202); h.child.emit('close', 1); await new Promise(resolve => setImmediate(resolve));
});
test('export creation after deletion and direct non-owner creation cannot start FFmpeg', async () => {
  const deleted = harness(); await deleted.projectController.deleteProject(deleted.req, response()); const res = response(); await deleted.exportController.createExport(deleted.req, res);
  assert.equal(res.code, 404); assert.equal(deleted.events.includes('spawn'), false);
  const other = harness({ owned: false }); const denied = response(); await other.exportController.createExport(other.req, denied); assert.equal(denied.code, 404); assert.equal(other.exports.length, 0);
});
test('cancellation signals only its process and remains processing until close; progress and metrics survive', async () => {
  const h = harness(); await h.exportController.createExport(h.req, response()); h.child.stdout.emit('data', Buffer.from('out_time=00:00:00.500\n'));
  const req = { ...h.req, params: { id: exportId } }; const cancelled = response(); await h.exportController.cancelExport(req, cancelled);
  assert.equal(cancelled.code, 202); assert.deepEqual(h.signals, ['SIGTERM']); assert.equal(h.exports[0].status, 'processing'); assert.equal(h.events.includes('scratch-cleanup'), false);
  h.child.emit('close', 1); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.exports[0].status, 'cancelled'); assert.equal(h.exports[0].progress, 50); assert.ok(h.exports[0].metrics); assert.equal(h.events.includes('persist'), false); assert.ok(h.events.includes('scratch-cleanup'));
});
test('failed kill can be retried and finished FFmpeg cannot be cancelled during publishing', async () => {
  const failed = harness({ killThrows: true }); await failed.exportController.createExport(failed.req, response());
  for(let attempt=0;attempt<2;attempt++) { const res=response(); await failed.exportController.cancelExport({ ...failed.req, params: { id: exportId } },res); assert.equal(res.code,500); }
  assert.equal(failed.signals.length,2); failed.child.emit('close',1); await new Promise(resolve=>setImmediate(resolve));
  let release; const finishing=harness({ persist:()=>new Promise(resolve=>{release=resolve;}) }); await finishing.exportController.createExport(finishing.req,response()); finishing.child.emit('close',0); await new Promise(resolve=>setImmediate(resolve));
  const res=response(); await finishing.exportController.cancelExport({...finishing.req,params:{id:exportId}},res); assert.equal(res.code,409); assert.equal(finishing.signals.length,0); release(); await new Promise(resolve=>setImmediate(resolve)); assert.equal(finishing.exports[0].status,'completed');
});
test('unknown processing owner after restart is not marked failed by status reads', async () => {
  const h=harness(); h.exports.push({id:exportId,project_id:projectId,status:'processing',progress:33});
  const status=response();await h.exportController.getExport({...h.req,params:{id:exportId}},status);assert.equal(status.body.status,'processing');assert.equal(h.exports[0].status,'processing');
  const deleted=response();await h.projectController.deleteProject(h.req,deleted);assert.equal(deleted.code,409);
});
for(const event of ['finish','close']) test('project deletion waits for active download '+event,async()=>{
 const h=harness();h.exports.push({id:exportId,project_id:projectId,status:'completed',progress:100,completed_at:new Date(),output_path:'r2:/exports/'+exportId+'.mp4'});
 const res=response();const transfer=h.exportController.downloadExport({...h.req,params:{id:exportId}},res);await new Promise(resolve=>setImmediate(resolve));
 const deleted=response();const deletion=h.projectController.deleteProject(h.req,deleted);await new Promise(resolve=>setImmediate(resolve));assert.equal(h.exists(),true);assert.equal(h.events.includes('delete-project'),false);
 res.emit(event);await Promise.all([transfer,deletion]);assert.equal(deleted.code,200);assert.equal(h.exists(),false);
});

test('project DELETE route requires real JWT middleware before the controller', async () => {
  const jwt = require('jsonwebtoken'), secret = 'project-route-test-only';
  const auth = load('middleware/authMiddleware.js', { '../models/User': { findByPk: async id => id === 'owner' ? { id } : null } }, { JWT_SECRET: secret });
  const controllers = { createProject() {}, getProjects() {}, getProject() {}, deleteProject() {} };
  const router = load('routes/projectRoutes.js', { '../middleware/authMiddleware': auth, '../controllers/projectController': controllers });
  assert.equal(router.stack[0].handle, auth);
  const route = router.stack.find(layer => layer.route?.methods.delete);
  assert.equal(route.route.path, '/:id'); assert.equal(route.route.stack[0].handle, controllers.deleteProject);
  for (const authorization of [undefined, 'Bearer invalid', 'Bearer ' + jwt.sign({ userId: 'owner' }, secret, { expiresIn: -1 }), 'Bearer ' + jwt.sign({ userId: 'missing' }, secret)]) {
    const res = response();
    await auth({ headers: { authorization } }, res, () => assert.fail('Invalid JWT must not reach project deletion'));
    assert.equal(res.code, 401);
  }
  const req = { headers: { authorization: 'Bearer ' + jwt.sign({ userId: 'owner' }, secret) } };
  let authorized = false;
  await auth(req, response(), () => { authorized = true; });
  assert.equal(authorized, true); assert.equal(req.user.id, 'owner');
});
test('cancellation persistence failure retries cancelled without ever writing failed', async () => {
  const statuses = []; let rejected = false;
  const h = harness({ update: async data => {
    if (!data.status) return;
    statuses.push(data.status);
    if (data.status === 'cancelled' && !rejected) { rejected = true; throw Error('temporary database error'); }
  } });
  await h.exportController.createExport(h.req, response());
  await h.exportController.cancelExport({ ...h.req, params: { id: exportId } }, response());
  h.child.emit('error', Error('terminated')); h.child.emit('close', null, 'SIGTERM');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(statuses, ['cancelled', 'cancelled']);
  const res = response(); await h.exportController.getExport({ ...h.req, params: { id: exportId } }, res);
  assert.equal(res.body.status, 'cancelled'); assert.equal(res.body.error, null); assert.equal(res.body.downloadAvailable, false); assert.equal(res.body.downloadUrl, null);
});
for (const code of [0, 1, null]) test('accepted cancellation wins close code ' + code + ' and duplicate callbacks', async () => {
  const h = harness(); await h.exportController.createExport(h.req, response());
  const req = { ...h.req, params: { id: exportId } };
  await h.exportController.cancelExport(req, response()); await h.exportController.cancelExport(req, response());
  assert.equal(h.signals.length, 1);
  h.child.emit('close', code); h.child.emit('error', Error('late error')); h.child.emit('close', 1);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.exports[0].status, 'cancelled'); assert.equal(h.exports[0].error_message, null);
  assert.equal(h.events.includes('persist'), false);
});
for (const code of [0, 1]) test('uncancelled close preserves ' + (code === 0 ? 'success' : 'failure'), async () => {
  const h = harness(); await h.exportController.createExport(h.req, response());
  h.child.emit('close', code); await new Promise(resolve => setImmediate(resolve));
  const res = response(); await h.exportController.getExport({ ...h.req, params: { id: exportId } }, res);
  assert.equal(res.body.status, code === 0 ? 'completed' : 'failed');
  assert.equal(res.body.downloadAvailable, code === 0);
  if (code === 1) assert.match(res.body.error, /Could not complete export/);
  else assert.equal(res.body.downloadUrl, '/protected/download');
});