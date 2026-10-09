const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function config(env={}) {
 let captured;
 class Sequelize { constructor(...args){captured=args.at(-1);} }
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../config/database.js'),'utf8'),{
  require:name=>name==='sequelize'?{Sequelize}:require(name),process:{env:{NODE_ENV:'development',...env}},module:{exports:{}}
 });
 return captured;
}
test('all pooled PostgreSQL connections bound SQL locks and statements without limiting download transactions',()=>{
 for(const env of [{},{NODE_ENV:'production',DATABASE_URL:'postgres://fixture.invalid/staging'}]){
  const c=config(env);assert.equal(c.dialectOptions.lock_timeout,5000);assert.equal(c.dialectOptions.statement_timeout,30000);
  assert.equal(c.dialectOptions.connectionTimeoutMillis,10000);assert.equal(c.pool.acquire,15000);
  assert.equal(c.dialectOptions.idle_in_transaction_session_timeout,undefined);
  assert.equal(c.dialectOptions.query_timeout,undefined);
 }
});
test('database budgets accept positive integer overrides and fail closed for invalid or inverted limits',()=>{
 const c=config({DB_LOCK_TIMEOUT_MS:'40',DB_STATEMENT_TIMEOUT_MS:'120'});
 assert.equal(c.dialectOptions.lock_timeout,40);assert.equal(c.dialectOptions.statement_timeout,120);
 for(const env of [{DB_LOCK_TIMEOUT_MS:'0'},{DB_STATEMENT_TIMEOUT_MS:'NaN'},{DB_LOCK_TIMEOUT_MS:'1.5'},{DB_LOCK_TIMEOUT_MS:'30001'}])assert.throws(()=>config(env));
});
