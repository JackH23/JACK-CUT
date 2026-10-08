// Allowlisted metadata only: never log raw stderr, arguments, URLs, text or error objects.
const allowedCodes = new Set(['ENOENT', 'EACCES', 'EPERM', 'ENOSPC', 'ENOMEM', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', 'AccessDenied', 'NoSuchKey', 'NoSuchBucket', 'ServiceUnavailable', 'SlowDown']);
function safeCode(value) { return allowedCodes.has(value) ? value : null; }
function safeSignal(value) { return ['SIGTERM','SIGKILL','SIGABRT','SIGSEGV','SIGINT'].includes(value) ? value : null; }
function failureReason(stderr, spawnError) {
  if (spawnError) return spawnError.code === 'ENOENT' ? 'ffmpeg_binary_missing' : 'ffmpeg_spawn_failed';
  if (/Stream specifier.*matches no streams/s.test(stderr)) return 'missing_input_stream';
  if (/Unknown encoder|Encoder.*not found/i.test(stderr)) return 'encoder_unavailable';
  if (/No such filter.*ass|No such filter.*subtitles/i.test(stderr)) return 'subtitle_filter_unavailable';
  if (/Cannot allocate memory|Out of memory/i.test(stderr)) return 'memory_exhausted';
  if (/No space left on device/i.test(stderr)) return 'scratch_disk_full';
  if (/Permission denied/i.test(stderr)) return 'permission_denied';
  return 'ffmpeg_failed';
}
function logExportFailure({ jobId, stage, error, exitCode, signal, reason }) {
  console.error('Export diagnostic', {
    jobId: typeof jobId === 'string' && /^[0-9a-f-]{36}$/i.test(jobId) ? jobId : null, stage, reason: reason || stage + '_failed',
    exitCode: Number.isInteger(exitCode) ? exitCode : null,
    signal: safeSignal(signal), errorCode: safeCode(error?.code),
    httpStatus: Number.isInteger(error?.$metadata?.httpStatusCode) ? error.$metadata.httpStatusCode : null,
  });
}
module.exports = { failureReason, logExportFailure };
