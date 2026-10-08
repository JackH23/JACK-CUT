const fsp = require('node:fs/promises');
const path = require('node:path');

// Identification only: absence from one database is evidence, never deletion authority.
async function inspectLocalExportOrphans({ storage, readReferences, retentionMs, now = Date.now, fs = fsp }) {
  const references = await readReferences(); // Failure aborts the report; never treat it as an empty DB.
  const referencedNames = new Set();
  for (const ref of references.paths) {
    if (typeof ref !== 'string' || ref.startsWith('r2:/')) continue;
    // Conservatively protect matching basenames even for legacy/foreign local paths.
    referencedNames.add(path.posix.basename(ref.replace(/\\/g, '/')).toLowerCase());
  }
  const directory = path.join(storage.ROOT, 'exports');
  let entries;
  try {
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe export directory.');
    entries = await fs.readdir(directory);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    entries = [];
  }
  const names = new Set(entries.map(name => name.toLowerCase()));
  const files = [];
  for (const name of entries.sort()) {
    if (!name.toLowerCase().endsWith('.mp4')) continue;
    const stat = await fs.lstat(path.join(directory, name));
    const regular = stat.isFile() && !stat.isSymbolicLink();
    const referenced = referencedNames.has(name.toLowerCase());
    const old = stat.mtimeMs <= now() - retentionMs;
    const basename = name.slice(0, -4).toLowerCase();
    files.push({ name, bytes: stat.size, modifiedAt: new Date(stat.mtimeMs).toISOString(),
      classification: !regular ? 'unsafe-entry' : referenced ? 'referenced' : old ? 'orphan-candidate' : 'unreferenced-recent',
      legacySidecars: ['.job.json', '.ass'].filter(ext => names.has(basename + ext)), deletionAllowed: false });
  }
  return { dryRun: true, directory, files, candidateBytes: files.filter(file => file.classification === 'orphan-candidate').reduce((sum, file) => sum + file.bytes, 0),
    verification: { databaseScope: 'configured database only', processingJobs: references.processingJobs,
      activeRenderProcesses: 'unverified', activeDownloads: 'unverified', otherDatabasesAndLegacyMetadata: 'unverified' },
    blockers: ['Verify all database and legacy metadata references.', 'Stop all backend/render instances and verify no FFmpeg processes or open downloads use these files.', 'Re-scan immediately before any separately authorized manual removal.'],
  };
}
module.exports = { inspectLocalExportOrphans };
