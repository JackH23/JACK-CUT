const fs=require('fs'),path=require('path'),cp=require('child_process');const dir=path.resolve(process.env.EXPORT_BENCHMARK_DIR || path.join(require('os').tmpdir(),'jackcut-export-benchmark'));
const pairs=[...['fade-in','zoom-in','slide-right','large'].map(name=>['before','verified',name]),...['fade0','fade1','fade25','fade50','fade75','fade100','legacy','transformed','overlap','video','fx'].map(name=>['matrix-before','matrix-after',name]),['long-before','long-after','mixed-600']];
const results=[];
for(const [before,after,name] of pairs){if(process.argv.includes('--short') && name==='mixed-600')continue;const a=dir+'/'+before+'-'+name+'.mp4',b=dir+'/'+after+'-'+name+'.mp4';if(!fs.existsSync(a)||!fs.existsSync(b)){const row={name,before,after,identical:false,missing:true};results.push(row);console.log(JSON.stringify(row));continue;}
 const metadata=file=>{const r=cp.spawnSync(process.env.FFPROBE_PATH || 'ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=nb_frames,width,height,r_frame_rate:format=duration','-of','json',file],{encoding:'utf8'});if(r.status)throw Error(r.stderr);return JSON.parse(r.stdout);};
 const beforeMetadata=metadata(a),afterMetadata=metadata(b);const metadataMatched=JSON.stringify(beforeMetadata)===JSON.stringify(afterMetadata);
 const run=cp.spawnSync(process.env.FFMPEG_PATH || 'ffmpeg',['-hide_banner','-i',a,'-i',b,'-lavfi','psnr','-an','-f','null','-'],{encoding:'utf8',maxBuffer:1000000});
 const psnr=run.stderr.match(/PSNR[^\r\n]*/)?.[0];const row={name,before,after,identical:metadataMatched && psnr?.includes('average:inf'),metadataMatched,psnr,status:run.status};results.push(row);console.log(JSON.stringify(row));
}
fs.writeFileSync(dir+'/frame-comparisons.json',JSON.stringify(results,null,2));
if(results.some(r=>!r.identical||r.status))process.exitCode=1;
