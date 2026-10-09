const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync,spawnSync}=require('node:child_process');
const run=path.resolve(process.argv[2]);assert.equal(path.dirname(run),path.join(__dirname,'results'));assert(path.basename(run).startsWith('predeploy_'));
const evidence=JSON.parse(fs.readFileSync(path.join(run,'evidence.json'))),story=evidence.scenarios.find(s=>s.label.startsWith('B '));assert(story);
const dir=path.join(run,'visual-'+Date.now());fs.mkdirSync(dir);
fs.copyFileSync(story.validation.file,path.join(dir,'current.mp4'),fs.constants.COPYFILE_EXCL);
fs.copyFileSync(path.join(__dirname,'results','optimized-command.json'),path.join(dir,'current-command.json'),fs.constants.COPYFILE_EXCL);
const ffmpeg=process.env.FFMPEG_PATH||'ffmpeg',probe=process.env.FFPROBE_PATH||'ffprobe';
// Reuse the existing strict scene/pixel/decode checker without invoking its fixed-output main.
const source=fs.readFileSync(path.join(__dirname,'verifyStorytelling.cjs'),'utf8');
const check=new Function('fs','path','spawnSync','execFileSync','dir','ffmpeg','probe',source.slice(source.indexOf('function check('),source.indexOf('const result={baseline:'))+'return check;')(fs,path,spawnSync,execFileSync,dir,ffmpeg,probe);
const result={current:check('current'),historicalReference:path.join(__dirname,'results','baseline.mp4')};
const comparison=spawnSync(ffmpeg,['-threads','1','-v','info','-i',result.historicalReference,'-threads','1','-i',story.validation.file,'-filter_complex_threads','1','-lavfi','[0:v][1:v]ssim=stats_file=ssim.log','-f','null','-'],{cwd:dir,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});assert.equal(comparison.status,0,comparison.stderr);
const frames=fs.readFileSync(path.join(dir,'ssim.log'),'utf8').trim().split('\n').map(line=>Number(line.match(/All:([\d.]+)/)[1]));
result.minimumFrameSSIM=Math.min(...frames);result.meanFrameSSIM=frames.reduce((a,b)=>a+b,0)/frames.length;result.comparedFrames=frames.length;
assert.equal(frames.length,1800);assert(result.minimumFrameSSIM>=.97,'Animations/quality diverged from historical reference');
fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({dir,...result},null,2));
