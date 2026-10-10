const expected = Object.freeze({
 STAGING_NEON_PROJECT:'jackcut', STAGING_NEON_BRANCH:'staging-deadline-test',
 STAGING_NEON_BRANCH_ID:'br-fancy-meadow-b5getd25',
 STAGING_EXPECTED_HOST:'ep-broad-grass-b53e1v66.c-7.us-east-2.aws.neon.tech',
 STAGING_EXPECTED_DATABASE:'neondb', STAGING_EXPECTED_ROLE:'neondb_owner'
});
function validateStagingEnvironment(values) {
 for(const [key,value] of Object.entries(expected)) if(values[key]!==value) throw Error('Staging identity metadata does not match the confirmed Neon branch.');
 if(!values.DATABASE_URL) throw Error('Staging DATABASE_URL is missing; fill the ignored staging file locally.');
 let url;try{url=new URL(values.DATABASE_URL);}catch{throw Error('Staging DATABASE_URL is invalid.');}
 let role,database;try{role=decodeURIComponent(url.username);database=decodeURIComponent(url.pathname.slice(1));}catch{throw Error('Staging connection identifiers are invalid.');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!==expected.STAGING_EXPECTED_HOST||
    database!==expected.STAGING_EXPECTED_DATABASE||role!==expected.STAGING_EXPECTED_ROLE||!url.password||
    (url.port&&url.port!=='5432')||url.hash||!['require','verify-full'].includes(url.searchParams.get('sslmode')))
  throw Error('Staging URL must use the confirmed direct endpoint, database, role and TLS. Database access blocked.');
 // libpq connection overrides must not redirect a validated URL to another host.
 const allowed=new Set(['sslmode','channel_binding']);
 for(const key of url.searchParams.keys()) if(!allowed.has(key)||url.searchParams.getAll(key).length!==1) throw Error('Unapproved staging connection option.');
 return { connectionString:values.DATABASE_URL, hostname:url.hostname, branch:expected.STAGING_NEON_BRANCH, branchId:expected.STAGING_NEON_BRANCH_ID };
}
module.exports={validateStagingEnvironment};
