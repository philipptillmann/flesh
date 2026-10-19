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
 server=spawn('python3',['server.py'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,PORT:'18081',APP_ORIGIN:origin,DATABASE_PATH:join(dir,'db.sqlite')}});
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
