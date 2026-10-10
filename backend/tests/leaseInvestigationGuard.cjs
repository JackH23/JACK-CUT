// Read-only investigation runner guard: explicit native-render skips and no subprocesses.
const test=require('node:test');const original=test.test;
const native=/^real FFmpeg|^a rejected SIGTERM escalates|^real controller exports image storytelling/;
test.test=function(name,options,fn){if(native.test(name)){if(typeof options==='function')return original(name,{skip:'Native render disabled for lease investigation'},options);return original(name,{...options,skip:'Native render disabled for lease investigation'},fn);}return original(name,options,fn);};
const child=require('node:child_process');for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])child[key]=()=>{throw Error('Native process launch blocked during lease investigation');};
