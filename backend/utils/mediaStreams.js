const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
async function hasAudioStream(filePath) {
  const { stdout } = await run(process.env.FFPROBE_PATH || 'ffprobe', [
    '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'json', filePath,
  ], { timeout: 15000, maxBuffer: 256 * 1024, windowsHide: true });
  const result = JSON.parse(stdout);
  if (!Array.isArray(result.streams)) throw new Error('Invalid FFprobe stream response.');
  return result.streams.length > 0;
}
module.exports = { hasAudioStream };
