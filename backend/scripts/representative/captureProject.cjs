// Authorized GET requests only. Tokens remain in memory and are never persisted.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const fields = { id:'id', projectId:'project_id', itemType:'item_type', mediaId:'media_id',
  textContent:'text_content', textStyle:'text_style', textX:'text_x', textY:'text_y',
  fontSize:'font_size', fontWeight:'font_weight', fontFamily:'font_family', textColor:'text_color',
  mediaScale:'media_scale', mediaX:'media_x', mediaY:'media_y', effectPreset:'effect_preset',
  animationInPreset:'animation_in_preset', animationInDuration:'animation_in_duration', animationInAmount:'animation_in_amount',
  animationOutPreset:'animation_out_preset', animationOutDuration:'animation_out_duration', animationOutAmount:'animation_out_amount',
  animationPreset:'animation_preset', animationAmount:'animation_amount', trackId:'track_id',
  startTime:'start_time', duration:'duration', sourceStart:'source_start' };
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
function timelineRows(data, projectId) {
  if (!Array.isArray(data.items) || data.total !== data.items.length) throw Error('Incomplete timeline response');
  return data.items.map(item => {
    if (!uuid(item.id) || item.projectId !== projectId || !['MEDIA','TEXT'].includes(item.itemType)) throw Error('Invalid timeline ownership or item');
    if (!Number.isFinite(Number(item.startTime)) || Number(item.startTime)<0 || !(Number(item.duration)>0)) throw Error('Invalid clip timing');
    for (const key of ['animationInPreset','animationInDuration','animationInAmount','animationOutPreset','animationOutDuration','animationOutAmount']) {
      if (!(key in item)) throw Error('Application response lacks saved animation fields');
    }
    return Object.fromEntries(Object.entries(fields).map(([api,db])=>[db,item[api] ?? null]));
  });
}
async function capture({ apiOrigin, projectId, jobId, directory, token, fetchImpl=fetch }) {
  const origin = new URL(apiOrigin);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw Error('Use a credential-free API origin');
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost','127.0.0.1'].includes(origin.hostname))) throw Error('HTTPS required for application access');
  if (!uuid(projectId) || !uuid(jobId) || !token) throw Error('Project/job IDs and an existing authorized session token are required');
  const destination = path.resolve(directory);
  fs.mkdirSync(path.dirname(destination), { recursive:true, mode:0o700 });
  fs.mkdirSync(destination, { mode:0o700 }); // Never overwrite a previous capture.
  fs.mkdirSync(path.join(destination,'assets'), { mode:0o700 });
  const get = async route => {
    const response = await fetchImpl(new URL(route,origin), { method:'GET', redirect:'error', headers:{ Authorization:'Bearer '+token } });
    if (!response.ok) throw Error('Authorized application GET failed: HTTP '+response.status);
    return response;
  };
  const json = async route => (await get(route)).json();
  const project = await json('/api/projects/'+projectId);
  if (project.project?.id !== projectId) throw Error('Project identity mismatch');
  const job = await json('/api/exports/'+jobId);
  if (job.id !== jobId) throw Error('Export job identity mismatch');
  const rows = timelineRows(await json('/api/timeline/items?projectId='+projectId),projectId);
  if (!rows.length) throw Error('Timeline is empty');
  const mediaResponse = await json('/api/media?projectId='+projectId);
  if (!Array.isArray(mediaResponse.media)) throw Error('Invalid media response');
  const mediaById = new Map(mediaResponse.media.map(m=>[m.id,m]));
  const ids = [...new Set(rows.filter(i=>i.item_type==='MEDIA').map(i=>i.media_id))];
  const assets = [];
  const started=Date.now();
  for (const id of ids) {
    const m=mediaById.get(id);
    if (!uuid(id) || !m || !['image','video','audio'].includes(m.type)) throw Error('Referenced project media is missing');
    const extension = { 'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/gif':'.gif','image/heic':'.heic',
      'video/mp4':'.mp4','video/quicktime':'.mov','video/webm':'.webm','audio/mpeg':'.mp3','audio/wav':'.wav','audio/x-wav':'.wav','audio/mp4':'.m4a','audio/ogg':'.ogg' }[m.mimeType] || '.asset';
    const file='assets/'+id+extension;
    const response=await get('/api/media/'+id+'/content'); // Ignore signed URLs returned by the API.
    const hash=crypto.createHash('sha256');let bytes=0;
    const counter=new Transform({ transform(chunk,encoding,done){bytes+=chunk.length;hash.update(chunk);done(null,chunk);} });
    if (!response.body) throw Error('Empty media response');
    await pipeline(Readable.fromWeb(response.body),counter,fs.createWriteStream(path.join(destination,file),{flags:'wx',mode:0o600}));
    if (!bytes || (Number.isFinite(Number(m.size)) && Number(m.size)!==bytes)) throw Error('Downloaded media size mismatch');
    assets.push({id,media_type:m.type,mime_type:m.mimeType,duration_seconds:m.durationSeconds ?? null,file,bytes,sha256:hash.digest('hex')});
  }
  const reread=timelineRows(await json('/api/timeline/items?projectId='+projectId),projectId);
  if (JSON.stringify(rows)!==JSON.stringify(reread)) throw Error('Timeline changed during capture; discard this incomplete capture');
  const duplicateStarts=rows.some((row,index)=>rows.some((other,j)=>j<index && other.item_type===row.item_type && other.start_time===row.start_time));
  const snapshot={schemaVersion:1,projectId,jobId,capturedAt:new Date().toISOString(),apiOrigin:origin.origin,
    provenance:{access:'authorized-application-GET-only',projectJobAssociation:'user-supplied; public job API does not expose project_id',
      failureTimeSnapshotVerified:false,order:'timeline API start_time ASC, created_at ASC',renderTieOrderUnverified:duplicateStarts},
    observedJob:{id:job.id,status:job.status,progress:job.progress,stage:job.stage,
      metrics:Object.fromEntries(['renderSeconds','totalSeconds','fps','speed'].filter(k=>job.metrics?.[k]!=null).map(k=>[k,job.metrics[k]]))},
    captureDownloadSeconds:(Date.now()-started)/1000,items:rows,assets};
  const encoded=JSON.stringify(snapshot,null,2);
  fs.writeFileSync(path.join(destination,'snapshot.json'),encoded,{flag:'wx',mode:0o600});
  fs.writeFileSync(path.join(destination,'snapshot.sha256'),crypto.createHash('sha256').update(encoded).digest('hex')+'\n',{flag:'wx',mode:0o600});
  return {clipCount:rows.length,assetCount:assets.length,durationSeconds:Math.max(...rows.map(i=>Number(i.start_time)+Number(i.duration)))};
}
module.exports={capture,timelineRows};
if(require.main===module){
  const [apiOrigin,projectId,jobId,directory]=process.argv.slice(2);
  capture({apiOrigin,projectId,jobId,directory,token:process.env.JACKCUT_BENCHMARK_ACCESS_TOKEN})
    .then(summary=>console.log(JSON.stringify({captured:true,...summary})))
    .catch(error=>{console.error(error.message);process.exitCode=1;});
}
