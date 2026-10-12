type Entry = Record<string, unknown>;
let enabled = false;
let entries: Entry[] = [];
const offsets = new WeakMap<HTMLMediaElement, { offset: number; label: string }>();
export function labelPlaybackMedia(media: HTMLMediaElement, offset: number, label: string) { offsets.set(media, { offset, label }); }
export function tracePlayback(event: string, data: Entry = {}) {
  if (enabled) entries.push({ at: new Date().toISOString(), ms: performance.now(), event, ...data });
}
export function mediaSnapshot(media: HTMLMediaElement, offset = offsets.get(media)?.offset ?? 0) {
  let ahead = 0;
  if (media.buffered) for (let i = 0; i < media.buffered.length; i++) {
    if (media.currentTime >= media.buffered.start(i) && media.currentTime <= media.buffered.end(i)) ahead = media.buffered.end(i) - media.currentTime;
  }
  return { trackLabel: offsets.get(media)?.label, currentTime: media.currentTime, timelineTime: media.currentTime - offset, readyState: media.readyState, ahead, seeking: media.seeking, paused: media.paused, error: media.error?.code ?? null };
}
export function installPlaybackTrace(timeline: () => number) {
  if (process.env.NODE_ENV !== 'development' || !new URLSearchParams(location.search).has('playbackTrace')) return () => {};
  enabled = true; entries = [];
  const panel = document.createElement('details');
  panel.style.cssText = 'position:fixed;bottom:0;left:0;z-index:9999;background:#000;color:#fff;font-size:11px;max-height:200px;overflow:auto;width:100%';
  panel.innerHTML = '<summary>Playback trace (local diagnostics)</summary><pre data-playback-trace></pre>';
  document.body.append(panel);
  const seen = new Map<HTMLMediaElement, () => void>();
  const source = (media: HTMLMediaElement) => { const url = new URL(media.currentSrc || media.src, location.href); return url.origin + url.pathname; };
  const attach = () => document.querySelectorAll<HTMLMediaElement>('video,audio').forEach(media => {
    if (seen.has(media)) return;
    const thumbnail = media.className.includes('object-cover');
    const events = ['loadstart','waiting','playing','pause','seeking','seeked','canplay','loadedmetadata','stalled','error','ended'];
    const listener = (event: Event) => tracePlayback('media:'+event.type,{thumbnail,tag:media.tagName,source:source(media),timeline:timeline(),...mediaSnapshot(media)});
    events.forEach(name => media.addEventListener(name, listener));
    seen.set(media, () => events.forEach(name => media.removeEventListener(name, listener)));
  });
  attach(); const observer = new MutationObserver(attach); observer.observe(document.body,{childList:true,subtree:true});
  const resources = new PerformanceObserver(list => list.getEntries().forEach(entry => {
    const resource = entry as PerformanceResourceTiming, url = new URL(entry.name, location.href);
    if (url.pathname.startsWith('/api/')) tracePlayback('request',{source:url.origin+url.pathname,startMs:resource.startTime,durationMs:resource.duration,status:resource.responseStatus || 'opaque',bytes:resource.transferSize});
  })); resources.observe({type:'resource',buffered:true});
  const timer = setInterval(() => {
    document.querySelectorAll<HTMLMediaElement>('video,audio').forEach(media => {if(!media.className.includes('object-cover'))tracePlayback('sample',{tag:media.tagName,source:source(media),timeline:timeline(),...mediaSnapshot(media)});});
    if(entries.length>20000)entries=entries.slice(-20000);
    panel.querySelector('pre')!.textContent=JSON.stringify(entries);
  },250);
  tracePlayback('trace:start');
  return () => { clearInterval(timer); observer.disconnect();resources.disconnect();seen.forEach(remove=>remove());panel.remove();enabled=false; };
}
