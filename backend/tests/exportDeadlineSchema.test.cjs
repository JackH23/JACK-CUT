const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertExportDeadlineSchema } = require('../utils/exportDeadlineSchema');
for (const type of ['TIMESTAMP WITH TIME ZONE','TIMESTAMPTZ']) test('deadline startup schema accepts '+type, () => {
 assert.doesNotThrow(() => assertExportDeadlineSchema({deadline_at:{type,allowNull:true,defaultValue:null}}));
});
for (const [name,column] of [
 ['missing',undefined],['text',{type:'TEXT',allowNull:true}],
 ['without time zone',{type:'TIMESTAMP WITHOUT TIME ZONE',allowNull:true}],
 ['not nullable',{type:'TIMESTAMP WITH TIME ZONE',allowNull:false}],
 ['unexpected default',{type:'TIMESTAMP WITH TIME ZONE',allowNull:true,defaultValue:'now()'}]
]) test('deadline startup rejects '+name+' without changing schema', () => {
 assert.throws(() => assertExportDeadlineSchema({deadline_at:column}), /explicit export deadline migration/);
});

test('actual ExportJob model uses nullable PostgreSQL timestamptz without a default offline',async()=>{
 const fs=require('fs'),path=require('path'),vm=require('vm'),{Sequelize,DataTypes}=require('sequelize');
 const db=new Sequelize('fixture','fixture','fixture',{dialect:'postgres',logging:false});const loaded={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../models/ExportJob.js'),'utf8'),{require:name=>name==='sequelize'?{DataTypes}:name==='../config/database'?db:require(name),module:loaded,exports:loaded.exports});
 try{const field=loaded.exports.rawAttributes.deadline_at;assert.equal(field.type.toSql(),'TIMESTAMP WITH TIME ZONE');assert.equal(field.allowNull,true);assert.equal(field.defaultValue,undefined);assert.equal(loaded.exports.getTableName(),'export_jobs');}finally{await db.close();}
});
