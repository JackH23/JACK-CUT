const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const express = require('express');
const jwt = require('jsonwebtoken');
const projectId = '66ec12e5-244b-43e2-b36e-57bec761ade8';
function load(file, dependencies, env = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    module, process: { env }, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  return module.exports;
}
async function harness(flag) {
  const env = { JWT_SECRET: 'local-test-fixture-only' };
  if (flag !== undefined) env.EXPORT_SUBMISSIONS_PAUSED = flag;
  const effects = { insert: 0, prepare: 0, spawn: 0, upload: 0, status: 0, cancel: 0, download: 0 };
  const auth = load('middleware/authMiddleware.js', { jsonwebtoken: jwt, '../models/User': { findByPk: async id => id === 'owner' ? { id } : null } }, env);
  const access = load('middleware/projectAccess.js', {
    '../models/Project': { findOne: async ({ where }) => where.id === projectId && where.user_id === 'owner' ? { id: projectId } : null },
    '../models/TimelineItem': {}, '../models/ProjectMedia': {},
  });
  const guard = load('middleware/exportSubmissionGuard.js', {}, env);
  const route = load('routes/exportRoutes.js', {
    express, '../middleware/authMiddleware': auth, '../middleware/projectAccess': access,
    '../middleware/exportSubmissionGuard': guard, '../services/fileAccess': { fileAuth: () => auth },
    '../controllers/exportController': {
      createExport: (req, res) => { for (const key of ['insert', 'prepare', 'spawn', 'upload']) effects[key]++; res.status(202).json({ id: 'job', status: 'processing' }); },
      getExport: (req, res) => { effects.status++; res.json({ status: 'processing' }); },
      cancelExport: (req, res) => { effects.cancel++; res.status(202).json({ status: 'processing', cancelRequested: true }); },
      downloadExport: (req, res) => { effects.download++; res.send('completed-output'); },
    },
  });
  const app = express(); app.use(express.json()); app.use('/api/exports', route);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const token = jwt.sign({ userId: 'owner' }, env.JWT_SECRET, { algorithm: 'HS256' });
  return {
    env, effects,
    request: (method = 'POST', suffix = '', authenticated = true, body = { projectId }) => fetch('http://127.0.0.1:' + server.address().port + '/api/exports' + suffix, {
      method, headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Bearer ' + token } : {}) },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    }),
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }),
  };
}
for (const flag of [undefined, 'false', ' FALSE ', '1', '']) test('authorized submission allowed with flag ' + JSON.stringify(flag), async () => {
  const h = await harness(flag); try { assert.equal((await h.request()).status, 202); assert.equal(h.effects.insert, 1); } finally { await h.close(); }
});
for (const flag of ['true', ' TrUe ']) test('paused submission returns maintenance response with no job or render side effects ' + JSON.stringify(flag), async () => {
  const h = await harness(flag); try {
    for (const suffix of ['', '/']) {
      const response = await h.request('POST', suffix); assert.equal(response.status, 503);
      const body = await response.json(); assert.equal(body.code, 'EXPORT_SUBMISSIONS_PAUSED'); assert.match(body.message, /temporarily paused for maintenance/);
    }
    for (const key of ['insert', 'prepare', 'spawn', 'upload']) assert.equal(h.effects[key], 0);
  } finally { await h.close(); }
});
test('pause preserves unauthenticated rejection and project authorization', async () => {
  const h = await harness('true'); try {
    assert.equal((await h.request('POST', '', false)).status, 401);
    assert.equal((await h.request('POST', '', true, {})).status, 400);
    assert.equal((await h.request('POST', '', true, { projectId: '77ec12e5-244b-43e2-b36e-57bec761ade8' })).status, 404);
    assert.equal(h.effects.insert, 0);
  } finally { await h.close(); }
});
test('pause leaves authenticated status, cancellation and completed download routes available', async () => {
  const h = await harness('true'); try {
    assert.equal((await h.request('GET', '/job')).status, 200);
    assert.equal((await h.request('POST', '/job/cancel')).status, 202);
    assert.equal(await (await h.request('GET', '/job/download')).text(), 'completed-output');
    for (const [method, suffix] of [['GET', '/job'], ['POST', '/job/cancel'], ['GET', '/job/download']]) assert.equal((await h.request(method, suffix, false)).status, 401);
    assert.equal(h.effects.status, 1); assert.equal(h.effects.cancel, 1); assert.equal(h.effects.download, 1); assert.equal(h.effects.insert, 0);
  } finally { await h.close(); }
});
test('guard reads current process environment and admission resumes when disabled', async () => {
  const h = await harness('true'); try {
    assert.equal((await h.request()).status, 503); h.env.EXPORT_SUBMISSIONS_PAUSED = 'false';
    assert.equal((await h.request()).status, 202); assert.equal(h.effects.insert, 1);
    h.env.EXPORT_SUBMISSIONS_PAUSED = 'true'; assert.equal((await h.request()).status, 503); assert.equal(h.effects.insert, 1);
    delete h.env.EXPORT_SUBMISSIONS_PAUSED; assert.equal((await h.request()).status, 202); assert.equal(h.effects.insert, 2);
  } finally { await h.close(); }
});
