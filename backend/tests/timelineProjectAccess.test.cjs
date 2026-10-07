const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const express=require('express');
const project='66ec12e5-244b-43e2-b36e-57bec761ade8',item='77ec12e5-244b-43e2-b36e-57bec761ade8',other='88ec12e5-244b-43e2-b36e-57bec761ade8';
function load(file,deps){const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{module,require:name=>{assert(name in deps,name);return deps[name];}});return module.exports;}
async function harness(user){
 const accessed=[];
 const access=load('middleware/projectAccess.js',{'../models/Project':{findOne:async({where})=>{accessed.push(where);return where.id===project&&where.user_id==='owner'?{id:project}:null;}},'../models/TimelineItem':{findByPk:async id=>id===item?{project_id:project}:null},'../models/ProjectMedia':{}});
 const route=load('routes/timelineRoutes.js',{express,'../middleware/authMiddleware':(req,res,next)=>{req.user={id:user};next();},'../middleware/projectAccess':access,'../controllers/timelineController':{deleteTimelineItem:(req,res)=>res.json({deleted:req.params.id}),updateTimelineItem:(req,res)=>res.json({updated:req.params.id}),getTimelineItems:(req,res)=>res.json({}),addTimelineItem:(req,res)=>res.json({}),getTimelineDuration:(req,res)=>res.json({})}});
 const app=express();app.use(express.json());app.use('/api/timeline',route);const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 return {base:'http://127.0.0.1:'+server.address().port,accessed,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
test('DELETE/PATCH route ownership uses the stored item project despite a forged project query',async()=>{
 const h=await harness('owner');try{for(const method of ['DELETE','PATCH']){const response=await fetch(h.base+'/api/timeline/items/'+item+'?projectId='+other,{method});assert.equal(response.status,200);assert.equal(h.accessed.at(-1).id,project);}}finally{await h.close();}
});
test('non-owners cannot mutate an item by supplying a project ID',async()=>{
 const h=await harness('stranger');try{for(const method of ['DELETE','PATCH']){const response=await fetch(h.base+'/api/timeline/items/'+item+'?projectId='+other,{method});assert.equal(response.status,404);}}finally{await h.close();}
});
test('project-scoped creation still requires a valid project ID',async()=>{
 const h=await harness('owner');try{const response=await fetch(h.base+'/api/timeline/items',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,400);assert.equal((await response.json()).message,'Valid projectId is required.');}finally{await h.close();}
});
