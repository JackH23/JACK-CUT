/* Offline, allowlisted staging context. No image build, network or secrets. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),dir=path.join(__dirname,'results','staging-source-'+Date.now());fs.mkdirSync(dir);
const context=path.join(dir,'context');fs.mkdirSync(context);
const entries=[],hash=b=>createHash('sha256').update(b).digest('hex');
function copy(relative){
 assert(!relative.split('/').some(p=>p.startsWith('.')&&p!=='.dockerignore'));
 assert(!/\.(pem|key|p12)$/i.test(relative));
 const source=path.join(root,relative);assert(fs.lstatSync(source).isFile(),'No symlinks/directories');
 const bytes=fs.readFileSync(source),dest=path.join(context,relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes,{flag:'wx'});entries.push({path:relative,sha256:hash(bytes),bytes:bytes.length});
}
for(const file of ['.dockerignore','backend/Dockerfile','backend/package.json','backend/package-lock.json','backend/server.js','backend/scripts/exportCleanup.js','frontend/lib/textLayout.json','frontend/lib/mediaAnimation.js','frontend/lib/textAnimation.js'])copy(file);
for(const folder of ['config','controllers','middleware','models','routes','services','utils']){
 function walk(relative){for(const e of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){assert(!e.isSymbolicLink());const f=relative+'/'+e.name;if(e.isDirectory())walk(f);else{assert(/\.(js|json)$/.test(e.name),'Review unexpected runtime asset before packaging: '+f);copy(f);}}}walk('backend/'+folder);
}
fs.mkdirSync(path.join(context,'operations'));const migration='backend/scripts/migrations/20261010-export-jobs-cancelled.sql';
const bytes=fs.readFileSync(path.join(root,migration));fs.writeFileSync(path.join(context,'operations','20261010-export-jobs-cancelled.sql'),bytes,{flag:'wx'});entries.push({path:'operations/20261010-export-jobs-cancelled.sql',sourcePath:migration,sha256:hash(bytes),bytes:bytes.length});
const manifest={preparedAt:new Date().toISOString(),baseCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),branch:execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim(),includesUncommittedSource:true,files:entries.sort((a,b)=>a.path.localeCompare(b.path))};assert.equal(manifest.branch,'Jack');
fs.writeFileSync(path.join(context,'SOURCE_MANIFEST.json'),JSON.stringify(manifest,null,2));
fs.writeFileSync(path.join(context,'operations','verifySource.cjs'),`const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');const root=path.resolve(__dirname,'..');const m=JSON.parse(fs.readFileSync(path.join(root,'SOURCE_MANIFEST.json')));for(const f of m.files)assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,f.path))).digest('hex'),f.sha256,f.path);console.log('PASS: '+m.files.length+' exact source files');`);
fs.writeFileSync(path.join(context,'operations','verifyImage.cjs'),`const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');const m=JSON.parse(fs.readFileSync('/inspection/SOURCE_MANIFEST.json'));let count=0;for(const f of m.files){if(!f.path.startsWith('backend/')&&!f.path.startsWith('frontend/'))continue;if(f.path==='backend/Dockerfile')continue;assert.equal(createHash('sha256').update(fs.readFileSync('/app/'+f.path)).digest('hex'),f.sha256,f.path);count++;}console.log('PASS: '+count+' runtime files match tested source');`);
execFileSync(process.execPath,['operations/verifySource.cjs'],{cwd:context,stdio:'inherit'});
const archive=path.join(dir,'jackcut-staging-source.tar.gz');execFileSync('tar.exe',['-czf',archive,'-C',context,'.']);
const result={dir,context,archive,archiveSha256:hash(fs.readFileSync(archive)),manifestSha256:hash(fs.readFileSync(path.join(context,'SOURCE_MANIFEST.json'))),files:entries.length,baseCommit:manifest.baseCommit,imageBuilt:false,remoteChanges:false};fs.writeFileSync(path.join(dir,'artifact.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
