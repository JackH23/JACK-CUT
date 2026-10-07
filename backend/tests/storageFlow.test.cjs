const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), fsp = require("node:fs/promises"), path = require("node:path"), os = require("node:os"), vm = require("node:vm");
const { Readable, Writable } = require("node:stream");
const { EventEmitter } = require("node:events");
const backend = path.resolve(__dirname, "..");
const projectId = "66ec12e5-244b-43e2-b36e-57bec761ade8";
function load(relative, mocks = {}, env = {}) {
  const filename = path.join(backend, relative), module = { exports: {} };
  const localRequire = name => Object.hasOwn(mocks, name) ? mocks[name] : name.startsWith(".") ? require(path.resolve(path.dirname(filename), name)) : require(name);
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), { require: localRequire, module, exports: module.exports, __dirname: path.dirname(filename), __filename: filename, process: { env, cwd: () => backend }, console: { log() {}, error() {} }, Buffer, AbortController, setTimeout });
  return module.exports;
}
function response() { return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } }; }
function storageHarness(env = {}) {
  const calls = [], clients = [], uploads = [];
  class Command { constructor(input) { this.input = input; } }
  class Client { constructor(options) { clients.push(options); } async send(command) { calls.push(command.input); return { Body: Readable.from([Buffer.from("data")]), ContentLength: 4, ContentType: "video/mp4", ContentRange: "bytes 0-3/10" }; } }
  class Upload { constructor(options) { uploads.push(options); this.options = options; } async done() { for await (const chunk of this.options.params.Body) { assert.ok(chunk.length); } } }
  const values = { R2_ACCOUNT_ID: "dummy", R2_ACCESS_KEY_ID: "dummy", R2_SECRET_ACCESS_KEY: "dummy", R2_BUCKET_NAME: "test", R2_ENDPOINT: "https://example.invalid", ...env };
  const storage = load("services/storage.js", { "@aws-sdk/client-s3": { S3Client: Client, GetObjectCommand: Command, DeleteObjectCommand: Command }, "@aws-sdk/lib-storage": { Upload } }, values);
  return { storage, calls, clients, uploads };
}
test("R2 transfers use streams and one shared client; temporary cleanup cannot delete persistent files", async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "jackcut-test-"));
  try {
    const { storage, calls, clients, uploads } = storageHarness({ TEMP_STORAGE_DIR: path.join(base, "scratch") });
    const file = path.join(base, "input.mp4"); await fsp.writeFile(file, "source");
    const ref = await storage.persist(file, "media/test.mp4", "video/mp4");
    assert.equal(ref, "r2:/media/test.mp4"); assert.equal(uploads[0].leavePartsOnError, false); assert.equal(uploads[0].queueSize, 2); assert.equal(uploads[0].params.ACL, undefined);
    const work = await storage.workspace(); const local = await storage.materialize(ref, work);
    assert.equal(await fsp.readFile(local, "utf8"), "data"); await storage.remove(ref);
    assert.equal(clients.length, 1); assert.equal(clients[0].endpoint, "https://example.invalid"); assert.equal(clients[0].region, "auto");
    assert.equal(calls[0].Key, "media/test.mp4"); await assert.rejects(storage.cleanup(base), /unsafe/);
    await storage.cleanup(work); assert.equal(fs.existsSync(work), false); assert.equal(fs.existsSync(file), true);
    assert.throws(() => storage.keyFrom("r2:/media/../../private"));
    assert.equal(storage.localPath("C:\\old\\backend\\uploads\\media\\legacy.mp4"), path.join(backend, "uploads", "media", "legacy.mp4"));
  } finally { await fsp.rm(base, { recursive: true, force: true }); }
});
test("private R2 playback forwards a single byte range and streams the response", async () => {
  const { storage, calls } = storageHarness(); const chunks = [];
  const res = new Writable({ write(chunk, encoding, callback) { chunks.push(chunk); callback(); } });
  res.headers = {}; res.setHeader = (name, value) => { res.headers[name] = value; }; res.status = code => { res.code = code; return res; };
  await storage.serve("r2:/media/test.mp4", { headers: { range: "bytes=0-3" } }, res);
  assert.equal(res.code, 206); assert.equal(calls[0].Range, "bytes=0-3"); assert.equal(res.headers["Content-Range"], "bytes 0-3/10"); assert.equal(res.headers["Cache-Control"], "private, no-store"); assert.equal(Buffer.concat(chunks).toString(), "data");
  const invalid = response(); invalid.setHeader = () => {};
  await storage.serve("r2:/media/test.mp4", { headers: { range: "bytes=0-1,3-4" } }, invalid); assert.equal(invalid.code, 416);
});
test("production cannot silently fall back to disk or incomplete R2 configuration", () => {
  assert.throws(() => storageHarness({ NODE_ENV: "production", STORAGE_DRIVER: "local" }).storage.driver(), /Production requires/);
  assert.throws(() => storageHarness({ R2_ENDPOINT: "" }).storage.driver(), /incomplete/);
  assert.equal(storageHarness({ STORAGE_DRIVER: "local" }).storage.driver(), "local");
});
function uploadHarness(fail = false, owned = true) {
  const written = [], removed = [], unlinked = [];
  const controller = load("controllers/mediaController.js", {
    "fs/promises": { unlink: async file => unlinked.push(file) },
    "../services/storage": { persist: async (_, key) => "r2:/" + key, remove: async ref => removed.push(ref) },
    "../services/fileAccess": { mediaUrl: (_, media) => "/api/media/" + media.id + "/content" },
    "../config/database": { transaction: async callback => callback({}) },
    "../models/Media": { create: async data => { if (fail) throw new Error("database failed"); written.push(data); return { id: "new", ...data }; } },
    "../models/Project": { findOne: async options => { assert.equal(options.where.user_id, "owner"); return owned ? { id: projectId } : null; } },
    "../models/ProjectMedia": { create: async () => {} }, "../models/TimelineItem": {},
  });
  const req = { body: { projectId }, user: { id: "owner" }, files: [{ path: "temporary.png", filename: "unique.png", originalname: "photo.png", mimetype: "image/png", size: 5 }] };
  return { controller, req, written, removed, unlinked };
}
test("uploads persist object references before DB commit and always clean temporary files", async () => {
  const h = uploadHarness(), res = response(); await h.controller.uploadMedia(h.req, res);
  assert.equal(res.code, 201); assert.equal(h.written[0].file_path, "r2:/media/unique.png"); assert.ok(h.unlinked.includes("temporary.png")); assert.equal(h.removed.length, 0);
});
test("failed upload DB transactions compensate new objects; unauthorized uploads write no object", async () => {
  const failed = uploadHarness(true), res = response(); await failed.controller.uploadMedia(failed.req, res);
  assert.equal(res.code, 500); assert.equal(failed.removed[0], "r2:/media/unique.png"); assert.ok(failed.unlinked.includes("temporary.png"));
  const denied = uploadHarness(false, false), deniedRes = response(); await denied.controller.uploadMedia(denied.req, deniedRes);
  assert.equal(deniedRes.code, 404); assert.equal(denied.written.length, 0); assert.ok(denied.unlinked.includes("temporary.png"));
});
test("file tickets are scoped to a resource and cannot be reused as API bearer tokens", async () => {
  const env = { JWT_SECRET: "test-only-signing-key" }, user = { id: "owner" }, User = { findByPk: async () => user };
  const auth = load("middleware/authMiddleware.js", { "../models/User": User }, env);
  const access = load("services/fileAccess.js", { "../models/User": User, "../middleware/authMiddleware": auth }, env);
  const url = access.fileUrl({ user }, "media", "file-one"); const token = new URL(url, "http://example.invalid").searchParams.get("ticket");
  let called = false; await access.fileAuth("media")({ headers: {}, query: { ticket: token }, params: { id: "file-one" } }, response(), () => { called = true; }); assert.equal(called, true);
  const wrong = response(); await access.fileAuth("media")({ headers: {}, query: { ticket: token }, params: { id: "file-two" } }, wrong, () => assert.fail()); assert.equal(wrong.code, 401);
  const bearer = response(); await auth({ headers: { authorization: "Bearer " + token } }, bearer, () => assert.fail()); assert.equal(bearer.code, 401);
});
test("timeline mutation authorization uses the stored project rather than forged body IDs", async () => {
  const access = load("middleware/projectAccess.js", { "../models/Project": { findOne: async options => { assert.equal(options.where.id, projectId); assert.equal(options.where.user_id, "other-user"); return null; } }, "../models/TimelineItem": { findByPk: async () => ({ project_id: projectId }) }, "../models/ProjectMedia": {} });
  const res = response(); await access({ baseUrl: "/api/timeline", params: { id: projectId }, body: { projectId: "forged" }, query: {}, user: { id: "other-user" } }, res, () => assert.fail()); assert.equal(res.code, 404);
});
function exportHarness({ code = 0, downloadFails = false, uploadFails = false, dbFails = false, owned = true } = {}) {
  const events = [], row = { id: projectId, project_id: projectId, status: "processing" }, child = new EventEmitter(); child.stderr = new EventEmitter();
  const controller = load("controllers/exportController.js", {
    "node:fs": { existsSync: () => true, writeFileSync() {} }, "node:child_process": { spawn: () => child }, "node:crypto": { randomUUID: () => projectId },
    "../models/TimelineItem": { findAll: async () => [{ item_type: "MEDIA", media_id: "source", start_time: 0, duration: 1, media_scale: 1 }] },
    "../models/Media": { findAll: async () => [{ id: "source", file_path: "r2:/media/source.png", media_type: "image" }] },
    "../models/ProjectMedia": { findOne: async () => ({}) }, "../models/Project": { findOne: async () => owned ? {} : null },
    "../models/ExportJob": { create: async () => { events.push("job-created"); }, update: async data => { if (dbFails && data.status === "completed") throw new Error("db"); Object.assign(row, data); events.push(data.status); }, findByPk: async () => row },
    "../services/fileAccess": { fileUrl: () => "/protected/download" },
    "../services/storage": { workspace: async () => "/scratch/render-one", materialize: async () => { if (downloadFails) throw new Error("download"); return "/scratch/render-one/source.png"; }, persist: async () => { assert.equal(row.status, "processing"); events.push("upload"); if (uploadFails) throw new Error("upload"); return "r2:/exports/" + projectId + ".mp4"; }, cleanup: async dir => { if (dir) events.push("cleanup"); }, serve: async () => { events.push("serve"); } },
  });
  return { controller, child, row, events, code };
}
test("exports publish only after R2 upload, clean scratch, and survive controller restart via DB metadata", async () => {
  const h = exportHarness(), res = response(); await h.controller.createExport({ body: { projectId }, user: { id: "owner" } }, res); assert.equal(res.code, 202);
  h.child.emit("close", 0); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.row.status, "completed"); assert.ok(h.events.indexOf("upload") < h.events.indexOf("completed")); assert.equal(h.events.at(-1), "cleanup"); assert.ok(h.row.output_path.startsWith("r2:/exports/"));
  const status = response(); await h.controller.getExport({ params: { id: projectId }, user: { id: "owner" } }, status); assert.equal(status.body.downloadUrl, "/protected/download");
  await h.controller.downloadExport({ params: { id: projectId }, user: { id: "owner" } }, response()); assert.equal(h.events.at(-1), "serve");
});
for (const failure of ["render", "upload", "db", "download"]) test("export " + failure + " failure cleans scratch and never exposes an incomplete output", async () => {
  const h = exportHarness({ uploadFails: failure === "upload", dbFails: failure === "db", downloadFails: failure === "download" }); const res = response(); await h.controller.createExport({ body: { projectId } }, res);
  if (failure !== "download") { assert.equal(res.code, 202); h.child.emit("close", failure === "render" ? 1 : 0); await new Promise(resolve => setImmediate(resolve)); assert.equal(h.row.status, "failed"); }
  else assert.equal(res.code, 500);
  assert.equal(h.events.at(-1), "cleanup");
  const denied = response(); await h.controller.downloadExport({ params: { id: projectId }, user: { id: "owner" } }, denied); assert.equal(denied.code, 409);
});
test("export status and downloads deny non-owners", async () => {
  const h = exportHarness({ owned: false });
  for (const method of ["getExport", "downloadExport"]) { const res = response(); await h.controller[method]({ params: { id: projectId }, user: { id: "stranger" } }, res); assert.equal(res.code, 404); }
});
