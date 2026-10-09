const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { Transform } = require('node:stream');
const { pipeline } = require("node:stream/promises");
const { S3Client, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");

const ROOT = path.resolve(__dirname, "..");
const TEMP_ROOT = path.resolve(process.env.TEMP_STORAGE_DIR || path.join(os.tmpdir(), "jackcut"));
const names = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_ENDPOINT"];
let client;
function driver() {
  const mode = process.env.STORAGE_DRIVER || (names.some(name => process.env[name]) || process.env.NODE_ENV === "production" ? "r2" : "local");
  if (!["local", "r2"].includes(mode)) throw new Error("STORAGE_DRIVER must be local or r2.");
  if (process.env.NODE_ENV === "production" && mode !== "r2") throw new Error("Production requires R2 storage.");
  if (mode === "r2" && names.some(name => !process.env[name])) throw new Error("R2 configuration is incomplete; configure all five R2 variables.");
  return mode;
}
function getClient() {
  driver();
  if (!client) client = new S3Client({
    region: "auto", endpoint: process.env.R2_ENDPOINT,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}
function keyFrom(reference) {
  if (typeof reference !== "string" || !/^r2:\/(media|exports)\/[a-zA-Z0-9._-]+$/.test(reference)) throw new Error("Invalid R2 object reference.");
  return reference.slice(4);
}
function localPath(reference) {
  // Legacy records may have absolute Windows paths. Only managed filenames are used.
  const normalized = String(reference).replace(/\\/g, "/");
  const filename = path.posix.basename(normalized);
  const directory = normalized.includes("/uploads/media/") ? path.join(ROOT, "uploads", "media") : normalized.includes("/exports/") ? path.join(ROOT, "exports") : null;
  if (!directory || !filename || filename === "." || filename === "..") throw new Error("Invalid local storage reference.");
  return path.join(directory, filename);
}
function referenceFor(key) {
  if (!/^(media|exports)[/][a-zA-Z0-9._-]+$/.test(key)) throw new Error('Invalid storage key.');
  return driver() === 'r2' ? 'r2:/' + key : key.startsWith('media/') ? path.join(ROOT, 'uploads', key) : path.join(ROOT, key);
}
async function persist(filePath, key, contentType, { signal, onProgress } = {}) {
  signal?.throwIfAborted();
  if (!/^(media|exports)\/[a-zA-Z0-9._-]+$/.test(key)) throw new Error("Invalid storage key.");
  if (driver() === "r2") {
    const body = fs.createReadStream(filePath);
    try {
      // Upload.abort() races its internal work. Abort the actual SDK requests
      // instead, so done() settles only after all parts and abort cleanup settle.
      const baseClient = getClient();
      const uploadClient = signal ? { config: baseClient.config, send(command, options) {
        return baseClient.send(command, { ...options,
          ...(command.constructor.name === 'AbortMultipartUploadCommand' ? {} : { abortSignal: signal }) });
      } } : baseClient;
      const upload = new Upload({ client: uploadClient, queueSize: 2, partSize: 8 * 1024 * 1024, leavePartsOnError: false,
        params: { Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: body, ContentType: contentType } });
      const abortUpload = () => { body.destroy(); };
      if (onProgress) upload.on('httpUploadProgress', onProgress);
      signal?.addEventListener('abort', abortUpload, { once: true });
      try {
        signal?.throwIfAborted();
        await upload.done();
        // Return the reference even if cancellation races the completed upload;
        // the caller compensates it after checking its durable cancellation flag.
      } finally { signal?.removeEventListener('abort', abortUpload); }
      return "r2:/" + key;
    } finally { body.destroy(); }
  }
  const target = key.startsWith("media/") ? path.join(ROOT, "uploads", key) : path.join(ROOT, key);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  signal?.throwIfAborted();
  if (path.resolve(filePath) !== target) await fsp.copyFile(filePath, target, fs.constants.COPYFILE_EXCL);
  return target;
}
async function remove(reference) {
  try {
    if (reference.startsWith("r2:/")) {
      const key = keyFrom(reference); // Validate before initializing the client.
      await getClient().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
    } else await fsp.unlink(localPath(reference));
  } catch (error) {
    // S3 DeleteObject normally succeeds for missing keys. Never swallow bucket,
    // authorization, transport or generic 404 errors as a successful deletion.
    if (error.code !== 'ENOENT' && error.name !== 'NoSuchKey' && error.code !== 'NoSuchKey') throw error;
  }
}
async function materialize(reference, workDir, { signal, onProgress } = {}) {
  signal?.throwIfAborted();
  if (!reference.startsWith("r2:/")) return localPath(reference);
  const key = keyFrom(reference);
  const destination = path.join(workDir, path.basename(key));
  const object = await getClient().send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }), { abortSignal: signal });
  const meter = onProgress ? [new Transform({ transform(chunk, encoding, callback) {
    onProgress(chunk.length); callback(null, chunk);
  } })] : [];
  await pipeline(object.Body, ...meter, fs.createWriteStream(destination, { flags: "wx" }), ...(signal ? [{ signal }] : []));
  return destination;
}
async function workspace() {
  await fsp.mkdir(TEMP_ROOT, { recursive: true });
  return fsp.mkdtemp(path.join(TEMP_ROOT, "render-"));
}
async function cleanup(workDir) {
  if (!workDir) return;
  const resolved = path.resolve(workDir);
  if (path.dirname(resolved) !== TEMP_ROOT || !path.basename(resolved).startsWith("render-")) throw new Error("Refusing unsafe temporary directory cleanup.");
  await fsp.rm(resolved, { recursive: true, force: true });
}
async function serve(reference, req, res, options = {}) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!reference.startsWith("r2:/")) {
    const filename = localPath(reference);
    return options.downloadName ? res.download(filename, options.downloadName) : res.sendFile(filename);
  }
  const range = req.headers.range;
  if (range && !/^bytes=(\d+-\d*|-\d+)$/.test(range)) return res.status(416).end();
  const abort = new AbortController();
  const onClose = () => { if (!res.writableFinished) abort.abort(); };
  res.on("close", onClose);
  try {
    const object = await getClient().send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: keyFrom(reference), ...(range ? { Range: range } : {}) }), { abortSignal: abort.signal });
    res.status(range ? 206 : 200);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", object.ContentType || options.contentType || "application/octet-stream");
    if (object.ContentLength != null) res.setHeader("Content-Length", object.ContentLength);
    if (object.ContentRange) res.setHeader("Content-Range", object.ContentRange);
    if (options.downloadName) res.attachment(options.downloadName);
    await pipeline(object.Body, res);
  } catch (error) {
    if (res.headersSent || abort.signal.aborted) { res.destroy(); return; }
    const status = error.$metadata?.httpStatusCode;
    res.status(status === 404 ? 404 : status === 416 ? 416 : 502).json({ message: "Stored file is unavailable." });
  } finally { res.off("close", onClose); }
}
module.exports = { ROOT, TEMP_ROOT, driver, referenceFor, persist, remove, materialize, workspace, cleanup, serve, localPath, keyFrom };
