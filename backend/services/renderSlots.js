// One render per small backend by default; each instance owns its own memory budget.
function createRenderSlots(limit = Number(process.env.EXPORT_MAX_CONCURRENT_RENDERS) || 1) {
  limit = Number.isFinite(Number(limit)) ? Math.max(1, Math.floor(Number(limit))) : 1;
  let active = 0;
  const waiting = [];
  function pump() {
    while (active < limit && waiting.length) {
      const entry = waiting.shift(); entry.signal?.removeEventListener('abort', entry.abort);
      if (entry.signal?.aborted) { entry.reject(new Error('Export stopped while waiting for a renderer.')); continue; }
      active++;
      let released = false;
      entry.resolve(() => { if (released) return; released = true; active--; pump(); });
    }
  }
  function acquire(signal) {
    return new Promise((resolve, reject) => {
      const entry = { signal, resolve, reject };
      entry.abort = () => { const i = waiting.indexOf(entry); if (i >= 0) waiting.splice(i, 1); reject(new Error('Export stopped while waiting for a renderer.')); };
      if (signal?.aborted) return entry.abort();
      signal?.addEventListener('abort', entry.abort, { once: true });
      waiting.push(entry); pump();
    });
  }
  return { acquire };
}
module.exports = { createRenderSlots, slots: createRenderSlots() };
