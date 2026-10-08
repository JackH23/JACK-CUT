const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {failureReason}=require('../utils/exportDiagnostics');
test('render diagnostics classify actionable failures without returning raw stderr',()=>{
 assert.equal(failureReason("Stream specifier ':a' matches no streams. secret https://private/",null),'missing_input_stream');
 assert.equal(failureReason('',{code:'ENOENT'}),'ffmpeg_binary_missing');
 assert.equal(failureReason('Unknown encoder',null),'encoder_unavailable');
 assert.equal(failureReason('No such filter ass',null),'subtitle_filter_unavailable');
 assert.equal(failureReason('Cannot allocate memory',null),'memory_exhausted');
 assert.equal(failureReason('No space left on device',null),'scratch_disk_full');
});
test('diagnostics never emit raw messages, stack, SQL, stderr or credential values',()=>{
 const logs=[],m={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../utils/exportDiagnostics.js'),'utf8'),{module:m,exports:m.exports,console:{error:(...a)=>logs.push(a)}});
 m.exports.logExportFailure({jobId:'test-job',stage:'persist_output',error:{code:'AccessDenied',message:'SECRET password token',stack:'SECRET',sql:'SECRET',$metadata:{httpStatusCode:403}},exitCode:0,signal:null});
 const output=JSON.stringify(logs); assert.ok(!output.includes('SECRET')); assert.match(output,/persist_output/); assert.match(output,/403/);
 m.exports.logExportFailure({jobId:'test-job',stage:'render',error:{code:'SECRET https://private/'},signal:'SECRET https://private/',exitCode:null});
 assert.ok(!JSON.stringify(logs).includes('SECRET'));
});
