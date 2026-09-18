import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import vm from 'node:vm';
import ts from 'typescript';
const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('drizzle/0000_moaning_gunslinger.sql','utf8'));sql.exec(readFileSync('drizzle/0001_dazzling_pepper_potts.sql','utf8'));sql.exec('PRAGMA foreign_keys=ON');
function statement(query,args=[]){const stmt=sql.prepare(query);return {bind(...values){return statement(query,values)},async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},async run(){const r=stmt.run(...args);return {meta:{changes:Number(r.changes)}}}}}
const db={prepare:statement,async batch(stmts){sql.exec('BEGIN');try{const r=[];for(const s of stmts)r.push(await s.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
const identity=new AsyncLocalStorage();
function load(path,imports){const exports={};const js=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;vm.runInNewContext(js,{exports,require:id=>{if(!(id in imports))throw Error('Unexpected import '+id);return imports[id]},crypto,Response,Request,URL,Date,console,Uint32Array,Uint8Array,TextEncoder,Set,Error});return exports}
const words=JSON.parse(readFileSync('lib/dictionary.json','utf8'));
const engine=load('lib/word-engine.ts',{'./dictionary.json':words});
const guest=load('lib/guest-session.ts',{});
const api=load('app/api/game/route.ts',{'@/app/chatgpt-auth':{getChatGPTUser:async()=>identity.getStore()||null},'@/lib/guest-session':guest,'@/lib/database':{database:()=>db},'@/lib/word-engine':engine});
const users={a:{userId:'test-a',email:'a@example.test',fullName:'Alex'},b:{userId:'test-b',email:'b@example.test',fullName:'Blair'},c:{userId:'test-c',email:'c@example.test',fullName:'Casey'}};
const jars={};
async function request(user,body,room='',status=200,origin='https://wordmates.test'){
 const headers={'content-type':'application/json',origin,...(jars[user]?{cookie:jars[user]}:{})};
 const req=new Request('https://wordmates.test/api/game'+(room?'?room='+room:''),{headers,...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 const res=await identity.run(null,()=>body?api.POST(req):api.GET(req));
 if(res.headers.has('set-cookie')) { const cookie=res.headers.get('set-cookie'); assert(cookie.includes('HttpOnly; Secure; SameSite=Lax')); jars[user]=cookie.split(';')[0]; }
 const data=await res.json();assert.equal(res.status,status,JSON.stringify(data));return data;
}
const marks=(w,a)=>Array.from(engine.scoreGuess(w,a));
assert.deepEqual(marks('ALLEY','APPLE'),[2,1,0,1,0]);assert.deepEqual(marks('EERIE','SPEED'),[1,1,0,0,0]);assert.deepEqual(marks('APPLE','APPLE'),[2,2,2,2,2]);assert(!engine.isWord('ZZZZZ'));assert(engine.isWord('CRANE'));assert(engine.answers.every(w=>w.length===5));
assert.equal((await request(null)).user,null);await request(null,{action:'create'},'',401);
for(const user of ['a','b','c']) {await request(user,{action:'session'});await request(user,{action:'profile',name:users[user].fullName});}
assert.notEqual(jars.a,jars.b);
const a=await request('a'),b=await request('b');await request('c');assert.equal(a.daily.id,b.daily.id);assert(!('answer' in a.daily));assert.equal(a.user.name,'Alex');
await request('a',{action:'profile',name:'Ace'});assert.equal((await request('a')).user.name,'Ace');
await request('a',{action:'create'},'',403,'https://evil.test');
await request('a',{action:'addFriend',code:b.user.code});assert.equal((await request('a')).friends.length,0);assert.equal((await request('b')).requests.length,1);
await request('a',{action:'accept',friendId:b.user.id},'',400);await request('b',{action:'accept',friendId:a.user.id});assert.equal((await request('a')).friends[0].id,b.user.id);assert.equal((await request('b')).friends[0].id,a.user.id);
const {room}=await request('a',{action:'create'});await request('a',{action:'start',room},'',400);await request('c',null,room,403);await request('b',{action:'join',code:room});await request('b',{action:'start',room},'',403);await request('a',{action:'start',room});
const ra=await request('a',null,room),rb=await request('b',null,room);assert.equal(ra.room.game.id,rb.room.game.id);assert.equal(ra.room.status,'playing');await request('c',{action:'join',code:room},'',400);
const id=ra.room.game.id;await request('c',{action:'guess',word:'CRANE',gameId:id,version:0},'',403);await request('a',{action:'guess',word:'ZZZZZ',gameId:id,version:0},'',400);
const answer=sql.prepare('SELECT answer FROM games WHERE id=?').get(id).answer;const wrong=['CRANE','SLATE','BRICK','MOUND','FJORD','NYMPH','QUICK'].filter(w=>w!==answer).slice(0,6);
await request('a',{action:'guess',word:wrong[0],gameId:id,version:0});await request('a',{action:'guess',word:wrong[1],gameId:id,version:0},'',409);await request('a',{action:'guess',word:wrong[0],gameId:id,version:1},'',400);
const privateView=await request('b',null,room);assert.equal(privateView.room.game.rows.length,0);assert(!('answer' in privateView.room.game));assert(!JSON.stringify(privateView.room.players).includes(wrong[0]));assert.equal(privateView.room.players.find(p=>p.id===a.user.id).attempts,1);
await request('a',{action:'guess',word:answer,gameId:id,version:1});assert.equal((await request('a',null,room)).room.game.answer,answer);assert(!('answer' in (await request('b',null,room)).room.game));
for(let i=0;i<6;i++)await request('b',{action:'guess',word:wrong[i],gameId:id,version:i});await request('b',{action:'guess',word:answer,gameId:id,version:6},'',400);
const done=await request('a',null,room);assert.equal(done.room.status,'finished');assert.equal(done.room.players[0].id,a.user.id);assert.equal(done.stats.wins,1);assert.equal((await request('b',null,room)).stats.played,1);
await request('a',{action:'rematch',room});assert.equal((await request('a',null,room)).room.status,'waiting');await request('c',{action:'join',code:room});await request('a',{action:'start',room});const next=await request('a',null,room);assert.equal(next.room.round,2);assert.notEqual(next.room.game.id,id);assert.equal(next.room.game.rows.length,0);
const beforeCookie=jars.a;await request('a',{action:'session'});assert.equal(jars.a,beforeCookie);assert.equal((await request('a')).user.id,a.user.id);
jars.forged='__Host-wordmates_guest='+a.user.id;assert.equal((await request('forged')).user,null);await request('forged',{action:'profile',name:'Imposter',userId:a.user.id},'',401);
assert(!JSON.stringify(await request('b')).includes(jars.a.split('=')[1]));
sql.prepare('UPDATE guest_sessions SET expires=0 WHERE user=?').run(a.user.id);assert.equal((await request('a')).user,null);await request('a',{action:'create'},'',401);await request('a',{action:'session'});assert.notEqual((await request('a')).user.id,a.user.id);
console.log('PASS: anonymous guest bootstrap, secure cookies, session persistence, forged/expired session rejection, duplicate letters, dictionary, auth, origin protection, friend requests, room membership, host controls, hidden answers, private guesses, stale writes, six-guess limit, rankings, stats, and rematches.');
