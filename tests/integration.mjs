import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {authSecret, randomSalt, vaultKey, encrypt, decrypt} from '../public/crypto.js';
const dir=mkdtempSync(join(tmpdir(),'health-test-'));
const origin='http://127.0.0.1:18081';
let server, cookie, key, auth, initial, registered;
async function request(path,body,session=cookie,requestOrigin=origin){
 const res=await fetch(origin+'/api/'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',Origin:requestOrigin}:{}),...(session?{Cookie:session}:{})},body:body?JSON.stringify(body):undefined});
 return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
}
before(async()=>{
 server=spawn('python3',['server.py'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,PORT:'18081',FLESH_ALLOW_REGISTRATION:'true',APP_ORIGIN:origin,DATABASE_PATH:join(dir,'db.sqlite')}});
 for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,30));}
 throw new Error('Server did not start');
});
after(()=>{server?.kill();rmSync(dir,{recursive:true,force:true});});
test('register, authenticate, encrypt, persist, isolate and reject conflicts',async()=>{
 const salt=randomSalt(), password='a very strong test password';
 auth=await authSecret('alice',password);key=await vaultKey(password,salt);
 initial={version:1,conditions:[{id:'private',name:'SECRET_MIGRAINE_8492'}],pain:[],meds:[],intakes:[],cycles:[]};
 registered=await request('register',{username:'alice',auth,keySalt:salt,vault:await encrypt(key,initial)},null);
 assert.equal(registered.status,200);cookie=registered.cookie;assert.ok(cookie);
 assert.deepEqual(await decrypt(key,registered.body.vault),initial);
 assert.equal((await request('vault',undefined,null)).status,401);
 assert.equal((await request('vault',{revision:1,vault:registered.body.vault},cookie,'https://evil.test')).status,403);
 const changed={...initial,pain:[{id:'one',conditionId:'private',level:7}]};
 const envelope=await encrypt(key,changed);
 assert.equal((await request('vault',{revision:1,vault:envelope})).body.revision,2);
 assert.equal((await request('vault',{revision:1,vault:registered.body.vault})).status,409);
 assert.equal((await request('vault',{revision:2,vault:{version:1,iv:'bad',ciphertext:'bad'}})).status,400);
 const persisted=await request('vault');
 assert.deepEqual(await decrypt(key,persisted.body.vault),changed);
 const database=execFileSync('python3',['-c','import sqlite3,sys,json; c=sqlite3.connect(sys.argv[1]); print(json.dumps(c.execute("SELECT username,key_salt,vault FROM users").fetchall()))',join(dir,'db.sqlite')]).toString();
 assert.ok(!database.includes('SECRET_MIGRAINE_8492'));assert.ok(!database.includes(password));assert.ok(!database.includes(auth));
 const bad=await request('login',{username:'alice',auth:await authSecret('alice','a different wrong password')},null);assert.equal(bad.status,401);
 const login=await request('login',{username:'alice',auth},null);assert.equal(login.status,200);
 const secondKey=await vaultKey(password,login.body.keySalt);assert.deepEqual(await decrypt(secondKey,login.body.vault),changed);
 const bobKey=await vaultKey('another secure password',salt);
 const bob=await request('register',{username:'bob',auth:await authSecret('bob','another secure password'),keySalt:salt,vault:await encrypt(bobKey,{empty:true})},null);
 assert.equal(bob.status,200);assert.deepEqual(await decrypt(bobKey,(await request('vault',undefined,bob.cookie)).body.vault),{empty:true});
 await request('logout',{},cookie);assert.equal((await request('vault',undefined,cookie)).status,401);
});
test('authenticated encryption rejects wrong password and tampered data',async()=>{
 const salt=randomSalt();const k=await vaultKey('strong encryption password',salt);
 const v=await encrypt(k,{secret:'personal health data'});
 assert.notEqual((await encrypt(k,{secret:'personal health data'})).iv,v.iv);
 const wrong=await vaultKey('wrong encryption password',salt);
 await assert.rejects(()=>decrypt(wrong,v));
 const bytes=Buffer.from(v.ciphertext,'base64');bytes[0]^=1;
 await assert.rejects(()=>decrypt(k,{...v,ciphertext:bytes.toString('base64')}));
});
test('session cookie and headers protect account data',async()=>{
 const response=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'alice',auth})});
 assert.match(response.headers.get('set-cookie'),/HttpOnly/);assert.match(response.headers.get('set-cookie'),/SameSite=Strict/);
 assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('PWA and Apple touch icons are publicly served with their declared PNG dimensions',async()=>{
 const response=await fetch(origin+'/manifest.webmanifest');
 assert.equal(response.status,200);
 const manifest=await response.json();
 assert.ok(manifest.icons.some(icon=>icon.purpose==='maskable'));
 assert.ok(manifest.icons.some(icon=>icon.sizes==='192x192'));
 assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'));
 for(const icon of [...manifest.icons,{src:'/apple-touch-icon.png?v=muscle-1',sizes:'180x180'},{src:'/favicon.png?v=muscle-1',sizes:'64x64'}]){
  const res=await fetch(origin+icon.src);
  assert.equal(res.status,200,icon.src);
  assert.match(res.headers.get('content-type'),/image\/png/);
  const bytes=Buffer.from(await res.arrayBuffer());
  assert.equal(bytes.subarray(1,4).toString(),'PNG');
  assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`,icon.sizes);
 }
 const html=await (await fetch(origin+'/')).text();
 assert.match(html,/rel="apple-touch-icon"/);
});
test('default registration policy allows only one concurrent first account and preserves login across restart',async()=>{
 const policyOrigin='http://127.0.0.1:18086';
 const database=join(dir,'registration.sqlite');
 let process;
 async function start(allow){
  const env={...globalThis.process.env,FLESH_PORT:'18086',FLESH_BIND:'127.0.0.1',DATABASE_PATH:database};
  delete env.PORT;delete env.BIND;delete env.APP_ORIGIN;delete env.FLESH_ALLOW_REGISTRATION;
  if(allow!==undefined)env.FLESH_ALLOW_REGISTRATION=allow;
  process=spawn('python3',['server.py'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env});
  for(let i=0;i<100;i++){try{if((await fetch(policyOrigin+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,30));}
  throw new Error('Registration-policy server did not start');
 }
 async function stop(){
  if(process&&process.exitCode===null){const exited=new Promise(resolve=>process.once('exit',resolve));process.kill();await exited;}
 }
 async function post(path,body){
  const res=await fetch(policyOrigin+'/api/'+path,{method:'POST',headers:{Origin:'http://localhost:18086','Content-Type':'application/json'},body:JSON.stringify(body)});
  return {status:res.status,body:await res.json()};
 }
 const auth=Buffer.alloc(32,7).toString('base64');
 const envelope=await encrypt(await vaultKey('synthetic registration password',randomSalt()),{empty:true});
 const registration=username=>({username,auth,keySalt:randomSalt(),vault:envelope});
 try{
  await start(); // Unset registration flag must default to false.
  const contenders=['first-user','second-user'];
  const responses=await Promise.all(contenders.map(name=>post('register',registration(name))));
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,403]);
  const winner=contenders[responses.findIndex(r=>r.status===200)];
  assert.equal((await post('login',{username:winner,auth})).status,200);
  await stop();await start('false');
  assert.equal((await post('register',registration('third-user'))).status,403);
  assert.equal((await post('login',{username:winner,auth})).status,200);
  await stop();await start('true');
  assert.equal((await post('register',registration('third-user'))).status,200);
  assert.equal((await post('register',registration('fourth-user'))).status,200);
 }finally{await stop();}
});
