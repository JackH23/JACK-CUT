// Configuration validation only: never loads backend/.env, starts the server or opens a database.
const fs=require('fs'),path=require('path'),dotenv=require('dotenv');
const {validateStagingEnvironment}=require('../utils/stagingEnvironment');
try {
 const file=path.resolve(__dirname,'../.env.staging.local');
 const config=validateStagingEnvironment(dotenv.parse(fs.readFileSync(file)));
 console.log(JSON.stringify({status:'configuration_valid',hostname:config.hostname,branch:config.branch,branchId:config.branchId,databaseConnected:false,identityBasis:'user-confirmed Neon endpoint mapping'}));
} catch(error) {
 // Never print URLs, parser errors, filesystem contents, credentials or stacks.
 console.error('Staging configuration is incomplete or invalid. Database access blocked.');process.exitCode=1;
}
