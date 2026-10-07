const test=require('node:test'),assert=require('node:assert/strict');
const {readFontFaces,getAssFontMetrics}=require('../utils/textFontMetrics');
test('ASS font conversion reads deterministic EM and ascender/descender metrics',()=>{
 const b=Buffer.alloc(400);b.writeUInt16BE(4,4);const sections={head:100,hhea:130,'OS/2':150,name:250};Object.entries(sections).forEach(([name,offset],i)=>{b.write(name,12+i*16,'ascii');b.writeUInt32BE(offset,20+i*16)});b.writeUInt16BE(2048,118);b.writeInt16BE(1854,134);b.writeInt16BE(-434,136);b.writeUInt16BE(4,150);b.writeUInt16BE(700,154);b.writeUInt16BE(1,252);b.writeUInt16BE(18,254);b.writeUInt16BE(3,256);b.writeUInt16BE(1,262);const name=Buffer.from('Test Family','utf16le').swap16();b.writeUInt16BE(name.length,264);name.copy(b,268);const [face]=readFontFaces(b);assert.deepEqual(face.families,['test family']);assert.equal(face.weight,700);assert.equal(face.ratio,1.1171875);
});
test('CSS 600 selects installed bold weight and font metric cache is deterministic',()=>{const a=getAssFontMetrics('Arial',600),b=getAssFontMetrics('Arial',600);assert.equal(a.weight,700);assert.deepEqual(a,b);assert.ok(a.ratio>0);assert.equal(getAssFontMetrics('Arial',400).weight,400);});


test('Linux font metrics follow Fontconfig substitutions and cache each family/weight',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 const font=Buffer.alloc(400);font.writeUInt16BE(4,4);
 const sections={head:100,hhea:130,'OS/2':150,name:250};Object.entries(sections).forEach(([name,offset],i)=>{font.write(name,12+i*16,'ascii');font.writeUInt32BE(offset,20+i*16)});
 font.writeUInt16BE(2048,118);font.writeInt16BE(1854,134);font.writeInt16BE(-434,136);font.writeUInt16BE(4,150);font.writeUInt16BE(400,154);font.writeUInt16BE(1,252);font.writeUInt16BE(18,254);font.writeUInt16BE(3,256);font.writeUInt16BE(1,262);
 const name=Buffer.from('Inter','utf16le').swap16();font.writeUInt16BE(name.length,264);name.copy(font,268);
 const expected=readFontFaces(font)[0].ratio;
 const calls=[],module={exports:{}};
 const mockedFs={readdirSync:dir=>dir==='/usr/share/fonts'?[{name:'Inter-Regular.ttf',isDirectory:()=>false}]:[],readFileSync:()=>font};
 const load=name=>name==='node:fs'?mockedFs:name==='node:child_process'?{execFileSync:(command,args)=>{calls.push({command,args});return 'Inter';}}:require(name);
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../utils/textFontMetrics.js'),'utf8'),{require:load,module,Buffer,process:{platform:'linux',env:{}}});
 assert.equal(module.exports.getAssFontMetrics('Arial',400).ratio,expected);
 assert.equal(module.exports.getAssFontMetrics('Arial',400).ratio,expected);
 assert.equal(calls.length,1);assert.equal(calls[0].command,'fc-match');
 assert.equal(calls[0].args.at(-1),'arial:weight=regular');
 module.exports.getAssFontMetrics('Arial',700);assert.equal(calls.length,2);assert.equal(calls[1].args.at(-1),'arial:weight=bold');
});
test('Windows font lookup does not invoke Fontconfig',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),module={exports:{}};
 const load=name=>name==='node:fs'?{readdirSync:()=>[]}:name==='node:child_process'?{execFileSync:()=>assert.fail('Windows must not run fc-match')}:require(name);
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../utils/textFontMetrics.js'),'utf8'),{require:load,module,process:{platform:'win32',env:{}}});
 assert.equal(module.exports.getAssFontMetrics('Arial',400).ratio,1);
});
